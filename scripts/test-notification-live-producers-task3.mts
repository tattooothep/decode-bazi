import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";
import { resolveNotificationPayload } from "../../hourkey-v197-mobile/src/navigation/notificationPayload.ts";

const require = createRequire(import.meta.url);
const yam = require("./mobile-yam-push-cron.cjs");
const personal = require("./mobile-personal-reminders-cron.cjs");
const monthly = require("./mobile-monthly-report-push-cron.cjs");
const network = require("./mobile-network-morning-push-cron.cjs");
const daily = require("./mobile-daily-fortune-push-cron.cjs");
const shrine = require("./mobile-auspicious-push-cron.cjs");
const payloadRuntime = require("../src/lib/notification-payload.cjs");
const pushSender = require("../src/lib/push-send.cjs");
const admin = await import("./workers/admin-notify-watcher.mjs");

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
  console.log(`PASS ${message}`);
}

const locales = ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"];
const thai = /[\u0E00-\u0E7F]/u;

for (const locale of locales) {
  const msg = admin.messageFor("support_admin_reply", locale, {}, "/support");
  check(msg.title.length >= 4 && msg.body.length >= 20 && /(?:แตะ|點按|Nhấn|タップ|Нажмите|탭|Toca|Tap)/u.test(msg.body),
    `admin service copy is useful and actionable for ${locale}`);
  if (locale !== "th") check(!thai.test(`${msg.title}${msg.body}`), `admin ${locale} copy never falls back to Thai`);
}

const adminToken = {
  id: crypto.randomUUID(), expo_push_token: "ExponentPushToken[transport-only]",
  device_push_token: null, device_token_type: "apns", platform: "ios", locale: "en",
};
const serviceNotice = admin.buildAdminMobileNotice({
  userId: "acct-live-001", eventId: "case-live-001", eventType: "support_admin_reply",
  msg: admin.messageFor("support_admin_reply", "en", {}, "/support"), tokens: [adminToken],
});
assert.deepEqual(serviceNotice.payload, {
  v: 1, kind: "service", accountId: "acct-live-001", event: "support_admin_reply",
  referenceId: "case-live-001", url: "/support",
});
check(serviceNotice.transactional === true && serviceNotice.messages[0].data === serviceNotice.payload,
  "live admin service producer uses one strict immutable payload for storage and provider data");
check(!JSON.stringify(serviceNotice.payload).includes("transport-only") && !JSON.stringify(serviceNotice.sourceFacts).includes("transport-only"),
  "live admin producer keeps raw transport credentials out of payload and source facts");

const securityNotice = admin.buildAdminMobileNotice({
  userId: "acct-live-001", eventId: "security-live-001", eventType: "account_login",
  msg: admin.messageFor("account_login", "en", {}, "/account"), tokens: [adminToken],
});
assert.deepEqual(securityNotice.payload, {
  v: 1, kind: "security", accountId: "acct-live-001", event: "account_login", url: "/account",
});
check(securityNotice.messages[0].url === "/account", "live admin security producer preserves the account-review tap destination");
assert.deepEqual(resolveNotificationPayload(securityNotice.payload, "security", "acct-live-001"), securityNotice.payload);
assert.deepEqual(resolveNotificationPayload(serviceNotice.payload, "service", "acct-live-001"), serviceNotice.payload);

let capturedNotice: Record<string, any> | null = null;
const fakeNativeDb = {
  async query(sql: string) {
    if (/FROM mobile_push_tokens/u.test(sql)) return { rows: [adminToken] };
    throw new Error(`unexpected fake native query: ${sql}`);
  },
};
const native = await admin.sendNativePush(
  "acct-live-001", admin.messageFor("support_admin_reply", "en", {}, "/support"),
  "/support", "support_admin_reply", "case-live-001",
  { db: fakeNativeDb, delivery: { async deliver(_db: unknown, notice: Record<string, any>) {
    capturedNotice = notice;
    return { status: "accepted", sent: 1, failed: 0, result: { retryDue: 0, dead: 0 } };
  } } },
);
check(native.sent === 1 && capturedNotice?.payload?.url === "/support", "live admin sender delegates to durable delivery with the strict payload");

