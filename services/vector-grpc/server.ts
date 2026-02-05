import path from "node:path";

import { Index } from "@upstash/vector";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

// This server intentionally does NOT depend on the Next.js app runtime.
// It is a small standalone gRPC gateway that frontends Upstash Vector.
//
// Env vars reuse the same names as the main app for simplicity.
const VECTOR_URL = process.env.UPSTASH_VECTOR_REST_URL;
const VECTOR_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN;
const PORT = process.env.VECTOR_GRPC_PORT || "50051";

if (!VECTOR_URL || !VECTOR_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn(
    "[vector-grpc] UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN are not set. " +
      "The server will start but requests will fail until they are configured.",
  );
}

const PROTO_PATH = path.join(__dirname, "vector.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vectorProto = grpc.loadPackageDefinition(packageDefinition) as any;

type ChunkMetadata = {
  type?: string;
  source?: string;
  page?: number | null;
  doc_id?: string;
  redis_key?: string;
};

type UpsertRecord = {
  id: string;
  text: string;
  metadata?: ChunkMetadata;
};

function getIndex() {
  if (!VECTOR_URL || !VECTOR_TOKEN) {
    throw new Error(
      "UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN must be set for vector-grpc server",
    );
  }

  return new Index({
    url: VECTOR_URL,
    token: VECTOR_TOKEN,
  });
}

const vectorServiceImpl = {
  // UpsertChunks(UpsertChunksRequest) returns (UpsertChunksResponse)
  async UpsertChunks(
    call: grpc.ServerUnaryCall<{ records?: UpsertRecord[] }, unknown>,
    callback: grpc.sendUnaryData<{ upserted: number; error: string }>,
  ) {
    try {
      const index = getIndex();
      const records = (call.request.records ?? []).map((r) => ({
        id: r.id,
        data: r.text,
        metadata: {
          type: r.metadata?.type,
          source: r.metadata?.source,
          page: r.metadata?.page ?? null,
          docId: r.metadata?.doc_id,
          redisKey: r.metadata?.redis_key,
          text: r.text,
        },
      }));

      if (records.length === 0) {
        callback(null, { upserted: 0, error: "" });
        return;
      }

      await index.upsert(records);
      callback(null, { upserted: records.length, error: "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      callback(null, { upserted: 0, error: message });
    }
  },

  // QueryChunks(QueryChunksRequest) returns (QueryChunksResponse)
  async QueryChunks(
    call: grpc.ServerUnaryCall<
      { query?: string; top_k?: number; docs_only?: boolean },
      unknown
    >,
    callback: grpc.sendUnaryData<{ hits: unknown[] }>,
  ) {
    try {
      const index = getIndex();
      const query = call.request.query ?? "";
      const topK = call.request.top_k && call.request.top_k > 0 ? call.request.top_k : 5;
      const docsOnly = Boolean(call.request.docs_only);

      if (!query) {
        callback(null, { hits: [] });
        return;
      }

      const result = await index.query<{
        type?: string;
        text?: string;
        source?: string;
        page?: number;
        docId?: string;
        redisKey?: string;
      }>({
        data: query,
        topK,
        includeMetadata: true,
      });

      const hits =
        result
          ?.filter((r) => {
            if (!docsOnly) return true;
            const type = r.metadata?.type;
            return type === "doc" || type === undefined;
          })
          .filter((r) => r.metadata?.text && r.metadata.text.length > 0)
          .map((r) => ({
            id: String(r.id),
            score: r.score,
            text: r.metadata?.text ?? "",
            metadata: {
              type: r.metadata?.type ?? "",
              source: r.metadata?.source ?? "",
              page: r.metadata?.page ?? 0,
              doc_id: r.metadata?.docId ?? "",
              redis_key: r.metadata?.redisKey ?? "",
            },
          })) ?? [];

      callback(null, { hits });
    } catch (err) {
      // On error, surface an empty list; callers can decide how to handle it.
      callback(null, { hits: [] });
    }
  },
};

export function startServer() {
  const server = new grpc.Server();
  server.addService(vectorProto.vector.VectorService.service, vectorServiceImpl);

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error("[vector-grpc] Failed to bind server:", err);
        return;
      }

      server.start();
      // eslint-disable-next-line no-console
      console.log(`[vector-grpc] Server listening on 0.0.0.0:${port}`);
    },
  );
}

// If run directly via `tsx services/vector-grpc/server.ts`, start the server.
if (require.main === module) {
  startServer();
}

