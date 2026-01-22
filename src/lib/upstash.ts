import { Redis } from "@upstash/redis";
import { Index } from "@upstash/vector";

import { requiredEnv } from "@/lib/env";

export function getRedis() {
  return new Redis({
    url: requiredEnv("UPSTASH_REDIS_REST_URL"),
    token: requiredEnv("UPSTASH_REDIS_REST_TOKEN"),
  });
}

export function getVectorIndex() {
  const url = requiredEnv("UPSTASH_VECTOR_REST_URL");
  const token = requiredEnv("UPSTASH_VECTOR_REST_TOKEN");
  
  return new Index({
    url,
    token,
  });
}

