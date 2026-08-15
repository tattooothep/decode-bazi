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
const science = require("../src/lib/notification-science.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");

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
      locale: locale(token?.locale),
      title: copy.title,
      body: copy.body,
      url,
      data,
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

function buildSavedDateCopy(lead, day, activity, loc) {
  if (loc === "zh") return {
    title: lead === "24h" ? "📅 明日有已儲存的吉時" : "⏰ 已儲存的吉時將至",
    body: `${day}${activity ? ` · ${activity}` : ""} · 開啟已儲存日期查看詳情`,
  };
  if (loc === "en") return {
    title: lead === "24h" ? "📅 Saved date tomorrow" : "⏰ Saved time starts soon",
    body: `${day}${activity ? ` · ${activity}` : ""} · Open Saved Dates to review`,
  };
  return {
    title: lead === "24h" ? "📅 พรุ่งนี้มีฤกษ์ที่บันทึกไว้" : "⏰ ฤกษ์ที่บันทึกไว้กำลังมาถึง",
    body: `${day}${activity ? ` · ${activity}` : ""} · เปิดวันที่บันทึกเพื่อดูรายละเอียด`,
  };
}

function buildSavedDateProducer(user, saved, runAt) {
  const start = new Date(saved?.payload?.datetime?.start);
  if (!user?.id || !saved?.id || !Number.isFinite(start.valueOf())) return null;
  const remaining = start.valueOf() - runAt.valueOf();
  const lead = remaining >= 45 * 60_000 && remaining <= 75 * 60_000 ? "1h"
    : remaining >= 23.75 * 3_600_000 && remaining <= 24.25 * 3_600_000 ? "24h" : null;
  if (!lead) return null;
  const activity = String(saved.payload?.activityType || "").slice(0, 32);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: user.user_timezone || "Asia/Bangkok",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(start);
  const build = (locale) => buildSavedDateCopy(lead, day, activity, locale);
  const historyCopies = delivery.localizedHistoryCopies(build);
  const date = guard.localDateStr(user.user_timezone, start);
  const payload = notificationPayload.buildNotificationPayload("saved_date", String(user.id), {
    savedDateId: saved.id, lead: lead === "1h" ? 60 : 1_440, date, url: "/datepick/saved",
  });
  return {
    userId: user.id, key: `saved-date|${saved.id}|${lead}`, kind: "saved_date",
    ...historyCopies.th, historyCopies, payload,
    sourceFacts: { timezone: user.user_timezone, start: start.toISOString(), activityType: activity || null },
    messages: messages(user.tokens, "saved_date", "/datepick/saved", payload, build),
  };
}

async function savedDateNotice(db, user, runAt, sentToday) {
  const row = await db.query(
    `SELECT id,payload
       FROM mobile_saved_dates
      WHERE user_id=$1 AND org_id=$2
        AND (
          (payload#>>'{datetime,start}')::timestamptz BETWEEN $3::timestamptz + interval '45 minutes' AND $3::timestamptz + interval '75 minutes'
          OR (payload#>>'{datetime,start}')::timestamptz BETWEEN $3::timestamptz + interval '23 hours 45 minutes' AND $3::timestamptz + interval '24 hours 15 minutes'
        )
      ORDER BY (payload#>>'{datetime,start}')::timestamptz
      LIMIT 1`,
    [user.id, user.current_org_id, runAt.toISOString()],
  );
  const saved = row.rows[0];
  if (!saved) return { status: "skipped", reason: "no_saved_date_due" };
  const notice = buildSavedDateProducer(user, saved, runAt);
  if (!notice) return { status: "skipped", reason: "outside_saved_date_window" };
  return notify(db, user, "saved_date", notice, sentToday);
}

const DIRECTION = {
  N: { th: "เหนือ", en: "north", zh: "北方" }, NE: { th: "ตะวันออกเฉียงเหนือ", en: "northeast", zh: "東北方" },
  E: { th: "ตะวันออก", en: "east", zh: "東方" }, SE: { th: "ตะวันออกเฉียงใต้", en: "southeast", zh: "東南方" },
  S: { th: "ใต้", en: "south", zh: "南方" }, SW: { th: "ตะวันตกเฉียงใต้", en: "southwest", zh: "西南方" },
  W: { th: "ตะวันตก", en: "west", zh: "西方" }, NW: { th: "ตะวันตกเฉียงเหนือ", en: "northwest", zh: "西北方" },
};

