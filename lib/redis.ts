import { Redis } from "@upstash/redis";

function hasRedisEnv() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

export const redis = hasRedisEnv() ? Redis.fromEnv() : null;

export function requireRedis() {
  if (!redis) {
    throw new Error(
      "Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  return redis;
}
