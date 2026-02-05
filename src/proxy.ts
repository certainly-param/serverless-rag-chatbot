import { NextResponse, type NextRequest } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { getRedis, getVectorIndex } from "@/lib/upstash";
import { querySemanticCache } from "@/lib/retrieval";

// Performance tracking (Edge runtime supports performance API)
const performance = globalThis.performance || ({} as Performance);

export const config = {
  matcher: ["/api/chat"],
};

export async function proxy(req: NextRequest) {
  if (req.method !== "POST") return NextResponse.next();

  const startTime = performance.now();

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
    const cacheStart = performance.now();
    const hit = await querySemanticCache(index, query, 0.95);
    const cacheTime = performance.now() - cacheStart;
    
    if (!hit) {
      // Track cache miss
      return NextResponse.next();
    }

    const redis = getRedis();
    const redisStart = performance.now();
    const cached = (await redis.get(hit.redisKey)) as
      | { text?: string; citations?: unknown }
      | null;
    const redisTime = performance.now() - redisStart;

    const text = cached?.text;
    if (!text) return NextResponse.next();
    
    const totalTime = performance.now() - startTime;
    
    // Add performance headers for monitoring
    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
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
      }),
    });
    
    response.headers.set("X-Cache-Hit", "true");
    response.headers.set("X-Response-Time", `${totalTime.toFixed(2)}`);
    response.headers.set("X-Cache-Lookup-Time", `${cacheTime.toFixed(2)}`);
    response.headers.set("X-Redis-Time", `${redisTime.toFixed(2)}`);
    
    return response;

  } catch {
    return NextResponse.next();
  }
}