function buildQimenCopy(best, loc) {
  return {
    title: loc === "zh" ? "🧭 今日奇門方位" : loc === "en" ? "🧭 Today's Qimen direction" : "🧭 ทิศเด่นจากผังฉีเหมินวันนี้",
    body: loc === "zh"
      ? `${DIRECTION[best.direction].zh} · 分數 ${best.score} · 開啟奇門盤查看時盤背景；並非結果保證`
      : loc === "en"
        ? `${DIRECTION[best.direction].en} · score ${best.score} · Open the Qimen board for hour-chart context; outcomes are not guaranteed`
        : `${DIRECTION[best.direction].th} · คะแนน ${best.score} · เปิดผังฉีเหมินเพื่อดูบริบทของยาม ไม่ใช่คำรับประกันผล`,
  };
}

function buildQimenProducer(user, request, result) {
  const palaces = Array.isArray(result?.data?.palaces) ? result.data.palaces
    : Array.isArray(result?.data?.data?.palaces) ? result.data.data.palaces : [];
  const ranked = palaces.map((palace) => ({
    direction: String(palace?.direction || "").toUpperCase(), score: Number(palace?.display_score),
  })).filter((row) => DIRECTION[row.direction] && Number.isFinite(row.score)).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!user?.id || !best || best.score < 50) return null;
  const build = (locale) => buildQimenCopy(best, locale);
  const historyCopies = delivery.localizedHistoryCopies(build);
  const payload = notificationPayload.buildNotificationPayload("qimen", String(user.id), {
    date: request.date, direction: best.direction, score: best.score, url: "/qimen/board",
  });
  return {
    userId: user.id, key: `qimen|${request.date}|${String(request.time || "").slice(0, 2)}|${best.direction}`,
    kind: "qimen", ...historyCopies.th, historyCopies, payload,
    sourceFacts: {
      timezone: request.timezone, instant: request.instant, latitude: request.lat, longitude: request.lng,
      direction: best.direction, score: best.score, engine: "qimen-api",
    },
    messages: messages(user.tokens, "qimen", "/qimen/board", payload, build),
  };
}

async function qimenNotice(db, user, runAt, sentToday) {
  if (user.qimen_enabled !== true) return { status: "skipped", reason: "qimen_disabled" };
  const minute = guard.localMinutes(user.user_timezone, runAt);
  if (!DRY && (minute === null || minute < 8 * 60 || minute >= 8 * 60 + 15)) {
    return { status: "skipped", reason: "outside_qimen_window" };
  }
  const fresh = user.qimen_location_updated_at
    && runAt.getTime() - new Date(user.qimen_location_updated_at).getTime() <= 30 * 86_400_000;
  if (!fresh || !Number.isFinite(Number(user.qimen_latitude)) || !Number.isFinite(Number(user.qimen_longitude))) {
    return { status: "skipped", reason: "no_fresh_current_location" };
  }
  const request = science.buildQimenSchedulerRequest({
    timezone: user.user_timezone,
    instant: runAt,
    latitude: user.qimen_latitude,
    longitude: user.qimen_longitude,
  });
  const { date, time } = request;
  const result = await getJson(user, `${BASE}/api/qimen`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  const notice = buildQimenProducer(user, request, result);
  if (!notice) return { status: "skipped", reason: "no_qimen_context_highlight" };
  return notify(db, user, "qimen", notice, sentToday);
}

function formatGoalDayLabel(date, loc) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf())) return String(date || "");
  const localeName = loc === "zh" ? "zh-TW" : loc === "th" ? "th-TH" : "en-GB";
  return new Intl.DateTimeFormat(localeName, {
    timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).format(parsed);
}

function buildGoalCopy(goal, loc) {
  const next = goal.nextAuspicious;
  const title = String(goal.title || "").slice(0, 60);
  const day = formatGoalDayLabel(next.date, loc);
  const when = `${day}${next.hourRange ? ` · ${next.hourRange}` : ""}`;
  if (loc === "zh") return { title: "🎯 目標的下一吉時", body: `${title} · ${when} · 開啟目標查看建議` };
  if (loc === "en") return { title: "🎯 Next auspicious time for your goal", body: `${title} · ${when} · Open Goals to review the recommendation` };
  return { title: "🎯 ฤกษ์ถัดไปของเป้าหมาย", body: `${title} · ${when} · เปิดเป้าหมายเพื่อดูคำแนะนำ` };
}

function buildGoalProducer(user, result) {
  const goals = Array.isArray(result?.goals) ? result.goals : [];
  const candidates = goals.filter((goal) => goal?.nextAuspicious?.date).sort((left, right) => {
    const a = `${left.nextAuspicious.date} ${left.nextAuspicious.hourRange || ""}`;
    const b = `${right.nextAuspicious.date} ${right.nextAuspicious.hourRange || ""}`;
    return a.localeCompare(b);
  });
  const goal = candidates[0];
  if (!user?.id || !goal) return null;
  const next = goal.nextAuspicious;
  const build = (locale) => buildGoalCopy(goal, locale);
  const historyCopies = delivery.localizedHistoryCopies(build);
  const payload = notificationPayload.buildNotificationPayload("goal", String(user.id), {
    goalId: goal.id, date: next.date, url: "/calendar/goals",
  });
  return {
    userId: user.id, key: `goal|${goal.id}|${next.date}|${next.hourRange || "day"}`, kind: "goal",
    ...historyCopies.th, historyCopies, payload,
    sourceFacts: {
      profileId: goal.profileId, date: next.date, hourRange: next.hourRange || null,
      score: next.score, engine: "auspicious", engineVersion: result.engineVersion || null,
    },
    messages: messages(user.tokens, "goal", "/calendar/goals", payload, build),
  };
}