const updates: string[] = [];
const deadDb = {
  async query(sql: string) {
    if (/INSERT INTO notification_inbox/u.test(sql)) return { rows: [] };
    if (/FROM push_subscriptions/u.test(sql)) return { rows: [] };
    if (/UPDATE notification_deliveries/u.test(sql)) { updates.push(sql); return { rows: [] }; }
    throw new Error(`unexpected dead-child query: ${sql}`);
  },
};
await admin.sendDelivery({
  id: "delivery-live-001", recipient_user_id: "acct-live-001", locale: "en", attempts: 1, max_attempts: 5,
  event: { id: "event-live-001", event_type: "support_admin_reply", severity: "info", payload: {}, target_url: "/support" },
}, {
  db: deadDb,
  async sendNativePush() { return { sent: 0, temporaryFailures: 0, permanentFailures: 1, attempted: 1 }; },
});
check(updates.some((sql) => /status='dead'/u.test(sql)) && updates.every((sql) => !/status='sent'/u.test(sql)),
  "admin outbox never reports sent when its durable native child is dead");

for (const locale of locales) {
  const family = payloadRuntime.normalizedLocale(locale);
  const monthlyProducer = monthly.buildMonthlyProducer("acct-live-001", locale, 7, 2026, "2026-08-01");
  check(monthlyProducer.payload.kind === "service" && monthlyProducer.payload.url === "/calendar"
      && monthlyProducer.payload.event === "monthly_report_ready" && monthlyProducer.copy.body.length >= 35,
    `monthly live producer is actionable strict service copy for ${locale}`);
  if (locale !== "th") check(!thai.test(`${monthlyProducer.copy.title}${monthlyProducer.copy.body}`), `monthly ${locale} never falls back to Thai`);

  const ally = { id: "profile-ally", name: "A", scores: { day: 42 }, reading: { en: "supportive", zh: "助力", th: "เกื้อหนุน" }, guidance: { primary_i18n: { en: "coordinate", zh: "協調", th: "ประสานงาน" } } };
  const risk = { id: "profile-risk", name: "B", scores: { day: -31 }, reading: { en: "friction", zh: "摩擦", th: "ขัดแย้ง" }, guidance: { primary_i18n: { en: "set boundaries", zh: "設定界線", th: "ตั้งขอบเขต" } } };
  const networkProducer = network.buildNetworkProducer("acct-live-001", locale, "2026-08-15", "profile-center", ally, risk);
  check(networkProducer.payload.kind === "service" && networkProducer.payload.url === "/network"
      && networkProducer.payload.referenceId === "network|2026-08-15|profile-center"
      && networkProducer.copy.body.includes(family === "th" ? "เปิดเครือข่าย" : family === "zh" ? "開啟人脈" : "Open Network"),
    `network live producer preserves server scores and tap action for ${locale}`);
  if (locale !== "th") check(!thai.test(`${networkProducer.copy.title}${networkProducer.copy.body}`), `network ${locale} never falls back to Thai`);
}

const goal = {
  id: "goal-live-001", title: "Launch", nextAuspicious: {
    date: "2026-08-18", dayLabel: "วันอังคารที่ 18 สิงหาคม", hourRange: "09:00-11:00", score: 72,
  },
};

