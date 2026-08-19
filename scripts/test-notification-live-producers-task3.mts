import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { buildFusionMobileNotice } from "../src/lib/mobile-fusion-notification.ts";
import { notificationHistoryPayload } from "../src/lib/mobile-notification-history.ts";
import { buildZibaiSnapshot } from "../src/lib/zibai-science.ts";

const require = createRequire(import.meta.url);
const mobileRootInput = process.env.HOURKEY_MOBILE_ROOT;
const expectedMobileSha = process.env.HOURKEY_MOBILE_SHA;
assert.ok(mobileRootInput && expectedMobileSha, "cross-repo gate requires HOURKEY_MOBILE_ROOT and HOURKEY_MOBILE_SHA");
const mobileRoot = resolve(mobileRootInput);
assert.equal(execFileSync("git", ["-C", mobileRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), expectedMobileSha,
  "cross-repo gate must execute against the exact reviewed mobile commit");
const { resolveNotificationPayload } = await import(pathToFileURL(
  resolve(mobileRoot, "src/navigation/notificationPayload.ts"),
).href);
const yam = require("./mobile-yam-push-cron.cjs");
const personal = require("./mobile-personal-reminders-cron.cjs");
const monthly = require("./mobile-monthly-report-push-cron.cjs");
const network = require("./mobile-network-morning-push-cron.cjs");
const daily = require("./mobile-daily-fortune-push-cron.cjs");
const shrine = require("./mobile-auspicious-push-cron.cjs");
const zibai = require("./mobile-zibai-push-cron.cjs");
const payloadRuntime = require("../src/lib/notification-payload.cjs");
const pushSender = require("../src/lib/push-send.cjs");
const qimenAdvisory = require("../src/lib/qimen-notification-advisory.cjs");
const admin = await import("./workers/admin-notify-watcher.mjs");
const sourceFixture = JSON.parse(readFileSync("test-fixtures/notifications/task3-source-results.sanitized.json", "utf8"));
const liveQimenAdvisory = qimenAdvisory.buildQimenAdvisory(sourceFixture.qimen.api, {
  timezone: sourceFixture.qimen.request.timezone,
  longitude: sourceFixture.qimen.request.lng,
  purpose: sourceFixture.qimen.request.purpose,
});
assert.ok(liveQimenAdvisory);
const liveYamAdvisory = qimenAdvisory.buildQimenAdvisory(sourceFixture.yam.qimenApi, {
  timezone: sourceFixture.yam.qimenRequest.timezone,
  longitude: sourceFixture.yam.qimenRequest.lng,
  purpose: sourceFixture.yam.qimenRequest.purpose,
});
assert.ok(liveYamAdvisory);
const liveYamNotice = yam.buildYamProducer({
  id: "acct-live-001", profile_id: "profile-live-001", tokens: [], user_timezone: "Asia/Bangkok",
}, { ...sourceFixture.yam, highlight: liveYamAdvisory });
assert.ok(liveYamNotice);
const liveZibaiSnapshot = buildZibaiSnapshot(new Date("2026-08-16T03:07:00.000Z"), 100.5018);
const liveZibaiRow = {
  user_id: "acct-live-001", installation_id: "93000000-0000-4000-8000-000000000001",
  token_id: "94000000-0000-4000-8000-000000000001", device_push_token: null,
  device_token_type: null, expo_push_token: "ExponentPushToken[zibai-live]", platform: "ios",
  token_locale: "en", privacy_preview: true, app_version: "0.0.1",
};
const liveZibaiV1 = zibai.buildZibaiNotice(
  { ...liveZibaiRow, zibai_payload_schema: 1 }, "zibai_shichen", liveZibaiSnapshot,
  "95000000-0000-4000-8000-000000000001",
);
const liveZibaiV2 = zibai.buildZibaiNotice(
  { ...liveZibaiRow, installation_id: "93000000-0000-4000-8000-000000000002",
    token_id: "94000000-0000-4000-8000-000000000002", zibai_payload_schema: 2 },
  "zibai_shichen", liveZibaiSnapshot, "95000000-0000-4000-8000-000000000002",
);

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
  console.log(`PASS ${message}`);
}

