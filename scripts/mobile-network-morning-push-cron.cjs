#!/usr/bin/env node
/**
 * เวฟ 2 (23 ก.ค. 2569): แจ้งเตือนเช้า "วันนี้ระวังใคร / ใครคือตัวช่วย" จากเครือข่ายดวง
 * 07:05 (หลังดวงเช้า 5 นาที): ไล่ user ที่เปิดแจ้งเตือนรายวัน (mobile_notification_prefs.daily_enabled)
 * และมีคนในเครือข่าย >= 2 คน → เรียก /api/mobile/v1/network (engine จริง pair-reaction-v2 —
 * ห้ามคำนวณเอง ห้ามแต่งคำ) → เลือกคู่หนุนสุด (คะแนนวันสูงสุด) + คู่เสี่ยงสุด (ต่ำสุด)
 * → ถ้าทั้งคู่ |คะแนนวัน| < 20 ให้ข้าม (ไม่ยิงข้อความจืด) → ยิง 1 ข้อความต่อ user ตาม locale ของเครื่อง
 * ข้อความใช้ถ้อยคำจาก engine เท่านั้น: reading (label 3 ภาษา) + guidance.primary_i18n
 * กันซ้ำด้วย mobile_push_log unique(user_id, yam_key) แบบเดียวกับ cron เดิม
 * Usage: node scripts/mobile-network-morning-push-cron.cjs [--dry] [--email=someone@x.com]
 *        [--date=YYYY-MM-DD] [--max=8] [--pool=strongest|listorder]
 *
 * หมายเหตุการจำกัด 8 คน: engine ให้คะแนนทุกคนมาใน request เดียวอยู่แล้ว (ไม่มีค่าใช้จ่ายเพิ่มต่อคน)
 * เราจึงคัด "ผู้เข้าชิง 8 คน" จากผู้ที่คะแนนวันเด็ดขาดที่สุด (|คะแนน| มากสุด) แทนการหั่น 8 คนแรก
 * ตามลำดับรายการ (ซึ่งเป็นลำดับ created_at ไม่เกี่ยวกับความแรง และทำให้คนที่มีดวงเยอะโดนข้ามทั้งที่มีคู่แรงจริง)
 * ถ้าต้องการแบบตัวอักษร (8 คนแรกตามลำดับรายการ) ใช้ --pool=listorder
 */
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { Client } = require("pg");

const DRY = process.argv.includes("--dry");
const ONLY_EMAIL = (process.argv.find((a) => a.startsWith("--email=")) || "").slice(8).trim().toLowerCase();
const DATE_ARG = (process.argv.find((a) => a.startsWith("--date=")) || "").slice(7).trim();
const BASE = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";
const MAX_RAW = Number((process.argv.find((a) => a.startsWith("--max=")) || "").slice(6));
const MAX_PEOPLE = Number.isFinite(MAX_RAW) && MAX_RAW > 0 ? Math.floor(MAX_RAW) : 8; // จำกัด 8 คนต่อ user (กัน cron บวม)
const POOL_MODE = (process.argv.find((a) => a.startsWith("--pool=")) || "--pool=strongest").slice(7);
// ต่ำกว่านี้ทั้งสองฝั่ง = ไม่ยิง (ค่าจริง 20 · --min= ไว้ทดสอบด่านนี้เท่านั้น ห้ามตั้งใน crontab)
const MIN_RAW = Number((process.argv.find((a) => a.startsWith("--min=")) || "").slice(6));
const MIN_ABS_SCORE = Number.isFinite(MIN_RAW) && MIN_RAW > 0 ? Math.floor(MIN_RAW) : 20;
const USER_GAP_MS = 150;       // เว้นจังหวะกันยิง API รัว
/* ⚠️ ข้อเท็จจริงของ engine (ตรวจแล้ว 23 ก.ค.): computePairReactionV2 รับ date แต่ไม่ได้ใช้
 * (ไม่มีชั้นจร/transit ในคะแนนคู่ — network-score-payload ตั้ง transit: 0) คะแนนคู่จึงเท่าเดิมทุกวัน
 * ถ้ากันซ้ำแค่รายวัน ผู้ใช้จะได้ข้อความเดิมเป๊ะทุกเช้า → กันด้วย cooldown ต่อ "คู่เดิม" เพิ่มอีกชั้น
 * (--cooldown=0 เพื่อปิด ถ้าวันหลัง engine มีชั้นจรรายวันแล้ว) */
const COOLDOWN_RAW = Number((process.argv.find((a) => a.startsWith("--cooldown=")) || "").slice(11));
const COOLDOWN_DAYS = Number.isFinite(COOLDOWN_RAW) && COOLDOWN_RAW >= 0 ? Math.floor(COOLDOWN_RAW) : 7;