const liveCases = [
  {
    kind: "security", payload: securityNotice.payload, copy: securityNotice.messages[0],
    sourceFacts: securityNotice.sourceFacts,
  },
  {
    kind: "saved_date",
    payload: payloadRuntime.buildNotificationPayload("saved_date", "acct-live-001", {
      savedDateId: "saved-live-001", lead: 60, date: "2026-08-16", url: "/datepick/saved",
    }),
    copy: personal.buildSavedDateCopy("1h", "16/08, 08:00", "launch", "en"),
    sourceFacts: { start: "2026-08-16T01:00:00.000Z", activityType: "launch", timezone: "Asia/Bangkok" },
  },
  {
    kind: "daily",
    payload: payloadRuntime.buildNotificationPayload("daily", "acct-live-001", {
      slot: "morning", date: "2026-08-15", url: "/today",
    }),
    copy: daily.buildDailyCopy({ loc: "en", slot: "morning", dateLabel: "15/08", score: 72,
      label: "good", tongshuYi: [], golden: { range: "09:00-11:00", quality: "best" } }),
    sourceFacts: { score: 72, goldenHour: { range: "09:00-11:00", quality: "best" } },
  },
  {
    kind: "yam",
    payload: payloadRuntime.buildNotificationPayload("yam", "acct-live-001", {
      range: "09:00-11:00", quality: "best", date: "2026-08-15", url: "/today",
    }),
    copy: yam.buildYamCopy({ range: "09:00-11:00", quality: "best" }, "巳", null, "en"),
    sourceFacts: { profileId: "profile-live-001", branch: "巳", qimen: null },
  },
  {
    kind: "qimen",
    payload: payloadRuntime.buildNotificationPayload("qimen", "acct-live-001", {
      date: "2026-08-15", direction: "SE", score: 67, url: "/qimen/board",
    }),
    copy: personal.buildQimenCopy({ direction: "SE", score: 67 }, "en"),
    sourceFacts: { direction: "SE", score: 67, timezone: "Asia/Bangkok", instant: "2026-08-15T01:00:00.000Z" },
  },
  {
    kind: "shrine",
    payload: payloadRuntime.buildNotificationPayload("shrine", "acct-live-001", {
      date: "2026-08-16", festival: "中元節", url: "/shrine",
    }),
    copy: shrine.buildMessage({ th: "เทศกาลจงหยวน", en: "Ghost Festival", zh: "中元節", kind: "festival" }, "en"),
    sourceFacts: { date: "2026-08-16", festival: "中元節", timezone: "Asia/Bangkok" },
  },
  {
    kind: "goal",
    payload: payloadRuntime.buildNotificationPayload("goal", "acct-live-001", {
      goalId: "goal-live-001", date: "2026-08-18", url: "/calendar/goals",
    }),
    copy: personal.buildGoalCopy(goal, "en"),
    sourceFacts: { profileId: "profile-live-001", date: "2026-08-18", hourRange: "09:00-11:00", score: 72 },
  },
  {
    kind: "service", payload: serviceNotice.payload, copy: serviceNotice.messages[0], sourceFacts: serviceNotice.sourceFacts,
  },
];
for (const item of liveCases) {
  const provider = pushSender.prepareMessage({
    category: item.kind, title: item.copy.title, body: item.copy.body,
    url: item.payload.url, data: item.payload,
  }, "expo");
  assert.deepEqual(provider.data, item.payload, `${item.kind}: provider facts differ from live stored payload`);
  assert.deepEqual(resolveNotificationPayload(item.payload, item.kind, "acct-live-001"), item.payload,
    `${item.kind}: mobile parser rejects live producer payload`);
  check(item.copy.title.length >= 4 && item.copy.body.length >= 20 && Object.keys(item.sourceFacts).length > 0,
    `${item.kind}: live source facts produce bounded useful copy, stored payload, provider parity and mobile parsing`);
}

for (const locale of locales) {
  const family = payloadRuntime.normalizedLocale(locale);
  const copy = personal.buildGoalCopy(goal, family);
  check(copy.body.includes("09:00-11:00") && copy.body.includes(family === "th" ? "เปิดเป้าหมาย" : family === "zh" ? "開啟目標" : "Open Goals"),
    `goal live formatter localizes the date/window/action for ${locale}`);
  if (locale !== "th") check(!thai.test(`${copy.title}${copy.body}`), `goal ${locale} never reuses the Thai engine day label`);

  const savedCopy = personal.buildSavedDateCopy("1h", "16/08, 08:00", "launch", family);
  const dailyCopy = daily.buildDailyCopy({ loc: family, slot: "morning", dateLabel: "15/08", score: 72,
    label: "good", tongshuYi: family === "th" ? ["เริ่มงาน"] : [], golden: { range: "09:00-11:00", quality: "best" } });
  const yamCopy = yam.buildYamCopy({ range: "09:00-11:00", quality: "best" }, "巳", null, family);
  const qimenCopy = personal.buildQimenCopy({ direction: "SE", score: 67 }, family);
  const shrineCopy = shrine.buildMessage({ th: "เทศกาลจงหยวน", en: "Ghost Festival", zh: "中元節", kind: "festival" }, family);
  for (const [kind, rendered, required] of [
    ["saved_date", savedCopy, "16/08, 08:00"],
    ["daily", dailyCopy, "09:00-11:00"],
    ["yam", yamCopy, "09:00-11:00"],
    ["qimen", qimenCopy, "67"],
    ["shrine", shrineCopy, family === "th" ? "จงหยวน" : family === "zh" ? "中元" : "Ghost"],
  ] as const) {
    check(rendered.title.length <= 120 && rendered.body.length >= (family === "zh" ? 12 : 20) && rendered.body.length <= 400
        && `${rendered.title}${rendered.body}`.includes(required),
      `${kind} copy retains exact server facts, useful detail and bounds for ${locale}`);
    if (locale !== "th") check(!thai.test(`${rendered.title}${rendered.body}`), `${kind} ${locale} never falls back to Thai`);
  }
}

