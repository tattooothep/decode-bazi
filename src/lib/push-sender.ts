/**
 * push-sender.ts · Web Push Phase C (r380 · 3 ก.ค. 2026)
 * ส่งแจ้งเตือนถึง user ทุกเครื่องที่ subscribe ไว้ (push_subscriptions)
 *
 * กติกา:
 *   - เคารพ notification_prefs รายประเภท (tag → คอลัมน์ pref) · ปิด = ไม่ส่ง
 *   - เคารพ quiet hours (เวลาไทย Asia/Bangkok) → ข้าม + บันทึกลง push_skip_log
 *   - 404/410 (subscription ตาย) → ลบทิ้งทันที · error อื่น → fail_count+1 · เกิน 5 = ปิด (ลบ)
 *   - ห้าม throw ออกไปหา caller (fusion job/cron) — พังเงียบ คืนสรุปผลแทน
 *
 * เฟสถัดไป (ยังไม่ทำ): cron รายวัน day_sniper/daily_omens — ฟังก์ชันพร้อมเรียกได้เลย
 */
import { q } from "@/lib/db";
import { sendMobilePushToUser } from "@/lib/mobile-push";

export type PushMessage = {
  title: string;
  body: string;
  url?: string;   // เปิดเมื่อกด notification (default /today)
  tag?: string;   // ประเภท: fusion_done | day_sniper | daily_omens | promo | test
};

export type SendReport = {
  sent: number;        // ส่งสำเร็จ
  removed: number;     // subscription ตาย (410/404 หรือ fail_count เกิน) ถูกลบ
  failed: number;      // ส่งพลาดชั่วคราว (fail_count+1)
  skipped: string | null; // เหตุที่ไม่ส่งเลย: "pref_off" | "quiet_hours" | "no_subscription" | "no_vapid"
};

/* tag → คอลัมน์ pref ที่ต้องเปิด (test = ยิงหาตัวเองเสมอ ไม่เช็ค pref) */
const TAG_PREF: Record<string, "day_sniper" | "daily_omens" | "fusion_done" | "promo"> = {
  day_sniper: "day_sniper",
  daily_omens: "daily_omens",
  fusion_done: "fusion_done",
  promo: "promo",
};

const MAX_FAIL = 5;

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; fail_count: number };
type PrefRow = {
  day_sniper: boolean; daily_omens: boolean; fusion_done: boolean; promo: boolean;
  quiet_start: number | null; quiet_end: number | null;
};

/* web-push โหลดแบบ lazy (CommonJS) · เทส inject mock ผ่าน __setWebPushForTest */
type WebPushLike = {
  setVapidDetails: (subject: string, pub: string, priv: string) => void;
  sendNotification: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, opts?: Record<string, unknown>) => Promise<unknown>;
};
let _webPush: WebPushLike | null = null;
let _vapidReady = false;

export function __setWebPushForTest(mock: WebPushLike | null): void {
  _webPush = mock;
  _vapidReady = mock ? true : false;
}

async function getWebPush(): Promise<WebPushLike | null> {
  if (_webPush && _vapidReady) return _webPush;
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  const priv = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:tattoothep@gmail.com";
  if (!pub || !priv) return null;
  if (!_webPush) {
    const mod = await import("web-push");
    _webPush = (mod.default || mod) as unknown as WebPushLike;
  }
  try {
    _webPush.setVapidDetails(subject, pub, priv);
    _vapidReady = true;
  } catch {
    return null;
  }
  return _webPush;
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || "";
}

/** ชั่วโมงปัจจุบันเวลาไทย (0-23) · testNowHour ใช้เฉพาะเทส */
function bangkokHour(testNowHour?: number): number {
  if (typeof testNowHour === "number") return testNowHour;
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date());
  return Number(h) % 24;
}

/** อยู่ในช่วงเงียบไหม · รองรับช่วงข้ามเที่ยงคืน (เช่น 22 → 7) · start==end = ไม่ใช้ */
export function inQuietHours(hour: number, quietStart: number | null, quietEnd: number | null): boolean {
  if (quietStart == null || quietEnd == null || quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
  return hour >= quietStart || hour < quietEnd; // ข้ามเที่ยงคืน
}

async function loadPrefs(userId: string): Promise<PrefRow> {
  const rows = await q<PrefRow>(
    `SELECT day_sniper, daily_omens, fusion_done, promo, quiet_start, quiet_end
       FROM notification_prefs WHERE user_id=$1`,
    [userId]
  );
  // ไม่มี row = ค่า default ตาม schema (fusion_done เปิดอย่างเดียว)
  return rows[0] || { day_sniper: false, daily_omens: false, fusion_done: true, promo: false, quiet_start: null, quiet_end: null };
}

async function logSkip(userId: string, tag: string | undefined, reason: string, msg: PushMessage): Promise<void> {
  await q(
    `INSERT INTO push_skip_log (user_id, tag, reason, payload) VALUES ($1,$2,$3,$4)`,
    [userId, tag || null, reason, JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || null })]
  ).catch(() => {});
}