async function goalNotice(db, user, runAt, sentToday) {
  const minute = guard.localMinutes(user.user_timezone, runAt);
  if (!DRY && (minute === null || minute < 8 * 60 + 15 || minute >= 8 * 60 + 30)) {
    return { status: "skipped", reason: "outside_goal_window" };
  }
  const goalQuery = new URLSearchParams({
    timezone: user.user_timezone || guard.FALLBACK_TZ,
    instant: runAt.toISOString(),
  });
  const result = await getJson(user, `${BASE}/api/mobile/v1/goals/custom?${goalQuery}`);
  const notice = buildGoalProducer(user, result);
  if (!notice) return { status: "skipped", reason: "no_goal_hour" };
  return notify(db, user, "goal", notice, sentToday);
}

function personalUsersSql(onlyEmail = false) {
  return `
    SELECT u.id,u.email,u.current_org_id,u.session_version,
           array_agg(json_build_object(
             'id',t.id,'device',t.device_push_token,'deviceType',t.device_token_type,
             'expo',t.expo_push_token,'platform',t.platform,'locale',COALESCE(t.locale,'th')
           )) AS tokens,
           np.security_enabled,np.saved_date_enabled,np.daily_enabled,np.yam_enabled,
           np.qimen_enabled,np.shrine_enabled,np.goal_enabled,np.service_enabled,
           np.quiet_start,np.quiet_end,np.max_per_day,np.paused_until,
           CASE WHEN np.qimen_enabled=true THEN np.qimen_latitude END AS qimen_latitude,
           CASE WHEN np.qimen_enabled=true THEN np.qimen_longitude END AS qimen_longitude,
           CASE WHEN np.qimen_enabled=true THEN np.qimen_location_updated_at END AS qimen_location_updated_at,
           COALESCE(np.timezone,max(t.timezone),u.timezone) AS user_timezone,
           (np.user_id IS NOT NULL) AS has_prefs,
           (SELECT count(*) FROM mobile_push_log l
             WHERE l.user_id=u.id AND l.delivery_status IN ('accepted','delivered')
               AND (COALESCE(l.sent_at,l.accepted_at,l.updated_at) AT TIME ZONE COALESCE(np.timezone,u.timezone,'Asia/Bangkok'))::date
                   = (now() AT TIME ZONE COALESCE(np.timezone,u.timezone,'Asia/Bangkok'))::date) AS sent_today
      FROM users u
      JOIN mobile_push_tokens t ON t.user_id=u.id AND t.enabled=true
      LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id
     WHERE u.deleted_at IS NULL ${onlyEmail ? "AND u.email=$1" : ""}
     GROUP BY u.id,np.user_id,np.security_enabled,np.saved_date_enabled,np.daily_enabled,np.yam_enabled,
              np.qimen_enabled,np.shrine_enabled,np.goal_enabled,np.service_enabled,
              np.quiet_start,np.quiet_end,np.max_per_day,np.paused_until,
              np.qimen_latitude,np.qimen_longitude,np.qimen_location_updated_at,
              np.timezone,u.timezone`;
}

async function loadPersonalUsers(db, onlyEmail = "") {
  return db.query(personalUsersSql(Boolean(onlyEmail)), onlyEmail ? [onlyEmail] : []);
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
  const runLease = await delivery.trySchedulerRunLease(db, "personal-reminders");
  if (!runLease.acquired) { console.log("[mobile-personal-reminders] overlap skipped"); await db.end(); return; }
  const users = await loadPersonalUsers(db, ONLY_EMAIL);
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
        console.error("[mobile-personal-reminders] category=personal error_code=task_failed");
      }
    }
  }
  console.log(`[mobile-personal-reminders] ${DRY ? "DRY " : ""}users=${users.rows.length}`, totals);
  await runLease.release();
  await db.end();
}

module.exports = {
  buildGoalCopy,buildGoalProducer,buildQimenCopy,buildQimenProducer,buildSavedDateCopy,buildSavedDateProducer,formatGoalDayLabel,getJson,
  goalNotice,loadPersonalUsers,main,personalUsersSql,qimenNotice,savedDateNotice,
};

if (require.main === module) main().catch(() => { console.error("[mobile-personal-reminders] category=personal error_code=scheduler_failed"); process.exit(1); });