let qimenFetches = 0;
const disabledQimenUser = new Proxy({ qimen_enabled: false }, {
  get(target, key) {
    if (["qimen_latitude", "qimen_longitude", "qimen_location_updated_at"].includes(String(key))) {
      throw new Error("disabled personal Qimen read location");
    }
    return Reflect.get(target, key);
  },
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { qimenFetches += 1; throw new Error("disabled Qimen fetched API"); };
try {
  const skipped = await personal.qimenNotice({}, disabledQimenUser, new Date("2026-08-15T01:05:00Z"), 0);
  check(skipped.reason === "qimen_disabled" && qimenFetches === 0,
    "live personal Qimen scheduler checks consent before reading coordinates or fetching the API");
} finally {
  globalThis.fetch = originalFetch;
}

const database = `notification_live_producer_test_${process.pid}`;
const role = `notification_live_producer_role_${process.pid}`;
const password = crypto.randomBytes(20).toString("hex");
assert.match(database, /^notification_live_producer_test_/u);
function psql(db: string, sql: string) {
  execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
}
let pool: pg.Pool | null = null;
try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE TABLE users(id uuid PRIMARY KEY,email text,current_org_id uuid,session_version int,timezone text,deleted_at timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY,created_by_user_id uuid,is_archived boolean,relationship_type text,created_at timestamptz,birth_lat numeric,birth_lng numeric);
    CREATE TABLE mobile_push_tokens(id uuid PRIMARY KEY,user_id uuid,device_push_token text,device_token_type text,expo_push_token text,platform text,locale text,enabled boolean,timezone text);
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY,security_enabled boolean,yam_enabled boolean,auspicious_enabled boolean,daily_enabled boolean,qimen_enabled boolean,shrine_enabled boolean,goal_enabled boolean,saved_date_enabled boolean,service_enabled boolean,yam_min_quality text,yam_lead_minutes int,qimen_latitude numeric,qimen_longitude numeric,qimen_location_updated_at timestamptz,quiet_start int,quiet_end int,max_per_day int,paused_until timestamptz,timezone text);
    CREATE TABLE mobile_push_log(user_id uuid,delivery_status text,sent_at timestamptz,accepted_at timestamptz,updated_at timestamptz);
    INSERT INTO users VALUES('00000000-0000-4000-8000-000000000901','yam@example.test',NULL,0,'Asia/Bangkok',NULL);
    INSERT INTO profiles VALUES('30000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901',false,'self',now(),13.75,100.5);
    INSERT INTO mobile_push_tokens VALUES('10000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901',NULL,NULL,'ExponentPushToken[yam-live]','ios','en',true,'Asia/Bangkok');
    INSERT INTO mobile_notification_prefs
      (user_id,security_enabled,yam_enabled,auspicious_enabled,daily_enabled,qimen_enabled,shrine_enabled,goal_enabled,saved_date_enabled,service_enabled,yam_min_quality,yam_lead_minutes,qimen_latitude,qimen_longitude,qimen_location_updated_at,quiet_start,quiet_end,max_per_day,paused_until,timezone)
    VALUES('00000000-0000-4000-8000-000000000901',true,true,false,false,false,false,false,false,true,'best',60,13.8,100.6,now(),0,0,10,NULL,'Asia/Bangkok');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT ON users,mobile_push_tokens,mobile_notification_prefs,mobile_push_log TO ${role};
    GRANT SELECT(id,created_by_user_id,is_archived,relationship_type,created_at) ON profiles TO ${role};
  `);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 2 });
  const users = await yam.loadYamUsers(pool);
  check(users.length === 1 && users[0].qimen_enabled === false
      && users[0].qimen_latitude === null && users[0].qimen_longitude === null
      && !("lat" in users[0]) && !("lng" in users[0]),
    "live Yam SQL executes without permission to profile birth coordinates and CASE-gates current Qimen location when disabled");
  const personalUsers = await personal.loadPersonalUsers(pool);
  check(personalUsers.rows.length === 1 && personalUsers.rows[0].qimen_enabled === false
      && personalUsers.rows[0].qimen_latitude === null && personalUsers.rows[0].qimen_longitude === null,
    "live personal-reminder SQL CASE-gates current Qimen coordinates before scheduler code sees a disabled row");
} finally {
  await pool?.end().catch(() => null);
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`);
}

console.log(`NOTIFICATION_LIVE_PRODUCERS_TASK3_OK checks=${checks}`);
