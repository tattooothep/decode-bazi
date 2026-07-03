/**
 * POST /api/account/ping · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * บันทึกอุปกรณ์แบบ best-effort: hk-user-menu.js ยิงครั้งเดียวต่อ browser-session
 * body: { deviceId } (client สุ่มเก็บ localStorage) · เก็บ ua + ip_hash (ไม่เก็บ IP ดิบ)
 * ⚠️ ไม่ใช่ session store จริง — JWT stateless + login route LOCKED จึงบันทึกตอน login ไม่ได้
 *    (อุปกรณ์ที่ไม่เคยเปิดหน้าเว็บหลัง deploy จะไม่โผล่ในรายการ)
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getAccountUser, deviceHash, ipHash, clientIpFrom } from "@/lib/account-utils";

export async function POST(req: Request) {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const rl = rateLimit(`acct-ping:${acc.u.id}`, 60, 3600_000);
  if (!rl.ok) return NextResponse.json({ ok: true, skipped: true });

  const body = await req.json().catch(() => ({}));
  const deviceId = String(body.deviceId ?? "").slice(0, 64);
  const ua = (req.headers.get("user-agent") || "").slice(0, 400);
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const dh = deviceHash(deviceId, ua);
  const ih = ipHash(clientIpFrom(req));
  await q1(
    `INSERT INTO user_devices (user_id, device_hash, ua, ip_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, device_hash)
     DO UPDATE SET last_seen=now(), ua=EXCLUDED.ua, ip_hash=EXCLUDED.ip_hash`,
    [acc.u.id, dh, ua, ih]
  );
  return NextResponse.json({ ok: true });
}