const locales = ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"];
const thai = /[\u0E00-\u0E7F]/u;

check(!Object.hasOwn(liveZibaiV1.payload, "snapshotSchema")
    && liveZibaiV2.payload.snapshotSchema === 2
    && liveZibaiV2.payload.sectors.length === 9,
  "live Zi Bai inventory retains explicit installation-scoped v1/v2 production without app-version inference");

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
check(serviceNotice.historyCopies.en.title === serviceNotice.messages[0].title
    && !thai.test(`${serviceNotice.historyCopies.en.title}${serviceNotice.historyCopies.en.body}`),
  "live admin producer supplies full English account-history copy independently of device privacy preview");
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
const securityEnvelope = { ...securityNotice.payload, notificationId: "91000000-0000-4000-8000-000000000001" };
const serviceEnvelope = { ...serviceNotice.payload, notificationId: "91000000-0000-4000-8000-000000000002" };
assert.deepEqual(resolveNotificationPayload(securityEnvelope, "security", "acct-live-001"), securityEnvelope);
assert.deepEqual(resolveNotificationPayload(serviceEnvelope, "service", "acct-live-001"), serviceEnvelope);

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
      && monthlyProducer.payload.event === "monthly_report_ready" && monthlyProducer.copy.body.length >= 35
      && monthlyProducer.historyCopies.en.body.includes("open Calendar"),
    `monthly live producer is actionable strict service copy for ${locale}`);
  if (locale !== "th") check(!thai.test(`${monthlyProducer.copy.title}${monthlyProducer.copy.body}`), `monthly ${locale} never falls back to Thai`);

  const ally = { id: "profile-ally", name: "A", scores: { day: 42 }, reading: { en: "supportive", zh: "助力", th: "เกื้อหนุน" }, guidance: { primary_i18n: { en: "coordinate", zh: "協調", th: "ประสานงาน" } } };
  const risk = { id: "profile-risk", name: "B", scores: { day: -31 }, reading: { en: "friction", zh: "摩擦", th: "ขัดแย้ง" }, guidance: { primary_i18n: { en: "set boundaries", zh: "設定界線", th: "ตั้งขอบเขต" } } };
  const networkProducer = network.buildNetworkProducer("acct-live-001", locale, "2026-08-15", "profile-center", ally, risk);
  check(networkProducer.payload.kind === "service" && networkProducer.payload.url === "/network"
      && networkProducer.payload.referenceId === "network|2026-08-15|profile-center"
      && networkProducer.historyCopies.en.body.includes("Open Network")
      && networkProducer.copy.body.includes(family === "th" ? "เปิดเครือข่าย" : family === "zh" ? "開啟人脈" : "Open Network"),
    `network live producer preserves server scores and tap action for ${locale}`);
  if (locale !== "th") check(!thai.test(`${networkProducer.copy.title}${networkProducer.copy.body}`), `network ${locale} never falls back to Thai`);
}

const goal = {
  id: "goal-live-001", title: "Launch", nextAuspicious: {
    date: "2026-08-18", dayLabel: "วันอังคารที่ 18 สิงหาคม", hourRange: "09:00-11:00", score: 72,
  },
};
const fusionNotice = buildFusionMobileNotice("acct-live-001", "fusion|job|92000000-0000-4000-8000-000000000001", [{
  id: crypto.randomUUID(), device_push_token: null, device_token_type: "apns",
  expo_push_token: "ExponentPushToken[fusion-live]", platform: "ios", locale: "en",
}]);

