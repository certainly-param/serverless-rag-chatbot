import { z } from "zod";

import { withSpan } from "@/lib/observability";
import { getVectorIndex } from "@/lib/upstash";

export const runtime = "nodejs";

const IngestSchema = z.object({
  docId: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  chunks: z
    .array(
      z.object({
        text: z.string().min(1),
        page: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = IngestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { chunks, source } = parsed.data;
  const docId = parsed.data.docId ?? crypto.randomUUID();

  return withSpan(
    "ingest",
    {
      "ingest.chunks": chunks.length,
      "ingest.source": source ?? "unknown",
    },
    async () => {
      const BATCH_SIZE = 50;
      let index;
      try {
        index = getVectorIndex();
      } catch (error) {
        throw error;
      }

      let upserted = 0;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        try {
          const records = batch.map((chunk, j) => ({
            id: `doc:${docId}:${i + j}`,
            data: chunk.text,
            metadata: {
              type: "doc" as const,
              docId,
              source: source ?? `doc:${docId}`,
              page: chunk.page ?? null,
              text: chunk.text,
            },
          }));

          await index.upsert(records);
          upserted += records.length;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("rate") || errorMessage.includes("limit")) {
            return Response.json(
              {
                ok: false,
                error: "Rate limit exceeded",
                message: "Upstash rate limit reached. Please wait a moment and try again.",
                upserted,
              },
              { status: 429 },
            );
          }
          throw error;
        }
      }

      return Response.json({
        ok: true,
        docId,
        upserted,
      });
    }
  );
}

