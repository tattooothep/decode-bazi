#!/usr/bin/env node
/**
 * admin-notify-watcher.mjs · r497 (11 ก.ค. 2026)
 * ยามเฝ้าหลังบ้าน — poll DB ทุก 60 วิ แล้วยิง web push ถึงมือถือแอดมิน
 *
 * เหตุการณ์ (ต้องเปิดใน admin_notify_prefs ก่อนถึงจะส่ง):
 *   user_signup    → users แถวใหม่ (สมัครสมาชิกใหม่)            → เปิด /admin/members
 *   order_paid     → orders สถานะ paid ใหม่ (เติมแพ็คเกจ)         → เปิด /admin/orders
 *   job_fail_spike → hourkey_jobs พัง ≥ N งานใน 10 นาที (ผิดปกติ) → เปิด /admin
 *
 * กติกา:
 *   - อ่านอย่างเดียวบน users/orders/hourkey_jobs (SELECT เท่านั้น — ห้ามแตะโค้ดจ่ายเงิน)
 *   - กันส่งซ้ำด้วย admin_notify_log UNIQUE (event_type, ref_id) — claim ก่อนส่ง
 *     (INSERT ... ON CONFLICT DO NOTHING ไม่คืนแถว = เคยส่งแล้ว ข้าม)
 *   - subscription ตาย (404/410) → ลบทิ้ง แบบเดียวกับ src/lib/push-sender.ts
 *   - มองย้อนหลังแค่ 6 ชม. — เปิดใช้ครั้งแรกจะไม่ blast ข้อมูลเก่า
 *   - พังเงียบเป็นรอบ ๆ (log แล้วรอรอบถัดไป) — ห้ามล้มทั้ง process เพราะเน็ต/DB สะดุด
 *
 * รัน:
 *   node scripts/workers/admin-notify-watcher.mjs              # วนทุก 60 วิ (systemd)
 *   node scripts/workers/admin-notify-watcher.mjs --once       # รอบเดียวแล้วออก
 *   node scripts/workers/admin-notify-watcher.mjs --once --dry-run  # แค่บอกว่าจะส่งอะไร ไม่ยิงจริง ไม่เขียน log
 *
 * systemd: ops/systemd/hourkey-admin-notify.service (operator เปิดเองตอน deploy)
 */
import nextEnv from "@next/env";
import pg from "pg";
import webPush from "web-push";

const { loadEnvConfig } = nextEnv;
if (!process.env.PGUSER || !process.env.VAPID_PUBLIC_KEY) {
  loadEnvConfig(process.cwd(), false, console);
}

const DRY_RUN = process.argv.includes("--dry-run");
const ONCE = process.argv.includes("--once");
const POLL_MS = Math.max(15_000, Number(process.env.ADMIN_NOTIFY_POLL_MS || 60_000));
const LOOKBACK = "6 hours";
const SPIKE_THRESHOLD = Math.max(1, Number(process.env.ADMIN_NOTIFY_FAIL_SPIKE || 3));
const MAX_FAIL = 5; // เท่ากับ push-sender.ts

const db = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 2,
});

let vapidReady = false;
try {
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  const priv = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:tattoothep@gmail.com";
  if (pub && priv) {
    webPush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
  }
} catch (e) {
  console.error(JSON.stringify({ event: "vapid_error", error: e.message }));
}
if (!vapidReady) console.warn(JSON.stringify({ event: "no_vapid", note: "จะ log อย่างเดียว ไม่ส่งจริง" }));

function log(obj) { console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })); }

/** เวลาไทยสั้น ๆ ใส่ใน body */
function thTime(d) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
  } catch { return String(d); }
}

/** แอดมินที่เปิดเหตุการณ์นี้ + subscription ทุกเครื่องของเขา
 *  ลายเซน 1: เช็คซ้ำ "ยังเป็นแอดมิน + บัญชียังใช้ได้" ณ เวลาส่งทุกครั้ง — ถูกถอดสิทธิ์ = หยุดรับทันที */
async function recipients(eventType) {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const r = await db.query(
    `SELECT p.user_id, s.id AS sub_id, s.endpoint, s.p256dh, s.auth, s.fail_count
       FROM admin_notify_prefs p
       JOIN users u ON u.id = p.user_id AND u.is_active AND u.deleted_at IS NULL
       JOIN push_subscriptions s ON s.user_id = p.user_id
      WHERE p.event_type = $1 AND p.enabled
        AND ( lower(u.email) = ANY($2::text[])
              OR EXISTS (SELECT 1 FROM admin_user_roles ur
                          WHERE ur.user_id = p.user_id AND ur.revoked_at IS NULL
                            AND (ur.expires_at IS NULL OR ur.expires_at > now())) )`,
    [eventType, adminEmails]
  );
  return r.rows;
}

/** claim ref กันส่งซ้ำ — true = เราได้สิทธิ์ส่ง · false = เคยส่งแล้ว */
async function claim(eventType, refId, detail) {
  if (DRY_RUN) return true;
  const r = await db.query(
    `INSERT INTO admin_notify_log (event_type, ref_id, detail)
     VALUES ($1, $2, $3) ON CONFLICT (event_type, ref_id) DO NOTHING RETURNING id`,
    [eventType, refId, JSON.stringify(detail || {})]
  );
  return r.rowCount > 0;
}