const liveCases: Array<{
  kind: string;
  transactional?: boolean;
  payload: Record<string, any>;
  copy: { title: string; body: string };
  sourceFacts: Record<string, any>;
}> = [
  {
    kind: "zibai", payload: liveZibaiV1.payload, copy: liveZibaiV1.historyCopies.en,
    sourceFacts: liveZibaiV1.sourceFacts,
  },
  {
    kind: "zibai", payload: liveZibaiV2.payload, copy: liveZibaiV2.historyCopies.en,
    sourceFacts: liveZibaiV2.sourceFacts,
  },
  {
    kind: "security", transactional: true, payload: securityNotice.payload, copy: securityNotice.messages[0],
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
    payload: liveYamNotice.payload,
    copy: liveYamNotice.historyCopies.en,
    sourceFacts: liveYamNotice.sourceFacts,
  },
  {
    kind: "qimen",
    payload: payloadRuntime.buildNotificationPayload("qimen", "acct-live-001", {
      date: "2026-08-15", direction: liveQimenAdvisory.direction.code, score: liveQimenAdvisory.score, url: "/qimen/board",
    }),
    copy: personal.buildQimenCopy(liveQimenAdvisory, "en"),
    sourceFacts: qimenAdvisory.qimenSourceFacts(liveQimenAdvisory),
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
    kind: "service", transactional: true, payload: serviceNotice.payload, copy: serviceNotice.messages[0], sourceFacts: serviceNotice.sourceFacts,
  },
  {
    kind: "service", transactional: true, payload: fusionNotice.payload,
    copy: fusionNotice.messages[0], sourceFacts: fusionNotice.sourceFacts,
  },
];
for (const [index, item] of liveCases.entries()) {
  const notificationId = `93000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  const envelope = { ...item.payload, notificationId };
  const provider = pushSender.prepareMessage({
    category: item.kind, title: item.copy.title, body: item.copy.body,
    transactional: item.transactional === true, url: item.payload.url, data: envelope,
  }, "expo");
  assert.deepEqual(provider.data, envelope, `${item.kind}: provider facts differ from live stored payload plus server ID`);
  const providerParsed = resolveNotificationPayload(
    JSON.parse(JSON.stringify(provider.data)), item.kind, "acct-live-001",
  );
  const historyParsed = resolveNotificationPayload(
    JSON.parse(JSON.stringify(notificationHistoryPayload(notificationId, item.payload))),
    item.kind,
    "acct-live-001",
  );
  const providerParsedWire = JSON.parse(JSON.stringify(providerParsed));
  const historyParsedWire = JSON.parse(JSON.stringify(historyParsed));
  const expectedWire = JSON.parse(JSON.stringify(envelope));
  if (item.kind === "zibai" && item.payload.snapshotSchema === 2) {
    const { sectorReadings: providerReadings, ...providerWire } = providerParsedWire;
    const { sectorReadings: historyReadings, ...historyWire } = historyParsedWire;
    assert.equal(providerReadings.length, 9);
    assert.deepEqual(historyReadings, providerReadings);
    assert.deepEqual(providerWire, expectedWire, `${item.kind}: mobile parser rejects live provider payload`);
    assert.deepEqual(historyWire, expectedWire, `${item.kind}: authenticated history envelope is not routable`);
  } else {
    assert.deepEqual(providerParsedWire, expectedWire, `${item.kind}: mobile parser rejects live provider payload`);
    assert.deepEqual(historyParsedWire, expectedWire, `${item.kind}: authenticated history envelope is not routable`);
  }
  assert.equal(provider.categoryId,
    item.transactional === true ? undefined : item.kind === "zibai" ? "hourkey_zibai" : "hourkey_daily",
    `${item.kind}: MUTE category follows transactional policy rather than the broad service kind`);
  if (item.kind === "yam" || item.kind === "qimen") {
    assert.equal(provider.ttl, 300, `${item.kind}: provider queue lifetime must not outlive the occurrence`);
  }
  check(item.copy.title.length >= 4 && item.copy.body.length >= 20 && Object.keys(item.sourceFacts).length > 0,
    `${item.kind}: live source facts produce bounded useful copy, stored payload, provider parity and mobile parsing`);
}

const pushSenderSource = readFileSync("src/lib/push-sender.ts", "utf8");
const fusionRouteSource = readFileSync("src/app/api/sifu/fusion5/route.ts", "utf8");
const bookRouteSource = readFileSync("src/app/api/book/route.ts", "utf8");
check(!pushSenderSource.includes("sendMobilePushToUser")
    && /export async function notifyFusionDone/u.test(pushSenderSource)
    && /try\s*\{[\s\S]{0,180}?await deliverFusionMobileNotification\(pool, userId, referenceId\)[\s\S]{0,300}?fusion_mobile_notification_reservation_failed/u.test(pushSenderSource),
  "live Fusion awaits durable typed mobile reservation without bypassing through legacy Expo");
check(/await notifyFusionDone\(p\.userId, `fusion\|job\|\$\{jobId\}`\)/u.test(fusionRouteSource)
    && /await notifyFusionDone\(userId, `fusion\|book\|\$\{bookId\}`\)/u.test(bookRouteSource),
  "both live Fusion result producers await reservation with a stable typed UUID reference");
const bookRefundCall = "await refundHoursForUser(userId, totalRefund, FEATURE)";
const bookNotificationCall = "await notifyFusionDone(userId, `fusion|book|${bookId}`)";
check(bookRouteSource.includes(bookRefundCall)
    && bookRouteSource.indexOf(bookRefundCall) < bookRouteSource.indexOf(bookNotificationCall),
  "book partial-Yam refund settles before any notification I/O can stall the completed worker");
check(/catch\s*\{[\s\S]{0,420}?mobile\s*=\s*\{ status: "error", sent: 0, failed: 1 \}/u.test(pushSenderSource),
  "notification reservation failure is converted to explicit telemetry and cannot enter core job failure/refund handling");

for (const locale of locales) {
  const family = payloadRuntime.normalizedLocale(locale);
  const copy = personal.buildGoalCopy(goal, family);
  check(copy.body.includes("09:00-11:00") && copy.body.includes(family === "th" ? "เปิดเป้าหมาย" : family === "zh" ? "開啟目標" : "Open Goals"),
    `goal live formatter localizes the date/window/action for ${locale}`);
  if (locale !== "th") check(!thai.test(`${copy.title}${copy.body}`), `goal ${locale} never reuses the Thai engine day label`);

  const savedCopy = personal.buildSavedDateCopy("1h", "16/08, 08:00", "launch", family);
  const dailyCopy = daily.buildDailyCopy({ loc: family, slot: "morning", dateLabel: "15/08", score: 72,
    label: "good", tongshuYi: family === "th" ? ["เริ่มงาน"] : [], golden: { range: "09:00-11:00", quality: "best" } });
  const yamCopy = yam.buildYamCopy({ range: "09:00-11:00", quality: "best" }, "巳", liveYamAdvisory, family);
  const qimenCopy = personal.buildQimenCopy(liveQimenAdvisory, family);
  const shrineCopy = shrine.buildMessage({ th: "เทศกาลจงหยวน", en: "Ghost Festival", zh: "中元節", kind: "festival" }, family);
  for (const [kind, rendered, required] of [
    ["saved_date", savedCopy, "16/08, 08:00"],
    ["daily", dailyCopy, "09:00-11:00"],
    ["yam", yamCopy, "09:00-11:00"],
    ["qimen", qimenCopy, "玄武"],
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

check(!/qimen_latitude|qimen_longitude|qimen_location_updated_at/u.test(personal.personalUsersSql())
    && !/qimen_latitude|qimen_longitude|qimen_location_updated_at/u.test(yam.YAM_USERS_SQL),
  "live Qimen producer inventories do not read precise coordinates before the product gate");

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "task3-abort-test-secret";
const aborted = new AbortController();
aborted.abort();
let abortedFetches = 0;
globalThis.fetch = async (_input: any, init?: RequestInit) => {
  abortedFetches += 1;
  init?.signal?.throwIfAborted();
  throw new Error("aborted scheduler unexpectedly fetched");
};
const abortUser = {
  id: "acct-abort-001", email: "private@example.test", current_org_id: null, session_version: 0,
  profile_id: "profile-abort-001", has_prefs: true, yam_enabled: true, service_enabled: true,
  qimen_enabled: false, user_timezone: "Asia/Bangkok", sent_today: 0, quiet_start: 0,
  quiet_end: 0, max_per_day: 10, paused_until: null, yam_min_quality: "best", yam_lead_minutes: 60,
  tokens: [],
};
const abortDb = { async query() { return { rows: [abortUser] }; } };
try {
  await assert.rejects(yam.runScheduler(abortDb, aborted.signal), /abort/u,
    "Yam must surface scheduler abort instead of catch-and-continuing");
  check(abortedFetches === 0, "Yam checks the shared abort before starting per-user work");
  await assert.rejects(network.runScheduler(abortDb, aborted.signal), /abort/u,
    "network must surface scheduler abort instead of catch-and-continuing");
  check(abortedFetches === 0, "network checks the shared abort before starting per-user work");
} finally {
  globalThis.fetch = originalFetch;
}

for (const [name, scheduler] of [["Yam", yam.runScheduler], ["network", network.runScheduler]] as const) {
  const duringBody = new AbortController();
  let bodyReads = 0;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      bodyReads += 1;
      duringBody.abort();
      throw new Error("body read interrupted after scheduler abort");
    },
  } as Response);
  try {
    await assert.rejects(scheduler(abortDb, duringBody.signal), /abort/u,
      `${name} must not convert an abort during response parsing into a normal skip`);
    check(bodyReads === 1, `${name} rethrows a shared abort raised during response parsing`);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    CREATE TABLE profiles(id uuid PRIMARY KEY,org_id uuid NOT NULL,created_by_user_id uuid,is_archived boolean,relationship_type text,created_at timestamptz,birth_lat numeric,birth_lng numeric);
    CREATE TABLE mobile_push_tokens(id uuid PRIMARY KEY,user_id uuid,device_push_token text,device_token_type text,expo_push_token text,platform text,locale text,enabled boolean,timezone text);
    CREATE TABLE mobile_notification_prefs(user_id uuid PRIMARY KEY,security_enabled boolean,yam_enabled boolean,auspicious_enabled boolean,daily_enabled boolean,qimen_enabled boolean,shrine_enabled boolean,goal_enabled boolean,saved_date_enabled boolean,service_enabled boolean,yam_min_quality text,yam_lead_minutes int,qimen_latitude numeric,qimen_longitude numeric,qimen_location_updated_at timestamptz,quiet_start int,quiet_end int,max_per_day int,paused_until timestamptz,timezone text);
    CREATE TABLE mobile_push_log(user_id uuid,delivery_status text,sent_at timestamptz,accepted_at timestamptz,updated_at timestamptz);
    INSERT INTO users VALUES('00000000-0000-4000-8000-000000000901','yam@example.test','90000000-0000-4000-8000-000000000901',0,'Asia/Bangkok',NULL);
    INSERT INTO profiles VALUES('30000000-0000-4000-8000-000000000901','90000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901',false,'self',now(),13.75,100.5);
    INSERT INTO mobile_push_tokens VALUES('10000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901',NULL,NULL,'ExponentPushToken[yam-live]','ios','en',true,'Asia/Bangkok');
    INSERT INTO mobile_notification_prefs
      (user_id,security_enabled,yam_enabled,auspicious_enabled,daily_enabled,qimen_enabled,shrine_enabled,goal_enabled,saved_date_enabled,service_enabled,yam_min_quality,yam_lead_minutes,qimen_latitude,qimen_longitude,qimen_location_updated_at,quiet_start,quiet_end,max_per_day,paused_until,timezone)
    VALUES('00000000-0000-4000-8000-000000000901',true,true,false,false,false,false,false,false,true,'best',60,13.8,100.6,now(),0,0,10,NULL,'Asia/Bangkok');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT ON users,mobile_push_tokens,mobile_notification_prefs,mobile_push_log TO ${role};
    GRANT SELECT(id,org_id,created_by_user_id,is_archived,relationship_type,created_at) ON profiles TO ${role};
  `);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 2 });
  const users = await yam.loadYamUsers(pool);
  check(users.length === 1 && users[0].qimen_enabled === false
      && !("qimen_latitude" in users[0]) && !("qimen_longitude" in users[0])
      && !("lat" in users[0]) && !("lng" in users[0]),
    "live Yam inventory executes without permission to any precise coordinates before its product gate");
  const personalUsers = await personal.loadPersonalUsers(pool);
  check(personalUsers.rows.length === 1 && personalUsers.rows[0].qimen_enabled === false
      && !("qimen_latitude" in personalUsers.rows[0]) && !("qimen_longitude" in personalUsers.rows[0]),
    "live personal-reminder inventory exposes no precise coordinates before consent and product gates");
} finally {
  await pool?.end().catch(() => null);
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`);
}

console.log(`NOTIFICATION_LIVE_PRODUCERS_TASK3_OK checks=${checks}`);
