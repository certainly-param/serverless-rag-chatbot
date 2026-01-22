import { NextResponse, type NextRequest } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { getRedis, getVectorIndex } from "@/lib/upstash";
import { querySemanticCache } from "@/lib/retrieval";

export const config = {
  matcher: ["/api/chat"],
};

export async function proxy(req: NextRequest) {
  if (req.method !== "POST") return NextResponse.next();

  // Read body (must clone because body can be consumed once)
  let messages: unknown[] | undefined;
  try {
    const body = (await req.clone().json()) as { messages?: unknown[] };
    messages = body.messages;
  } catch {
    return NextResponse.next();
  }

  const last = messages?.[messages.length - 1] as { content?: string } | undefined;
  const query = (last?.content ?? "").toString();
  if (!query) return NextResponse.next();

  try {
    const index = getVectorIndex();
    const hit = await querySemanticCache(index, query, 0.95);
    if (!hit) return NextResponse.next();

    const redis = getRedis();
    const cached = (await redis.get(hit.redisKey)) as
      | { text?: string; citations?: unknown }
      | null;

    const text = cached?.text;
    if (!text) return NextResponse.next();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({
          type: "data-citations",
          id: "citations",
          data: { sources: cached.citations ?? [] },
        });

        const id = "cached-text";
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: text });
        writer.write({ type: "text-end", id });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return NextResponse.next();
  }
}

