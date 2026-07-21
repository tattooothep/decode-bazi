import Redis from "ioredis";

type RedisGlobal = typeof globalThis & {
  __hourkeyRedis?: Redis;
};

const redisGlobal = globalThis as RedisGlobal;

function redisUrl(): string {
  return process.env.REDIS_URL || "redis://127.0.0.1:6380";
}

export function getRedis(): Redis {
  if (!redisGlobal.__hourkeyRedis) {
    const client = new Redis(redisUrl(), {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
    });
    client.on("error", (error) => {
      console.error("[redis]", error.message);
    });
    redisGlobal.__hourkeyRedis = client;
  }
  return redisGlobal.__hourkeyRedis;
}
