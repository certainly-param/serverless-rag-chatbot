import type { Index } from "@upstash/vector";

export type RetrievedChunk = {
  id: string;
  score: number;
  text: string;
  source?: string;
  page?: number;
};

type ChunkMetadata = {
  type?: "doc" | "cache";
  text?: string;
  source?: string;
  page?: number;
  // cache-only
  redisKey?: string;
};

/**
 * Query documents using Upstash's built-in embedding.
 * No external embedding API calls needed - Upstash handles it automatically.
 */
export async function queryDocs(
  index: Index,
  query: string,
  topK = 5,
): Promise<RetrievedChunk[]> {
  try {
    // Use `data` parameter for text-based query - Upstash embeds automatically
    const result = await index.query<ChunkMetadata>({
      data: query, // Upstash will embed this using the index's configured model
      topK,
      includeMetadata: true,
    });

    const filtered = (result ?? [])
      .filter((r) => {
        const type = r.metadata?.type;
        return type !== "cache";
      })
      .map((r) => ({
        id: String(r.id),
        score: r.score,
        text: r.metadata?.text ?? "",
        source: r.metadata?.source,
        page: r.metadata?.page,
      }))
      .filter((r) => r.text.length > 0);

    return filtered;
  } catch (error) {
    throw error;
  }
}

export type CacheHit = {
  score: number;
  redisKey: string;
};

/**
 * Query semantic cache using Upstash's built-in embedding.
 */
export async function querySemanticCache(
  index: Index,
  query: string,
  threshold = 0.95,
): Promise<CacheHit | null> {
  // Use `data` parameter for text-based query
  const result = await index.query<ChunkMetadata>({
    data: query,
    topK: 1,
    includeMetadata: true,
    filter: "type = 'cache'",
  });

  const hit = result?.[0];
  if (!hit?.metadata?.redisKey) return null;
  if (hit.score < threshold) return null;

  return { score: hit.score, redisKey: hit.metadata.redisKey };
}