/**
 * ส่ง push ถึงทุกเครื่องของ user
 * @param opts.skipPrefCheck  ข้ามเช็ค pref+quiet (ใช้กับปุ่ม "ทดสอบ" ที่ user กดเอง)
 * @param opts.testNowHour    override ชั่วโมงปัจจุบัน (เทสเท่านั้น)
 */
export async function sendToUser(
  userId: string,
  msg: PushMessage,
  opts: { skipPrefCheck?: boolean; testNowHour?: number } = {}
): Promise<SendReport> {
  const report: SendReport = { sent: 0, removed: 0, failed: 0, skipped: null };
  try {
    if (!opts.skipPrefCheck) {
      const prefs = await loadPrefs(userId);
      const prefCol = msg.tag ? TAG_PREF[msg.tag] : undefined;
      if (prefCol && !prefs[prefCol]) {
        report.skipped = "pref_off";
        return report;
      }
      if (inQuietHours(bangkokHour(opts.testNowHour), prefs.quiet_start, prefs.quiet_end)) {
        report.skipped = "quiet_hours";
        await logSkip(userId, msg.tag, "quiet_hours", msg);
        return report;
      }
    }

    const mobile = await sendMobilePushToUser(userId, msg).catch(() => ({
      accepted: 0,
      failed: 0,
      removed: 0,
      skipped: "no_mobile_subscription" as const,
    }));
    report.sent += mobile.accepted;
    report.failed += mobile.failed;
    report.removed += mobile.removed;

    const subs = await q<SubRow>(
      `SELECT id, endpoint, p256dh, auth, fail_count FROM push_subscriptions WHERE user_id=$1`,
      [userId]
    );
    if (!subs.length) {
      if (!report.sent && !report.failed && !report.removed) report.skipped = "no_subscription";
      return report;
    }

    const wp = await getWebPush();
    if (!wp) {
      if (!report.sent && !report.failed && !report.removed) report.skipped = "no_vapid";
      return report;
    }

    const payload = JSON.stringify({
      title: String(msg.title || "").slice(0, 120),
      body: String(msg.body || "").slice(0, 400),
      url: msg.url || "/today",
      tag: msg.tag || "hourkey",
    });

    for (const s of subs) {
      try {
        await wp.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 6 } // เก็บบน push service สูงสุด 6 ชม.
        );
        report.sent++;
        await q(`UPDATE push_subscriptions SET last_success=now(), fail_count=0 WHERE id=$1`, [s.id]).catch(() => {});
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode || 0;
        if (code === 404 || code === 410) {
          // subscription ตาย (user เพิกถอน/ลบ browser) → ลบทิ้ง
          await q(`DELETE FROM push_subscriptions WHERE id=$1`, [s.id]).catch(() => {});
          report.removed++;
        } else if (s.fail_count + 1 > MAX_FAIL) {
          await q(`DELETE FROM push_subscriptions WHERE id=$1`, [s.id]).catch(() => {});
          report.removed++;
        } else {
          await q(`UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=$1`, [s.id]).catch(() => {});
          report.failed++;
        }
      }
    }
    return report;
  } catch {
    // ห้ามลามไปหา caller (fusion job) — คืนสรุปเท่าที่ทำได้
    return report;
  }
}

/**
 * hook: fusion5 job เสร็จ → แจ้ง "คำพยากรณ์พร้อมแล้ว 🔮"
 * เรียกแบบ fire-and-forget จาก src/app/api/sifu/fusion5/route.ts (จุดเดียว หลัง status='done')
 */
export function notifyFusionDone(userId: string): void {
  void sendToUser(userId, {
    title: "hourkey",
    body: "คำพยากรณ์พร้อมแล้ว 🔮 แตะเพื่อเปิดอ่าน",
    url: "/master-fusion",
    tag: "fusion_done",
  }).catch(() => {});
}
