/**
 * Rate limiter เบาๆ (in-memory · per-process) · 1 มิ.ย.
 * กันยิงรัวๆ (brute-force login / OTP / spam) · ชั้นแรกพอสำหรับ single-node
 * (scale หลาย node ค่อยย้ายไป Redis · ตอนนี้กันเคสยิงเดารหัสได้จริง)
 *
 * ใช้: const r = rateLimit("login:"+ip+":"+email, 5, 60_000);
 *      if (!r.ok) return 429 (retry หลัง r.retryAfterMs)
 */
type Bucket = { hits: number[]; };
const store = new Map<string, Bucket>();
let _lastSweep = 0;

function sweep(now: number) {
  /* ล้าง bucket เก่าเป็นระยะ กัน memory โต (ทุก 5 นาที) */
  if (now - _lastSweep < 300_000) return;
  _lastSweep = now;
  for (const [k, b] of store) {
    if (!b.hits.length || now - b.hits[b.hits.length - 1] > 3_600_000) store.delete(k);
  }
}

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; remaining: number; retryAfterMs: number } {
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

/** ดึง client IP · ใช้ x-real-ip ที่ nginx ใส่ (=remote_addr peer จริง ปลอมไม่ได้) เป็นหลัก
 * x-forwarded-for ตัวแรก = client ใส่เองได้ (ปลอม IP หนี rate-limit) → fallback ท้ายสุด */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}