// โหลด .env.local ของ release (AUTH_SECRET/PG*) — ไม่ log ค่า
(function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
})();

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
/** JWT HS256 โครงเดียวกับ lib/auth signSession (userId/email/orgId/sv) อายุ 10 นาที */
function signSession(user) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("no AUTH_SECRET");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    userId: user.id, email: user.email, orgId: user.current_org_id || null,
    sv: user.session_version || 0, iat: now, exp: now + 600,
  }));
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

async function getJson(user, url) {
  const token = signSession(user);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Cookie: `decode_auth=${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

const push = require("../src/lib/push-send.cjs");

/**
 * ส่งทั้งชุดผ่านตัวส่งกลาง — ส่งตรงถึงกูเกิล ไม่ผ่านคนกลาง
 *
 * 🔴 เดิมยิงไปบริการกลางของ Expo ซึ่ง **480 รอบได้ expo_ok=0 ทุกรอบ**
 * ไม่เคยสำเร็จเลยสักครั้ง เพราะต้องเอากุญแจโครงการไปฝากที่นั่นอีกที
 * ท่อส่งตรงพิสูจน์แล้วว่าถึงเครื่องจริง (30 ก.ค. เจ้าของยืนยันเอง)
 *
 * คืนรูปเดิม {ok, fail} เพื่อไม่ต้องแก้บรรทัดรายงานผลท้ายไฟล์
 * แต่เพิ่ม gone/noToken ให้รู้ว่าเครื่องตายกี่เครื่อง ยังไม่มีกุญแจกี่เครื่อง
 */
async function sendExpo(messages, db) {
  const r = await push.sendAll(messages, { db: db ?? null, dry: DRY });
  if (r.noToken > 0) {
    console.log(`  ℹ️ ${r.noToken} เครื่องยังไม่มีกุญแจแบบส่งตรง (ต้องลงแอพรุ่นใหม่)`);
  }
  if (r.gone > 0) {
    console.log(`  🗑️ ปิดกุญแจเครื่องที่ไม่รับแล้ว ${r.gone} เครื่อง`);
  }
  return { ok: r.sent, fail: r.failed };
}

/* ---------- ถ้อยคำ: กรอบข้อความ 3 ภาษาเท่านั้น · เนื้อคำอ่านมาจาก engine ล้วน ---------- */
const FRAME = {
  th: { title: (d) => `🤝 เครือข่ายวันนี้ (${d})`, ally: "ตัวช่วยวันนี้", risk: "ระวังวันนี้", colon: ": ", open: " (", close: ")" },
  en: { title: (d) => `🤝 Your circle today (${d})`, ally: "Ally today", risk: "Watch out today", colon: ": ", open: " (", close: ")" },
  // zh ใช้เครื่องหมายวรรคตอนจีนล้วน (กฎ 3 ภาษาเข้ม)
  zh: { title: (d) => `🤝 今日人脈（${d}）`, ally: "今日助力", risk: "今日留心", colon: "：", open: "（", close: "）" },
};

function personName(p) {
  return String(p.nickname || p.name || "").trim();
}
function dayScore(p) {
  const v = Number(p && p.scores && p.scores.day);
  return Number.isFinite(v) ? Math.round(v) : null;
}
/** label ปฏิกิริยาจาก engine (reading = labels ของ pair-reaction-v2) — ไม่มีภาษานั้น = ไม่ใส่ */
function readingText(p, loc) {
  const r = p && p.reading;
  if (!r || typeof r !== "object") return "";
  return typeof r[loc] === "string" ? r[loc].trim() : "";
}
/** คำแนะนำจาก engine (guidance.primary_i18n) — th ยอม fallback primary เดิม · en/zh ห้ามใช้ไทย */
function adviceText(p, loc) {
  const g = p && p.guidance;
  if (!g || typeof g !== "object") return "";
  const tri = g.primary_i18n;
  if (tri && typeof tri === "object" && typeof tri[loc] === "string" && tri[loc].trim()) return tri[loc].trim();
  if (loc === "th" && typeof g.primary === "string") return g.primary.trim();
  return "";
}
function lineFor(p, loc, f, headWord) {
  const score = dayScore(p);
  const name = personName(p);
  const bits = [readingText(p, loc), score == null ? "" : `${score > 0 ? "+" : ""}${score}`].filter(Boolean);
  const head = `${headWord}${f.colon}${name}${bits.length ? `${f.open}${bits.join(" · ")}${f.close}` : ""}`;
  const advice = adviceText(p, loc);
  return advice ? `${head} — ${advice}` : head;
}
function buildMessage(loc, ally, risk, thaiDate) {
  const f = FRAME[loc] || FRAME.th;
  const lines = [];
  if (ally) lines.push(lineFor(ally, loc, f, f.ally));
  if (risk) lines.push(lineFor(risk, loc, f, f.risk));
  return { title: f.title(thaiDate), body: lines.join("\n") };
}

async function loadUsers(db) {
  if (ONLY_EMAIL) {
    // โหมดทดสอบ/dry เจาะบัญชีเดียว — ไม่บังคับว่าต้องมี token (ใช้ดูข้อความที่จะยิงเท่านั้น)
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.current_org_id, u.session_version,
              COALESCE((SELECT array_agg(json_build_object('token', t.device_push_token, 'locale', COALESCE(t.locale,'th')))
                          FROM mobile_push_tokens t WHERE t.user_id=u.id AND t.enabled=true), '{}') AS tokens
         FROM users u
        WHERE lower(u.email)=$1 AND u.deleted_at IS NULL`,
      [ONLY_EMAIL]);
    return rows;
  }
  const { rows } = await db.query(`
    SELECT u.id, u.email, u.current_org_id, u.session_version,
           array_agg(json_build_object('token', t.device_push_token, 'locale', COALESCE(t.locale,'th'))) AS tokens,
           np2.yam_enabled, np2.auspicious_enabled, np2.daily_enabled,
           np2.quiet_start, np2.quiet_end, np2.max_per_day,
           COALESCE(np2.timezone, u.timezone) AS user_timezone,
           (np2.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id = u.id AND l.sent_at >= now() - interval '24 hours') AS sent_today
      FROM mobile_push_tokens t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN mobile_notification_prefs np2 ON np2.user_id = u.id
     WHERE t.enabled = true AND u.deleted_at IS NULL
       AND (SELECT count(*) FROM profiles pr
             WHERE pr.created_by_user_id = u.id AND COALESCE(pr.is_archived,false) = false) >= 3
     GROUP BY u.id, np2.user_id, np2.yam_enabled, np2.auspicious_enabled,
              np2.daily_enabled, np2.quiet_start, np2.quiet_end,
              np2.max_per_day, np2.timezone, u.timezone`);
  return rows;
}

