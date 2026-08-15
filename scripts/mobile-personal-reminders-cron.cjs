#!/usr/bin/env node
/** V192: saved dates, Qimen context and personal-goal reminders (every 15 min). */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const DRY = process.argv.includes("--dry");
const ONLY_EMAIL = (process.argv.find((arg) => arg.startsWith("--email=")) || "").slice(8);
const BASE = process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350";

(() => {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
})();

const guard = require("../src/lib/push-guard.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");

function b64url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signSession(user) {
  if (!process.env.AUTH_SECRET) throw new Error("no AUTH_SECRET");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id || null,
    sv: user.session_version || 0,
    iat: now,
    exp: now + 600,
  }));
  const signature = b64url(crypto.createHmac("sha256", process.env.AUTH_SECRET).update(`${head}.${body}`).digest());
  return `${head}.${body}.${signature}`;
}

async function getJson(user, url, init = {}) {
  const token = signSession(user);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `decode_auth=${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function locale(raw) {
  const value = String(raw || "th").toLowerCase();
  if (value === "th") return "th";
  if (value === "zh" || value === "cn" || value.startsWith("zh-")) return "zh";
  return "en";
}

function messages(tokens, category, url, data, build) {
  return (tokens || []).map((token) => {
    const copy = build(locale(token?.locale));
    return {
      tokenId: token?.id,
      deviceToken: token?.device,
      deviceTokenType: token?.deviceType,
      expoToken: token?.expo,
      platform: token?.platform,
      category,
      title: copy.title,
      body: copy.body,
      url,
      data: { ...data, url },
    };
  });
}

async function notify(db, user, category, notice, sentToday) {
  const verdict = guard.mayNotify({
    category,
    prefs: user.has_prefs ? user : null,
    timezone: user.user_timezone,
    sentToday,
  });
  if (!verdict.allow) return { status: "skipped", reason: verdict.reason };
  return delivery.deliver(db, notice, { dry: DRY });
}

async function savedDateNotice(db, user, runAt, sentToday) {
  const row = await db.query(
    `SELECT id,payload
       FROM mobile_saved_dates
      WHERE user_id=$1
        AND (payload#>>'{datetime,start}')::timestamptz > $2::timestamptz
        AND (payload#>>'{datetime,start}')::timestamptz <= $2::timestamptz + interval '24 hours 15 minutes'
      ORDER BY (payload#>>'{datetime,start}')::timestamptz
      LIMIT 1`,
    [user.id, runAt.toISOString()],
  );
  const saved = row.rows[0];
  if (!saved) return { status: "skipped", reason: "no_saved_date_due" };
  const start = new Date(saved.payload?.datetime?.start);
  if (!Number.isFinite(start.getTime())) return { status: "skipped", reason: "bad_saved_date" };
  const remaining = start.getTime() - runAt.getTime();
  const lead = remaining <= 75 * 60_000 ? "1h" : remaining >= 23.75 * 3_600_000 ? "24h" : null;
  if (!lead) return { status: "skipped", reason: "outside_saved_date_window" };
  const activity = String(saved.payload?.activityType || "").slice(0, 32);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: user.user_timezone || "Asia/Bangkok",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(start);
  const build = (loc) => loc === "zh"
    ? { title: lead === "24h" ? "📅 明日有已儲存的吉時" : "⏰ 已儲存的吉時將至", body: `${day}${activity ? ` · ${activity}` : ""}` }
    : loc === "en"
      ? { title: lead === "24h" ? "📅 Saved date tomorrow" : "⏰ Saved time starts soon", body: `${day}${activity ? ` · ${activity}` : ""}` }
      : { title: lead === "24h" ? "📅 พรุ่งนี้มีฤกษ์ที่บันทึกไว้" : "⏰ ฤกษ์ที่บันทึกไว้กำลังมาถึง", body: `${day}${activity ? ` · ${activity}` : ""}` };
  const th = build("th");
  const key = `saved-date|${saved.id}|${lead}`;
  return notify(db, user, "saved_date", {
    userId: user.id,
    key,
    kind: "saved_date",
    title: th.title,
    body: th.body,
    payload: { url: "/datepick/saved", savedDateId: saved.id, lead },
    messages: messages(user.tokens, "saved_date", "/datepick/saved", { savedDateId: saved.id, lead }, build),
  }, sentToday);
}

const DIRECTION = {
  N: { th: "เหนือ", en: "north", zh: "北方" }, NE: { th: "ตะวันออกเฉียงเหนือ", en: "northeast", zh: "東北方" },
  E: { th: "ตะวันออก", en: "east", zh: "東方" }, SE: { th: "ตะวันออกเฉียงใต้", en: "southeast", zh: "東南方" },
  S: { th: "ใต้", en: "south", zh: "南方" }, SW: { th: "ตะวันตกเฉียงใต้", en: "southwest", zh: "西南方" },
  W: { th: "ตะวันตก", en: "west", zh: "西方" }, NW: { th: "ตะวันตกเฉียงเหนือ", en: "northwest", zh: "西北方" },
};

async function qimenNotice(db, user, runAt, sentToday) {
  const minute = guard.localMinutes(user.user_timezone, runAt);
  if (!DRY && (minute === null || minute < 8 * 60 || minute >= 8 * 60 + 15)) {
    return { status: "skipped", reason: "outside_qimen_window" };
  }
  const fresh = user.qimen_location_updated_at
    && runAt.getTime() - new Date(user.qimen_location_updated_at).getTime() <= 30 * 86_400_000;
  if (!fresh || !Number.isFinite(Number(user.qimen_latitude)) || !Number.isFinite(Number(user.qimen_longitude))) {
    return { status: "skipped", reason: "no_fresh_current_location" };
  }
  const date = guard.localDateStr(user.user_timezone, runAt);
  const timeMinutes = minute ?? 8 * 60;
  const time = `${String(Math.floor(timeMinutes / 60)).padStart(2, "0")}:${String(timeMinutes % 60).padStart(2, "0")}`;
  const result = await getJson(user, `${BASE}/api/qimen`, {
    method: "POST",
    body: JSON.stringify({
      date, time,
      lat: Number(user.qimen_latitude), lng: Number(user.qimen_longitude),
      school: "chaibu", system_type: "hour",
    }),
  });
  const palaces = Array.isArray(result?.data?.palaces) ? result.data.palaces
    : Array.isArray(result?.data?.data?.palaces) ? result.data.data.palaces : [];
  const ranked = palaces.map((palace) => ({
    direction: String(palace?.direction || "").toUpperCase(),
    score: Number(palace?.display_score),
  })).filter((row) => DIRECTION[row.direction] && Number.isFinite(row.score)).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 50) return { status: "skipped", reason: "no_qimen_context_highlight" };
  const build = (loc) => ({
    title: loc === "zh" ? "🧭 今日奇門方位" : loc === "en" ? "🧭 Today's Qimen direction" : "🧭 ทิศเด่นจากผังฉีเหมินวันนี้",
    body: loc === "zh"
      ? `${DIRECTION[best.direction].zh} · 此為時盤背景，並非結果保證`
      : loc === "en"
        ? `${DIRECTION[best.direction].en} · Hour-chart context, not a guaranteed outcome`
        : `${DIRECTION[best.direction].th} · เป็นบริบทจากผังยาม ไม่ใช่คำรับประกันผล`,
  });
  const th = build("th");
  return notify(db, user, "qimen", {
    userId: user.id,
    key: `qimen|${date}|08|${best.direction}`,
    kind: "qimen",
    title: th.title,
    body: th.body,
    payload: { url: "/qimen/board", date, direction: best.direction, score: best.score },
    messages: messages(user.tokens, "qimen", "/qimen/board", { date, direction: best.direction }, build),
  }, sentToday);
}

async function goalNotice(db, user, runAt, sentToday) {
  const minute = guard.localMinutes(user.user_timezone, runAt);
  if (!DRY && (minute === null || minute < 8 * 60 + 15 || minute >= 8 * 60 + 30)) {
    return { status: "skipped", reason: "outside_goal_window" };
  }
  const result = await getJson(user, `${BASE}/api/mobile/v1/goals/custom${user.profile_id ? `?profileId=${user.profile_id}` : ""}`);
  const goals = Array.isArray(result?.goals) ? result.goals : [];
  const candidates = goals.filter((goal) => goal?.nextAuspicious?.date).sort((left, right) => {
    const a = `${left.nextAuspicious.date} ${left.nextAuspicious.hourRange || ""}`;
    const b = `${right.nextAuspicious.date} ${right.nextAuspicious.hourRange || ""}`;
    return a.localeCompare(b);
  });
  const goal = candidates[0];
  if (!goal) return { status: "skipped", reason: "no_goal_hour" };
  const next = goal.nextAuspicious;
  const title = String(goal.title || "").slice(0, 60);
  const when = `${next.dayLabel || next.date}${next.hourRange ? ` · ${next.hourRange}` : ""}`;
  const build = (loc) => loc === "zh"
    ? { title: "🎯 目標的下一吉時", body: `${title} · ${when}` }
    : loc === "en"
      ? { title: "🎯 Next auspicious time for your goal", body: `${title} · ${when}` }
      : { title: "🎯 ฤกษ์ถัดไปของเป้าหมาย", body: `${title} · ${when}` };
  const th = build("th");
  const key = `goal|${goal.id}|${next.date}|${next.hourRange || "day"}`;
  return notify(db, user, "goal", {
    userId: user.id,
    key,
    kind: "goal",
    title: th.title,
    body: th.body,
    payload: { url: "/calendar/goals", goalId: goal.id, date: next.date },
    messages: messages(user.tokens, "goal", "/calendar/goals", { goalId: goal.id, date: next.date }, build),
  }, sentToday);
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
  const users = await db.query(`
    SELECT u.id,u.email,u.current_org_id,u.session_version,
           (SELECT p.id FROM profiles p WHERE p.created_by_user_id=u.id
             AND COALESCE(p.is_archived,false)=false ORDER BY p.created_at LIMIT 1) AS profile_id,
           array_agg(json_build_object(
             'id',t.id,'device',t.device_push_token,'deviceType',t.device_token_type,
             'expo',t.expo_push_token,'platform',t.platform,'locale',COALESCE(t.locale,'th')
           )) AS tokens,
           np.security_enabled,np.saved_date_enabled,np.daily_enabled,np.yam_enabled,
           np.qimen_enabled,np.shrine_enabled,np.goal_enabled,np.service_enabled,
           np.quiet_start,np.quiet_end,np.max_per_day,np.paused_until,
           np.qimen_latitude,np.qimen_longitude,np.qimen_location_updated_at,
           COALESCE(np.timezone,max(t.timezone),u.timezone) AS user_timezone,
           (np.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l WHERE l.user_id=u.id
             AND l.delivery_status IN ('accepted','delivered') AND l.sent_at>=now()-interval '24 hours') AS sent_today
      FROM users u
      JOIN mobile_push_tokens t ON t.user_id=u.id AND t.enabled=true
      LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id
     WHERE u.deleted_at IS NULL ${ONLY_EMAIL ? "AND u.email=$1" : ""}
     GROUP BY u.id,np.user_id,np.security_enabled,np.saved_date_enabled,np.daily_enabled,np.yam_enabled,
              np.qimen_enabled,np.shrine_enabled,np.goal_enabled,np.service_enabled,
              np.quiet_start,np.quiet_end,np.max_per_day,np.paused_until,
              np.qimen_latitude,np.qimen_longitude,np.qimen_location_updated_at,
              np.timezone,u.timezone`, ONLY_EMAIL ? [ONLY_EMAIL] : []);
  const runAt = new Date();
  const totals = { accepted: 0, failed: 0, skipped: 0, duplicate: 0 };
  for (const user of users.rows) {
    let sentToday = Number(user.sent_today || 0);
    for (const task of [savedDateNotice, qimenNotice, goalNotice]) {
      try {
        const outcome = await task(db, user, runAt, sentToday);
        if (outcome.status === "accepted" || outcome.status === "dry") {
          totals.accepted += 1;
          sentToday += 1;
        } else if (outcome.status === "failed") totals.failed += 1;
        else if (outcome.status === "duplicate") totals.duplicate += 1;
        else totals.skipped += 1;
      } catch (error) {
        totals.failed += 1;
        console.error(`[mobile-personal-reminders] user=${user.id}`, error.message);
      }
    }
  }
  console.log(`[mobile-personal-reminders] ${DRY ? "DRY " : ""}users=${users.rows.length}`, totals);
  await db.end();
}

main().catch((error) => { console.error("[mobile-personal-reminders]", error); process.exit(1); });
