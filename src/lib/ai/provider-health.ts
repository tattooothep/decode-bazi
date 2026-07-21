import { getRedis } from "@/lib/redis";

const FAILURE_WINDOW_SECONDS = 300;
const OPEN_SECONDS = 60;
const FAILURE_THRESHOLD = 3;

function cleanProvider(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 80);
}

export async function providerAvailable(provider: string): Promise<boolean> {
  try {
    const redis = getRedis();
    if (redis.status === "wait") await redis.connect();
    return (await redis.exists(`hk:provider:open:${cleanProvider(provider)}`)) === 0;
  } catch {
    return true;
  }
}

export async function recordProviderSuccess(provider: string): Promise<void> {
  try {
    const redis = getRedis();
    if (redis.status === "wait") await redis.connect();
    await redis.del(`hk:provider:fail:${cleanProvider(provider)}`);
  } catch {}
}

export async function recordProviderFailure(provider: string): Promise<void> {
  try {
    const redis = getRedis();
    if (redis.status === "wait") await redis.connect();
    const key = `hk:provider:fail:${cleanProvider(provider)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, FAILURE_WINDOW_SECONDS);
    if (count >= FAILURE_THRESHOLD) {
      await redis.set(`hk:provider:open:${cleanProvider(provider)}`, "1", "EX", OPEN_SECONDS);
    }
  } catch {}
}

export async function runWithProviderCircuit<T>(provider: string, run: () => Promise<T>): Promise<T> {
  if (!(await providerAvailable(provider))) throw new Error(`${provider}_circuit_open`);
  try {
    const result = await run();
    await recordProviderSuccess(provider);
    return result;
  } catch (error) {
    await recordProviderFailure(provider);
    throw error;
  }
}