const guard = require("../src/lib/push-guard.cjs");

async function main() {
  const db = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();

  const users = await loadUsers(db);
  const thaiNow = new Date(Date.now() + 7 * 3600_000);
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(DATE_ARG) ? DATE_ARG : thaiNow.toISOString().slice(0, 10);
  const thaiDate = `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
  console.log(`[mobile-network-push] ${new Date().toISOString()} date=${dateStr} users=${users.length} dry=${DRY}${ONLY_EMAIL ? ` email=${ONLY_EMAIL}` : ""}`);

  let notified = 0, skipped = 0, failed = 0;
  const messages = [];
  for (const u of users) {
    try {

      /**
       * 🔴 ทุกใบต้องผ่านตัวคุมกลาง (30 ก.ค. 69)
       *
       * เดิมตัวยิงนี้เขียนเงื่อนไขเอง `COALESCE(p.daily_enabled, true)`
       * = คนที่ไม่เคยตั้งค่าถือว่าเปิด → ได้รับโดยไม่เคยกดยินยอม
       * และไม่มีช่วงห้ามรบกวนเลย ยิงกลางดึกได้
       *
       * ตัวคุมกลางบังคับครบ: ยินยอม · ช่วงห้ามรบกวนตามเขตเวลาผู้ใช้ · เพดานต่อวัน
       */
      const verdict = guard.mayNotify({
        category: "daily",
        prefs: u.has_prefs ? u : null,
        timezone: u.user_timezone,
        sentToday: Number(u.sent_today || 0),
      });
      if (!verdict.allow) {
        skipped++;
        if (DRY) console.log(`[DRY] ข้าม ${u.email}: ${verdict.reason}`);
        continue;
      }
      const data = await getJson(u, `${BASE}/api/mobile/v1/network?date=${dateStr}`);
      if (!data || data.ok === false || !Array.isArray(data.people)) { skipped++; continue; }
      const centerId = data.active_profile && data.active_profile.id ? data.active_profile.id : null;
      if (!centerId) { skipped++; continue; }

      // ต้องมีคะแนนวันจาก engine จริง + จำกัดผู้เข้าชิง 8 คนต่อ user
      const scored = data.people.filter((p) => dayScore(p) !== null);
      const pool = POOL_MODE === "listorder"
        ? scored
        : scored.slice().sort((a, b) => Math.abs(dayScore(b)) - Math.abs(dayScore(a)));
      const people = pool.slice(0, MAX_PEOPLE);
      if (people.length < 2) { skipped++; continue; }

      let ally = people[0], risk = people[0];
      for (const p of people) {
        if (dayScore(p) > dayScore(ally)) ally = p;
        if (dayScore(p) < dayScore(risk)) risk = p;
      }
      const allyScore = dayScore(ally), riskScore = dayScore(risk);
      // ห้ามยิงข้อความจืด: ต้องมีอย่างน้อยหนึ่งฝั่งที่แรงพอ
      if (allyScore < MIN_ABS_SCORE && riskScore > -MIN_ABS_SCORE) { skipped++; continue; }
      const allyPick = allyScore >= MIN_ABS_SCORE ? ally : null;
      const riskPick = riskScore <= -MIN_ABS_SCORE && risk !== ally ? risk : null;
      if (!allyPick && !riskPick) { skipped++; continue; }

      const thMsg = buildMessage("th", allyPick, riskPick, thaiDate);
      if (!thMsg.body) { skipped++; continue; }

      const allyId = allyPick ? allyPick.id : null;
      const riskId = riskPick ? riskPick.id : null;
      const recent = COOLDOWN_DAYS > 0
        ? await db.query(
            `SELECT 1 FROM mobile_push_log
              WHERE user_id=$1 AND kind='network'
                AND sent_at > now() - ($2 || ' days')::interval
                AND payload->>'ally_profile_id' IS NOT DISTINCT FROM $3
                AND payload->>'risk_profile_id' IS NOT DISTINCT FROM $4
              LIMIT 1`,
            [u.id, String(COOLDOWN_DAYS), allyId, riskId])
        : { rows: [] };

      const yamKey = `network|morning|${dateStr}|${centerId}`;
      if (DRY) {
        const dup = await db.query(`SELECT 1 FROM mobile_push_log WHERE user_id=$1 AND yam_key=$2`, [u.id, yamKey]);
        console.log(`[DRY] ${u.email} key=${yamKey} already_sent=${dup.rows.length > 0} cooldown_hit=${recent.rows.length > 0} people=${people.length}`);
        for (const loc of ["th", "en", "zh"]) {
          const m = buildMessage(loc, allyPick, riskPick, thaiDate);
          console.log(`[DRY][${loc}] ${m.title}\n${m.body}`);
        }
        notified++;
        continue;
      }

      // คู่เดิมเพิ่งยิงไปในช่วง cooldown → ข้าม (กันข้อความเดิมซ้ำทุกเช้า)
      if (recent.rows.length) { skipped++; continue; }

      // กันยิงซ้ำ pattern เดียวกับ cron เดิม (unique user_id+yam_key)
      const dup = await db.query(
        `INSERT INTO mobile_push_log (user_id, yam_key, kind, title, body, payload)
         VALUES ($1,$2,'network',$3,$4,$5::jsonb)
         ON CONFLICT (user_id, yam_key) DO NOTHING RETURNING id`,
        [u.id, yamKey, thMsg.title, thMsg.body, JSON.stringify({
          url: "hourkey://network", date: dateStr,
          ally_profile_id: allyId, ally_day_score: allyPick ? allyScore : null,
          risk_profile_id: riskId, risk_day_score: riskPick ? riskScore : null,
        })]);
      if (!dup.rows.length) { skipped++; continue; }

      for (const tk of u.tokens || []) {
        const entry = typeof tk === "object" && tk ? tk : { token: tk, locale: "th" };
        if (!entry.token) continue;
        const loc = entry.locale === "en" || entry.locale === "zh" ? entry.locale : "th";
        const m = buildMessage(loc, allyPick, riskPick, thaiDate);
        if (!m.body) continue;
        messages.push({ deviceToken: entry.token, title: m.title, body: m.body, url: "hourkey://network", data: { url: "hourkey://network", network: yamKey } });
      }
      notified++;
    } catch (e) {
      failed++;
      console.error(`[mobile-network-push] user=${u.id} error=${e && e.message ? e.message : e}`);
    }
    if (USER_GAP_MS) await new Promise((r) => setTimeout(r, USER_GAP_MS));
  }

  if (DRY) {
    console.log(`[mobile-network-push] DRY date=${dateStr} users_would_notify=${notified} skipped=${skipped} errors=${failed}`);
  } else {
    const r = await sendExpo(messages, db);
    console.log(`[mobile-network-push] date=${dateStr} users_notified=${notified} skipped=${skipped} errors=${failed} expo_sent=${messages.length} expo_ok=${r.ok} expo_fail=${r.fail}`);
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