async function pushTo(subs, payloadObj) {
  const payload = JSON.stringify(payloadObj);
  let sent = 0, removed = 0, failed = 0;
  for (const s of subs) {
    if (DRY_RUN || !vapidReady) { log({ event: "would_send", to: s.user_id, payload: payloadObj }); continue; }
    try {
      await webPush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 6 }
      );
      sent++;
      await db.query(`UPDATE push_subscriptions SET last_success=now(), fail_count=0 WHERE id=$1`, [s.sub_id]).catch(() => {});
    } catch (e) {
      const code = e?.statusCode || 0;
      if (code === 404 || code === 410 || (s.fail_count + 1) > MAX_FAIL) {
        await db.query(`DELETE FROM push_subscriptions WHERE id=$1`, [s.sub_id]).catch(() => {});
        removed++;
      } else {
        await db.query(`UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=$1`, [s.sub_id]).catch(() => {});
        failed++;
      }
    }
  }
  return { sent, removed, failed };
}

/* ── เหตุการณ์ 1: สมัครสมาชิกใหม่ ── */
async function checkSignups() {
  const subs = await recipients("user_signup");
  if (!subs.length) return;
  const rows = await db.query(
    `SELECT id::text AS ref, email, created_at
       FROM users
      WHERE created_at > now() - interval '${LOOKBACK}' AND deleted_at IS NULL
        AND email NOT LIKE '%@example.%'   -- user ทดสอบของ test harness (สร้าง/ลบวนตลอด) — ไม่แจ้ง
      ORDER BY created_at ASC LIMIT 50`
  );
  for (const u of rows.rows) {
    if (!(await claim("user_signup", u.ref, { email: u.email }))) continue;
    const res = await pushTo(subs, {
      title: "สมาชิกใหม่",
      body: `${u.email} สมัครเมื่อ ${thTime(u.created_at)}`,
      url: "/admin/members",
      tag: "admin_user_signup",
    });
    log({ event: "user_signup", ref: u.ref, email: u.email, ...res });
  }
}

/* ── เหตุการณ์ 2: เติมแพ็คเกจ (orders → paid) · อ่านอย่างเดียว ── */
async function checkPaidOrders() {
  const subs = await recipients("order_paid");
  if (!subs.length) return;
  const rows = await db.query(
    `SELECT o.id::text AS ref, o.package_code, o.amount_thb, o.yam_granted,
            coalesce(o.paid_at, o.created_at) AS at, u.email
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
      WHERE o.status = 'paid' AND coalesce(o.paid_at, o.created_at) > now() - interval '${LOOKBACK}'
      ORDER BY 5 ASC LIMIT 50`
  );
  for (const o of rows.rows) {
    if (!(await claim("order_paid", o.ref, { email: o.email, amount_thb: o.amount_thb, package: o.package_code }))) continue;
    const res = await pushTo(subs, {
      title: "มีการชำระเงิน",
      body: `฿${Number(o.amount_thb || 0).toLocaleString("th-TH")} · ${o.package_code || "-"} · ${o.email || "?"} · ${thTime(o.at)}`,
      url: "/admin/orders",
      tag: "admin_order_paid",
    });
    log({ event: "order_paid", ref: o.ref, amount: o.amount_thb, ...res });
  }
}

/* ── เหตุการณ์ 3: งานพังผิดปกติ (≥ N ใน 10 นาที) · กันซ้ำด้วย bucket 10 นาที ── */
async function checkJobFailSpike() {
  const subs = await recipients("job_fail_spike");
  if (!subs.length) return;
  const r = await db.query(
    `SELECT count(*)::int AS n FROM hourkey_jobs
      WHERE status = 'failed' AND updated_at > now() - interval '10 minutes'`
  );
  const n = r.rows[0]?.n || 0;
  if (n < SPIKE_THRESHOLD) return;
  const bucket = Math.floor(Date.now() / 600_000); // ช่อง 10 นาที
  const ref = `spike-${bucket}`;
  if (!(await claim("job_fail_spike", ref, { failed: n }))) return;
  const res = await pushTo(subs, {
    title: "งานล้มเหลวผิดปกติ",
    body: `มีงานพัง ${n} งานใน 10 นาทีล่าสุด — เข้าไปดูหลังบ้าน`,
    url: "/admin",
    tag: "admin_job_fail_spike",
  });
  log({ event: "job_fail_spike", ref, failed: n, ...res });
}

async function tick() {
  try { await checkSignups(); } catch (e) { console.error(JSON.stringify({ event: "err_signup", error: e.message })); }
  try { await checkPaidOrders(); } catch (e) { console.error(JSON.stringify({ event: "err_order", error: e.message })); }
  try { await checkJobFailSpike(); } catch (e) { console.error(JSON.stringify({ event: "err_spike", error: e.message })); }
}

log({ event: "ready", dryRun: DRY_RUN, once: ONCE, pollMs: POLL_MS, vapid: vapidReady, spikeThreshold: SPIKE_THRESHOLD });
await tick();
if (ONCE) {
  await db.end();
  process.exit(0);
}
const timer = setInterval(() => { void tick(); }, POLL_MS);

async function shutdown(signal) {
  log({ event: "shutdown", signal });
  clearInterval(timer);
  await db.end().catch(() => {});
  process.exit(0);
}
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
