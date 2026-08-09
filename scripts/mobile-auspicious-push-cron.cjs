/**
 * แจ้งเตือนวันไหว้เจ้า / เทศกาลจีน — เตือนล่วงหน้าหนึ่งวัน
 *
 * ── ที่มา (เจ้าของถามเอง 30 ก.ค. 69) ────────────────────────
 * "ทำฟีเจอร์มงคลหน่อย เตือนพวกวันไหว้เจ้าด้วยดีมั๊ย"
 *
 * ช่องตั้งค่า `auspicious_enabled` มีอยู่ในระบบตั้งแต่แรก
 * และหน้าแอพเขียนไว้ว่า "เริ่มใช้เร็ว ๆ นี้" — แต่ไม่เคยมีใครเขียนตัวยิง
 *
 * ── ทำไมเตือนล่วงหน้าหนึ่งวัน ───────────────────────────────
 * ของไหว้ต้องซื้อต้องเตรียม บอกตอนเช้าวันไหว้ = สายไปแล้ว
 * ประโยชน์ทั้งหมดของฟีเจอร์นี้อยู่ที่ "เตรียมทัน"
 *
 * ── 🔴 ขอบเขตที่ห้ามข้าม ────────────────────────────────────
 * บอกได้แค่ **"พรุ่งนี้เป็นวันอะไร"** ซึ่งเป็นข้อเท็จจริงของปฏิทิน
 * ห้ามทำนายผลลัพธ์ · ห้ามบอกว่าไหว้แล้วได้อะไร ไม่ไหว้แล้วเป็นอะไร
 * ห้ามใช้ความกลัวเป็นเหตุให้เปิดแอพ
 * (ผู้ใช้กลุ่มนี้เชื่อจริงและทำตามจริง ขู่เมื่อไรเขาทำตามจริง)
 *
 * รัน: node scripts/mobile-auspicious-push-cron.cjs [--dry] [--email=x]
 */

const path = require("path");
const fs = require("fs");
const { Client } = require("pg");

const DRY = process.argv.includes("--dry");
const ONLY_EMAIL = (process.argv.find((a) => a.startsWith("--email=")) || "").slice(8);

// อ่านค่าตั้งค่าเครื่องแบบเดียวกับตัวยิงตัวอื่น
(() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* ไม่มีไฟล์ก็ใช้ค่าจากสภาพแวดล้อม */ }
})();

