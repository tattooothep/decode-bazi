/**
 * บันทึก IP/device hash ตอนสมัคร — ให้หลังบ้านเห็นซ้ำได้
 * ไม่บล็อกสมัคร · ไม่เก็บ IP ดิบ (PDPA)
 */
import { q1 } from "@/lib/db";
import { deviceHash, ipHash } from "@/lib/account-utils";
import { clientIp } from "@/lib/rate-limit";

export async function recordSignupFingerprint(opts: {
  userId: string;
  request?: Request | null;
  deviceId?: unknown;
}): Promise<void> {
  if (!opts.userId) return;
  try {
    const req = opts.request || undefined;
    const ua = (req?.headers.get("user-agent") || "").slice(0, 400);
    const ip = req ? clientIp(req) : "";
    const ih = ip && ip !== "unknown" ? ipHash(ip) : "";
    const rawDev = String(opts.deviceId ?? "").trim().slice(0, 64);
    const dh = rawDev ? deviceHash(rawDev, ua || "unknown") : "";

    if (!ih && !dh && !ua) return;

    await q1(
      `UPDATE users SET
         signup_ip_hash = COALESCE(NULLIF($2, ''), signup_ip_hash),
         signup_device_hash = COALESCE(NULLIF($3, ''), signup_device_hash),
         signup_ua = COALESCE(NULLIF($4, ''), signup_ua)
       WHERE id = $1`,
      [opts.userId, ih || null, dh || null, ua || null]
    );

    // โผล่ในแท็บ Devices ด้วย (best-effort)
    if (dh) {
      await q1(
        `INSERT INTO user_devices (id, user_id, device_hash, ua, ip_hash, first_seen, last_seen)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())
         ON CONFLICT (user_id, device_hash)
         DO UPDATE SET last_seen = now(),
                       ua = COALESCE(EXCLUDED.ua, user_devices.ua),
                       ip_hash = COALESCE(NULLIF(EXCLUDED.ip_hash, ''), user_devices.ip_hash)`,
        [opts.userId, dh, ua || null, ih || null]
      ).catch(() => null);
    }
  } catch (e) {
    console.warn(
      "[signup-fingerprint]",
      e instanceof Error ? e.message : String(e)
    );
  }
}
