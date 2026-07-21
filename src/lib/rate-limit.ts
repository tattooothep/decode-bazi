import { createHash } from "crypto";
import { getRedis } from "@/lib/redis";

type Bucket = { hits: number[]; };
const store = new Map<string, Bucket>();
let _lastSweep = 0;

const FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

function sweep(now: number) {
  /* ล้าง bucket เก่าเป็นระยะ กัน memory โต (ทุก 5 นาที) */
  if (now - _lastSweep < 300_000) return;
  _lastSweep = now;
  for (const [k, b] of store) {
    if (!b.hits.length || now - b.hits[b.hits.length - 1] > 3_600_000) store.delete(k);
  }
}

function memoryRateLimit(key: string, max: number, windowMs: number): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  sweep(now);
  let b = store.get(key);
  if (!b) { b = { hits: [] }; store.set(key, b); }
  /* เก็บเฉพาะ hit ในหน้าต่างเวลา */
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= max) {
    const retryAfterMs = windowMs - (now - b.hits[0]);
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }
  b.hits.push(now);
  return { ok: true, remaining: max - b.hits.length, retryAfterMs: 0 };
}

/** Shared limiter for all web instances. Raw email/phone/IP values are hashed
 * before entering Redis. The bounded in-memory path preserves availability if
 * Redis is briefly unavailable. */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<{ ok: boolean; remaining: number; retryAfterMs: number }> {
  const safeMax = Math.max(1, Math.floor(max));
  const safeWindow = Math.max(1_000, Math.floor(windowMs));
  const digest = createHash("sha256").update(key).digest("hex");
  try {
    const redis = getRedis();
    if (redis.status === "wait") await redis.connect();
    const result = await redis.eval(FIXED_WINDOW_SCRIPT, 1, `hk:rl:${digest}`, String(safeWindow)) as [number, number];
    const count = Number(result[0]);
    const ttl = Math.max(0, Number(result[1]));
    return {
      ok: count <= safeMax,
      remaining: Math.max(0, safeMax - count),
      retryAfterMs: count <= safeMax ? 0 : ttl,
    };
  } catch (error) {
    console.error("[rate-limit] redis fallback", error instanceof Error ? error.message : error);
    return memoryRateLimit(digest, safeMax, safeWindow);
  }
}

/** ดึง client IP · ใช้ x-real-ip ที่ nginx ใส่ (=remote_addr peer จริง ปลอมไม่ได้) เป็นหลัก
 * x-forwarded-for ตัวแรก = client ใส่เองได้ (ปลอม IP หนี rate-limit) → fallback ท้ายสุด */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}