const guard = require("../src/lib/push-guard.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const { upcomingFestival } = require("../src/lib/festival-days.cjs");

/**
 * ข้อความ 3 ภาษา
 *
 * 🔴 ทุกใบต้องมี "แล้ววันนี้ทำอะไรได้" — บอกว่าเป็นวันอะไรเฉยๆ ไม่พอ
 * กติกาที่หน่วยตรวจตำราวางไว้: ข้อความที่บอกแต่วัน ไม่บอกทางออก = ห้ามส่ง
 */
const COPY = {
  th: {
    tomorrow: (name) => `🙏 พรุ่งนี้${name}`,
    ancestor: "วันไหว้บรรพบุรุษ — เตรียมของไหว้วันนี้ได้",
    worship: "วันไหว้เจ้า — เตรียมของไหว้วันนี้ได้",
    festival: "เทศกาลจีน — ดูรายละเอียดในแอพ",
  },
  en: {
    tomorrow: (name) => `🙏 Tomorrow: ${name}`,
    ancestor: "Ancestor offering day — you can prepare today",
    worship: "Temple offering day — you can prepare today",
    festival: "Chinese festival — see details in the app",
  },
  zh: {
    tomorrow: (name) => `🙏 明日${name}`,
    ancestor: "祭祖之日 — 今日可先備供品",
    worship: "拜神之日 — 今日可先備供品",
    festival: "華人節慶 — 詳見應用內",
  },
};

function pickLocale(raw) {
  const v = String(raw || "th").toLowerCase();
  if (v === "th") return "th";
  if (v === "zh" || v === "cn" || v.startsWith("zh-")) return "zh";
  return "en";
}

function buildMessage(festival, locale) {
  const c = COPY[locale] || COPY.th;
  const name = locale === "zh" ? festival.zh : locale === "en" ? festival.en : festival.th;
  return {
    title: c.tomorrow(name),
    body: c[festival.kind] || c.festival,
  };
}

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await db.connect();

  const { rows: users } = await db.query(`
    SELECT u.id, u.email,
           array_agg(json_build_object(
             'id', t.id,
             'device', t.device_push_token,
             'deviceType', t.device_token_type,
             'expo', t.expo_push_token,
             'platform', t.platform,
             'locale', COALESCE(t.locale, 'th')
           )) AS tokens,
           np.yam_enabled, np.auspicious_enabled, np.daily_enabled, np.shrine_enabled,
           np.quiet_start, np.quiet_end, np.max_per_day, np.paused_until,
           COALESCE(np.timezone, u.timezone) AS user_timezone,
           (np.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id = u.id AND l.delivery_status='accepted'
               AND l.sent_at >= now() - interval '24 hours') AS sent_today
      FROM mobile_push_tokens t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np ON np.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
       ${ONLY_EMAIL ? "AND u.email = $1" : ""}
     GROUP BY u.id, np.user_id, np.yam_enabled, np.auspicious_enabled,
              np.daily_enabled, np.shrine_enabled, np.quiet_start, np.quiet_end, np.paused_until,
              np.max_per_day, np.timezone, u.timezone`,
    ONLY_EMAIL ? [ONLY_EMAIL] : []);

  console.log(`[mobile-auspicious-push] ${new Date().toISOString()} users=${users.length} dry=${DRY}`);

  const runAt = new Date();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const u of users) {
    try {
      const localNowMin = guard.localMinutes(u.user_timezone, runAt);
      if (!DRY && (localNowMin === null || localNowMin < 18 * 60 || localNowMin >= 18 * 60 + 15)) {
        skipped++;
        continue;
      }
      // ทุกใบต้องผ่านตัวคุมกลาง — ยินยอม · ช่วงห้ามรบกวน · เพดานต่อวัน
      const verdict = guard.mayNotify({
        category: "shrine",
        prefs: u.has_prefs ? u : null,
        timezone: u.user_timezone,
        sentToday: Number(u.sent_today || 0),
      });
      if (!verdict.allow) {
        skipped++;
        if (DRY) console.log(`[DRY] ข้าม ${u.email}: ${verdict.reason}`);
        continue;
      }

      // วันตามปฏิทินของผู้ใช้คนนี้ — วันไหว้เลื่อนตามเขตเวลาจริง
      const today = guard.localDateStr(u.user_timezone, runAt);
      const ahead = upcomingFestival(today, 1);
      if (ahead === null) { skipped++; continue; }

      // วันหนึ่งอาจมีหลายรายการ — เอาตัวที่สำคัญที่สุดใบเดียว ไม่ยิงซ้อน
      const festival = ahead.festivals.find((f) => f.major) || ahead.festivals[0];

      const key = `festival|${ahead.date}|${festival.zh}`;
      const first = buildMessage(festival, pickLocale(u.tokens?.[0]?.locale));
      const userMessages = [];
      for (const entry of u.tokens || []) {
        const m = buildMessage(festival, pickLocale(entry?.locale));
        userMessages.push({
          tokenId: entry?.id,
          deviceToken: entry?.device,
          deviceTokenType: entry?.deviceType,
          expoToken: entry?.expo,
          platform: entry?.platform,
          category: "shrine",
          title: m.title,
          body: m.body,
          url: "/calendar/general",
          data: { url: "/calendar/general", date: ahead.date },
        });
      }
      const result = await delivery.deliver(db, {
        userId: u.id,
        key,
        kind: "shrine",
        title: first.title,
        body: first.body,
        payload: { url: "/calendar/general", date: ahead.date, festival: festival.zh },
        messages: userMessages,
      }, { dry: DRY });
      if (result.status === "accepted" || result.status === "dry") sent++;
      else if (result.status === "failed") failed++;
      else skipped++;
      if (DRY) console.log(`[DRY] ${u.email} → ${first.title} · ${first.body}`);
    } catch (e) {
      console.error(`[mobile-auspicious-push] user=${u.id}`, e.message);
    }
  }

  console.log(`[mobile-auspicious-push] ${DRY ? "DRY " : ""}accepted=${sent} failed=${failed} skipped=${skipped}`);

  await db.end();
}

main().catch((e) => { console.error("[mobile-auspicious-push]", e); process.exit(1); });
