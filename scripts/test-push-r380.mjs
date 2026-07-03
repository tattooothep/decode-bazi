/* test-push-r380.mjs · Web Push Phase C (3 ก.ค. 2026)
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/test-push-r380.mjs
 * in-process route pattern (ไม่ยิง server จริง) · next/headers stub อ่าน globalThis.__testCookies
 * ครอบ:
 *   [1] sender unit (mock web-push): prefs off→ไม่ส่ง · quiet hours→ข้าม+ลง skip_log ·
 *       410→ลบ sub · fail_count เกิน 5→ลบ · สำเร็จ→last_success+fail_count=0 · inQuietHours ข้ามเที่ยงคืน
 *   [2] API /api/push/*: auth guard 401 ครบ · subscribe upsert/ย้ายเจ้าของ · prefs default+PATCH+quiet เดี่ยว=ปิด ·
 *       unsubscribe · test 404/ok
 *   [3] sw.js: node --check + จำลอง push/notificationclick ผ่าน vm
 *   [4] UI: hk-pwa.js hkPush.enable ใน vm (กดเปิด→requestPermission+subscribe+POST) ·
 *       การ์ด account.html ใน vm DOM stub (สวิตช์หลัก→hkPush.enable · ปุ่มทดสอบ→POST /api/push/test)
 *   [5] i18n nt.* ครบ 3 ภาษา + element ids + fusion5 hook เสียบแล้ว
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { q, q1, pool } = await import("../src/lib/db.ts");
const { signSession } = await import("../src/lib/auth.ts");
const sender = await import("../src/lib/push-sender.ts");

let pass = 0, fail = 0;
const ok = (c, l, d = "") => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (d ? " · " + d : ""))); };

const EMAIL_A = "push-r380-a@test.hourkey.io";
const EMAIL_B = "push-r380-b@test.hourkey.io";

async function cleanup() {
  const users = await q(`SELECT id FROM users WHERE email LIKE '%push-r380-%@test.hourkey.io'`);
  for (const u of users) {
    await q1(`DELETE FROM push_skip_log WHERE user_id=$1`, [u.id]);
    await q1(`DELETE FROM users WHERE id=$1`, [u.id]); // cascade ลบ push_subscriptions + notification_prefs
  }
}
async function makeUser(email) {
  const userId = randomUUID();
  await q1(`INSERT INTO users (id, email, name, is_active, created_at) VALUES ($1,$2,'ทดสอบ push r380',true,now())`, [userId, email]);
  return userId;
}
async function addSub(userId, endpoint, failCount = 0) {
  const row = await q1(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, ua, fail_count)
     VALUES ($1,$2,'test-p256dh','test-auth','TestUA',$3) RETURNING id`,
    [userId, endpoint, failCount]
  );
  return row.id;
}
function mockWebPush() {
  const calls = [];
  let behavior = async () => {};
  return {
    calls,
    setBehavior(fn) { behavior = fn; },
    setVapidDetails() {},
    async sendNotification(sub, payload, opts) {
      calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts });
      return behavior(sub);
    },
  };
}

const setCookie = (token) => { globalThis.__testCookies = token ? { decode_auth: token } : {}; };
const jreq = (url, method, body) =>
  new Request(url, { method, headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.80" }, body: body === undefined ? undefined : JSON.stringify(body) });

await cleanup();
const A = await makeUser(EMAIL_A);
const B = await makeUser(EMAIL_B);
const tokenA = await signSession({ userId: A, email: EMAIL_A, orgId: null });

/* ═══ 1 · sender unit (mock web-push) ═══ */
console.log("[1] push-sender unit (mock web-push)");
const wp = mockWebPush();
sender.__setWebPushForTest(wp);

/* 1a prefs off → ไม่ส่ง */
await q1(`INSERT INTO notification_prefs (user_id, fusion_done) VALUES ($1,false)
          ON CONFLICT (user_id) DO UPDATE SET fusion_done=false`, [A]);
await addSub(A, "https://push.test/ep-1");
let rep = await sender.sendToUser(A, { title: "t", body: "b", tag: "fusion_done" });
ok(rep.skipped === "pref_off" && rep.sent === 0 && wp.calls.length === 0, "pref ปิด → skipped=pref_off ไม่เรียก web-push");

/* 1b quiet hours → ข้าม + ลง skip log (ช่วงข้ามเที่ยงคืน 22→7 · เวลา 23) */
await q1(`UPDATE notification_prefs SET fusion_done=true, quiet_start=22, quiet_end=7 WHERE user_id=$1`, [A]);
rep = await sender.sendToUser(A, { title: "t", body: "b", tag: "fusion_done" }, { testNowHour: 23 });
ok(rep.skipped === "quiet_hours" && wp.calls.length === 0, "quiet hours (23:00 ใน 22→7) → ข้ามส่ง");
const skipRow = await q1(`SELECT reason, tag FROM push_skip_log WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [A]);
ok(skipRow && skipRow.reason === "quiet_hours" && skipRow.tag === "fusion_done", "บันทึก skip ลง push_skip_log");
rep = await sender.sendToUser(A, { title: "t", body: "b", tag: "fusion_done" }, { testNowHour: 6 });
ok(rep.skipped === "quiet_hours", "06:00 ยังอยู่ในช่วงเงียบ (ข้ามเที่ยงคืน)");

/* 1c นอกช่วงเงียบ → ส่งสำเร็จ · last_success + fail_count=0 */
rep = await sender.sendToUser(A, { title: "hourkey", body: "คำพยากรณ์พร้อมแล้ว 🔮", url: "/master-fusion", tag: "fusion_done" }, { testNowHour: 12 });
ok(rep.sent === 1 && rep.skipped === null, "12:00 นอกช่วงเงียบ → ส่งสำเร็จ 1 เครื่อง");
ok(wp.calls.length === 1 && wp.calls[0].payload.title === "hourkey" && wp.calls[0].payload.url === "/master-fusion", "payload มี title/body/url/tag ครบ");
let subRow = await q1(`SELECT last_success, fail_count FROM push_subscriptions WHERE user_id=$1`, [A]);
ok(subRow && subRow.last_success && subRow.fail_count === 0, "ส่งสำเร็จ → last_success + fail_count=0");

/* 1d 410 Gone → ลบ subscription */
wp.setBehavior(async () => { const e = new Error("gone"); e.statusCode = 410; throw e; });
rep = await sender.sendToUser(A, { title: "t", body: "b", tag: "fusion_done" }, { testNowHour: 12 });
ok(rep.removed === 1 && rep.sent === 0, "410 → ลบ subscription (removed=1)");
let n = await q1(`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1`, [A]);
ok(n.n === 0, "subscription ตายถูกลบจาก DB");

/* 1e error ชั่วคราว → fail_count+1 · เกิน 5 → ลบ */
await addSub(A, "https://push.test/ep-2", 0);
wp.setBehavior(async () => { const e = new Error("boom"); e.statusCode = 500; throw e; });
rep = await sender.sendToUser(A, { title: "t", body: "b", tag: "fusion_done" }, { testNowHour: 12 });
subRow = await q1(`SELECT fail_count FROM push_subscriptions WHERE user_id=$1`, [A]);
ok(rep.failed === 1 && subRow && subRow.fail_count === 1, "500 → fail_count+1 (ยังไม่ลบ)");
await q1(`UPDATE push_subscriptions SET fail_count=5 WHERE user_id=$1`, [A]);
rep = await sender.sendToUser(A, { title: "t", body: "b", tag: "fusion_done" }, { testNowHour: 12 });
n = await q1(`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1`, [A]);
ok(rep.removed === 1 && n.n === 0, "fail_count เกิน 5 → ปิด (ลบ subscription)");

/* 1f inQuietHours ตาราง */
ok(sender.inQuietHours(23, 22, 7) && sender.inQuietHours(3, 22, 7) && !sender.inQuietHours(12, 22, 7), "inQuietHours ข้ามเที่ยงคืน 22→7");
ok(sender.inQuietHours(10, 9, 17) && !sender.inQuietHours(17, 9, 17) && !sender.inQuietHours(8, 9, 17), "inQuietHours ช่วงปกติ 9→17 (half-open)");
ok(!sender.inQuietHours(5, null, null) && !sender.inQuietHours(5, 8, 8), "NULL หรือ start==end = ไม่ใช้ช่วงเงียบ");

/* 1g skipPrefCheck (ปุ่มทดสอบ) → ส่งแม้อยู่ quiet hours */
await addSub(A, "https://push.test/ep-3");
wp.setBehavior(async () => {});
rep = await sender.sendToUser(A, { title: "t", body: "ทดสอบการแจ้งเตือน 🔔", tag: "test" }, { skipPrefCheck: true, testNowHour: 23 });
ok(rep.sent === 1, "skipPrefCheck → ส่งได้แม้อยู่ช่วงเงียบ (ปุ่มทดสอบ)");
await q1(`DELETE FROM push_subscriptions WHERE user_id=$1`, [A]);

/* ═══ 2 · API /api/push/* ═══ */
console.log("[2] API /api/push/*");
const vapidRoute = await import("../src/app/api/push/vapid-key/route.ts");
const subRoute = await import("../src/app/api/push/subscribe/route.ts");
const unsubRoute = await import("../src/app/api/push/unsubscribe/route.ts");
const prefsRoute = await import("../src/app/api/push/prefs/route.ts");
const testRoute = await import("../src/app/api/push/test/route.ts");

/* auth guard ครบทุก endpoint */
setCookie(null);
ok((await vapidRoute.GET(jreq("http://x/api/push/vapid-key", "GET"))).status === 401, "vapid-key ไม่ login → 401");
ok((await subRoute.POST(jreq("http://x/api/push/subscribe", "POST", {}))).status === 401, "subscribe ไม่ login → 401");
ok((await unsubRoute.POST(jreq("http://x/api/push/unsubscribe", "POST", {}))).status === 401, "unsubscribe ไม่ login → 401");
ok((await prefsRoute.GET(jreq("http://x/api/push/prefs", "GET"))).status === 401, "prefs GET ไม่ login → 401");
ok((await prefsRoute.PATCH(jreq("http://x/api/push/prefs", "PATCH", {}))).status === 401, "prefs PATCH ไม่ login → 401");
ok((await testRoute.POST(jreq("http://x/api/push/test", "POST"))).status === 401, "test ไม่ login → 401");

setCookie(tokenA);
/* vapid-key */
let r = await vapidRoute.GET(jreq("http://x/api/push/vapid-key", "GET"));
let d = await r.json();
ok(r.status === 200 && typeof d.key === "string" && d.key.length > 60, "vapid-key คืน public key");
ok(d.key === process.env.VAPID_PUBLIC_KEY, "key ตรงกับ VAPID_PUBLIC_KEY ใน .env.local");

/* subscribe: bad → 400 · ดี → upsert */
r = await subRoute.POST(jreq("http://x/a", "POST", { subscription: { endpoint: "not-https", keys: {} } }));
ok(r.status === 400, "subscription เพี้ยน → 400");
const EP = "https://fcm.googleapis.com/fcm/send/test-r380";
r = await subRoute.POST(jreq("http://x/a", "POST", { subscription: { endpoint: EP, keys: { p256dh: "pk", auth: "au" } } }));
ok(r.status === 200, "subscribe → 200");
r = await subRoute.POST(jreq("http://x/a", "POST", { subscription: { endpoint: EP, keys: { p256dh: "pk2", auth: "au2" } } }));
ok(r.status === 200, "subscribe ซ้ำ endpoint เดิม (upsert) → 200");
n = await q1(`SELECT count(*)::int AS n, max(p256dh) AS k FROM push_subscriptions WHERE endpoint=$1`, [EP]);
ok(n.n === 1 && n.k === "pk2", "endpoint unique · upsert อัปเดต key ใหม่");
/* endpoint ย้ายเจ้าของ (เครื่องเดียว login สลับบัญชี) */
const tokenB = await signSession({ userId: B, email: EMAIL_B, orgId: null });
setCookie(tokenB);
await subRoute.POST(jreq("http://x/a", "POST", { subscription: { endpoint: EP, keys: { p256dh: "pk3", auth: "au3" } } }));
const owner = await q1(`SELECT user_id FROM push_subscriptions WHERE endpoint=$1`, [EP]);
ok(owner.user_id === B, "login บัญชีใหม่บนเครื่องเดิม → endpoint ย้ายเจ้าของ");
setCookie(tokenA);
await subRoute.POST(jreq("http://x/a", "POST", { subscription: { endpoint: EP, keys: { p256dh: "pk4", auth: "au4" } } }));

/* prefs GET default + subscribed flag */
await q1(`DELETE FROM notification_prefs WHERE user_id=$1`, [A]);
r = await prefsRoute.GET(jreq("http://x/api/push/prefs", "GET"));
d = await r.json();
ok(r.status === 200 && d.fusion_done === true && d.day_sniper === false && d.promo === false, "prefs default: fusion_done เปิดอย่างเดียว");
ok(d.subscribed === true, "subscribed=true เมื่อมี subscription");
/* PATCH toggle + quiet hours */
r = await prefsRoute.PATCH(jreq("http://x/a", "PATCH", { day_sniper: true, quiet_start: 22, quiet_end: 7 }));
d = await r.json();
ok(r.status === 200 && d.day_sniper === true && d.quiet_start === 22 && d.quiet_end === 7, "PATCH เปิด day_sniper + quiet 22→7");
r = await prefsRoute.GET(jreq("http://x/api/push/prefs", "GET"));
d = await r.json();
ok(d.day_sniper === true && d.fusion_done === true && d.quiet_start === 22, "GET หลัง PATCH persist ครบ (merge ไม่ทับ field อื่น)");
/* quiet มาข้างเดียว = ปิดทั้งคู่ · ชั่วโมงเพี้ยน = null */
r = await prefsRoute.PATCH(jreq("http://x/a", "PATCH", { quiet_start: 22, quiet_end: null }));
d = await r.json();
ok(d.quiet_start === null && d.quiet_end === null, "quiet ส่งข้างเดียว → ปิดทั้งคู่");
r = await prefsRoute.PATCH(jreq("http://x/a", "PATCH", { quiet_start: 99, quiet_end: 7 }));
d = await r.json();
ok(d.quiet_start === null && d.quiet_end === null, "ชั่วโมง 99 (เพี้ยน) → ไม่รับ");

/* test route: มี sub + mock → ok · ไม่มี sub → 404 */
r = await testRoute.POST(jreq("http://x/api/push/test", "POST"));
d = await r.json();
ok(r.status === 200 && d.ok === true && d.sent >= 1, "POST /api/push/test → ส่งหาตัวเอง ok");
const lastCall = wp.calls[wp.calls.length - 1];
ok(lastCall && /ทดสอบการแจ้งเตือน 🔔/.test(lastCall.payload.body), 'ข้อความทดสอบ = "ทดสอบการแจ้งเตือน 🔔"');
await q1(`DELETE FROM push_subscriptions WHERE user_id=$1`, [A]);
r = await testRoute.POST(jreq("http://x/api/push/test", "POST"));
ok(r.status === 404, "ไม่มี subscription → 404 no_subscription");

/* unsubscribe */
await addSub(A, "https://push.test/ep-un1");
await addSub(A, "https://push.test/ep-un2");
r = await unsubRoute.POST(jreq("http://x/a", "POST", { endpoint: "https://push.test/ep-un1" }));
n = await q1(`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1`, [A]);
ok(r.status === 200 && n.n === 1, "unsubscribe ระบุ endpoint → ลบเฉพาะเครื่องนั้น");
r = await unsubRoute.POST(jreq("http://x/a", "POST", {}));
n = await q1(`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1`, [A]);
ok(r.status === 200 && n.n === 0, "unsubscribe ไม่ระบุ endpoint → ลบทุกเครื่อง");

/* ═══ 3 · sw.js: syntax + จำลอง push event ผ่าน vm ═══ */
console.log("[3] sw.js push handlers");
try {
  execFileSync("node", ["--check", "public/sw.js"], { encoding: "utf8" });
  ok(true, "sw.js ผ่าน node --check");
} catch (e) { ok(false, "sw.js ผ่าน node --check", String(e.message).slice(0, 150)); }
const swSrc = readFileSync("public/sw.js", "utf8");
ok(/HK_SW_VERSION = 'r380'/.test(swSrc), "bump HK_SW_VERSION='r380'");

const listeners = {};
const shown = [];
const opened = [];
const swSandbox = {
  console,
  URL,
  fetch: async () => ({ ok: false }),
  caches: { keys: async () => [], open: async () => ({ addAll: async () => {}, match: async () => null }), delete: async () => true },
};
swSandbox.self = {
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  skipWaiting: async () => {},
  location: { origin: "https://hourkey.io" },
  registration: {
    showNotification: async (title, opts) => { shown.push({ title, opts }); },
    unregister: async () => {},
    pushManager: { getSubscription: async () => null },
  },
  clients: {
    claim: async () => {},
    matchAll: async () => [],
    openWindow: async (u) => { opened.push(u); },
  },
};
vm.createContext(swSandbox);
vm.runInContext(swSrc, swSandbox);
ok(listeners.push && listeners.push.length === 1, "มี push handler 1 ตัว");
ok(listeners.notificationclick && listeners.notificationclick.length === 1, "มี notificationclick handler");
ok(listeners.pushsubscriptionchange && listeners.pushsubscriptionchange.length === 1, "มี pushsubscriptionchange handler");
const pushWaits = [];
await listeners.push[0]({
  data: { json: () => ({ title: "hourkey", body: "คำพยากรณ์พร้อมแล้ว 🔮", url: "/master-fusion", tag: "fusion_done" }) },
  waitUntil: (p) => pushWaits.push(p),
});
await Promise.all(pushWaits);
ok(shown.length === 1 && shown[0].title === "hourkey", "push event → showNotification");
ok(shown[0].opts.body === "คำพยากรณ์พร้อมแล้ว 🔮" && shown[0].opts.icon === "/icons/icon-192.png" && shown[0].opts.tag === "fusion_done" && shown[0].opts.data.url === "/master-fusion", "notification มี body/icon/badge/tag/data.url ครบ");
const clickWaits = [];
await listeners.notificationclick[0]({
  notification: { close() {}, data: { url: "/master-fusion" } },
  waitUntil: (p) => clickWaits.push(p),
});
await Promise.all(clickWaits);
ok(opened.length === 1 && opened[0] === "https://hourkey.io/master-fusion", "notificationclick → openWindow url ถูกต้อง");
/* payload พัง → fallback ไม่ throw */
const badWaits = [];
await listeners.push[0]({ data: { json: () => { throw new Error("bad"); }, text: () => "plain" }, waitUntil: (p) => badWaits.push(p) });
await Promise.all(badWaits);
ok(shown.length === 2 && shown[1].opts.body === "plain", "payload ไม่ใช่ JSON → fallback text ไม่พัง");

/* ═══ 4 · UI: hk-pwa hkPush.enable + การ์ด account ═══ */
console.log("[4] UI (vm + DOM stub)");
try {
  execFileSync("node", ["--check", "public/js/hk-pwa.js"], { encoding: "utf8" });
  ok(true, "hk-pwa.js ผ่าน node --check");
} catch (e) { ok(false, "hk-pwa.js ผ่าน node --check", String(e.message).slice(0, 150)); }

/* 4a hkPush.enable: กดเปิด → requestPermission + pushManager.subscribe + POST /api/push/subscribe */
function makePwaSandbox(permissionResult) {
  const record = { permAsked: 0, subscribed: 0, fetches: [] };
  const fakeSub = { endpoint: "https://push.test/vm-ep", toJSON: () => ({ endpoint: "https://push.test/vm-ep", keys: { p256dh: "pk", auth: "au" } }) };
  const reg = {
    update() {},
    pushManager: {
      getSubscription: async () => null,
      subscribe: async (opts) => { record.subscribed++; record.subOpts = opts; return fakeSub; },
    },
  };
  const sb = {
    console, URL, setTimeout, clearTimeout,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    localStorage: { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); } },
    PushManager: function PushManager() {}, // ให้ 'PushManager' in window = true
    Notification: { permission: "default", requestPermission: async () => { record.permAsked++; return permissionResult; } },
    navigator: {
      userAgent: "TestUA Chrome/999",
      serviceWorker: {
        controller: null,
        addEventListener() {},
        getRegistration: async () => reg,
        getRegistrations: async () => [],
        register: async () => reg,
        ready: Promise.resolve(reg),
      },
    },
    fetch: async (url, opts) => {
      record.fetches.push({ url, opts });
      if (url === "/pwa-flag.json") return { ok: true, json: async () => ({ pwa: "canary" }) };
      if (url === "/api/push/vapid-key") return { ok: true, json: async () => ({ key: "BPtestkey_-123" }) };
      if (url === "/api/push/subscribe") return { ok: true, json: async () => ({ ok: true }) };
      if (url === "/api/push/unsubscribe") return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false, json: async () => ({}) };
    },
    document: {
      documentElement: { lang: "th", getAttribute: () => "dark" },
      head: null, body: null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }),
      addEventListener() {}, getElementsByTagName: () => [],
    },
    location: { pathname: "/account.html" },
    matchMedia: () => ({ matches: false }),
    MutationObserver: undefined,
  };
  sb.window = sb;
  sb.self = sb;
  sb.addEventListener = () => {};
  vm.createContext(sb);
  return { sb, record };
}
const pwaSrc = readFileSync("public/js/hk-pwa.js", "utf8");
{
  const { sb, record } = makePwaSandbox("granted");
  vm.runInContext(pwaSrc, sb);
  ok(typeof sb.window.hkPush === "object" && typeof sb.window.hkPush.enable === "function", "hk-pwa.js expose window.hkPush");
  ok(record.permAsked === 0, "โหลดหน้าเฉยๆ ไม่ขอ permission (ห้าม auto)");
  const res = await sb.window.hkPush.enable();
  ok(res.ok === true, "enable() → ok");
  ok(record.permAsked === 1, "enable() ขอ Notification permission 1 ครั้ง");
  ok(record.subscribed === 1 && record.subOpts.userVisibleOnly === true && record.subOpts.applicationServerKey, "เรียก pushManager.subscribe พร้อม VAPID key");
  ok(record.fetches.some((f) => f.url === "/api/push/subscribe" && f.opts && f.opts.method === "POST"), "POST /api/push/subscribe หลัง subscribe สำเร็จ");
  ok(sb.localStorage.getItem("hk_push_on") === "1", "จำสถานะ hk_push_on=1");
  const st = await sb.window.hkPush.state();
  ok(st.supported === true, "state().supported = true");
  const dis = await sb.window.hkPush.disable();
  ok(dis.ok && sb.localStorage.getItem("hk_push_on") === "0" && record.fetches.some((f) => f.url === "/api/push/unsubscribe"), "disable() → unsubscribe + hk_push_on=0");
}
{
  const { sb, record } = makePwaSandbox("denied");
  vm.runInContext(pwaSrc, sb);
  const res = await sb.window.hkPush.enable();
  ok(res.ok === false && res.reason === "denied" && record.subscribed === 0, "permission denied → ไม่ subscribe · reason=denied");
}

/* 4b การ์ด account.html: สวิตช์หลัก → hkPush.enable · ปุ่มทดสอบ → POST /api/push/test */
const HTML = readFileSync("public/account.html", "utf8");
const ntBlock = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("Web Push Phase C"));
ok(!!ntBlock, "พบ script การ์ดการแจ้งเตือนใน account.html");
{
  const els = {};
  function fakeEl(id, extra) {
    const el = {
      id, listeners: {}, textContent: "", innerHTML: "", value: "", checked: false, disabled: false, hidden: false,
      style: {}, dataset: extra && extra.pref ? { pref: extra.pref } : {},
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      async fire(t) { for (const fn of this.listeners[t] || []) await fn.call(this); },
      getAttribute(a) { return this["_attr_" + a] ?? null; },
      setAttribute(a, v) { this["_attr_" + a] = v; },
    };
    els[id] = el;
    return el;
  }
  ["nt-master", "nt-status", "nt-types", "nt-test", "nt-test-msg", "nt-quiet-start", "nt-quiet-end"].forEach((id) => fakeEl(id));
  const prefInputs = [
    fakeEl("nt-fusion-done", { pref: "fusion_done" }),
    fakeEl("nt-day-sniper", { pref: "day_sniper" }),
    fakeEl("nt-daily-omens", { pref: "daily_omens" }),
    fakeEl("nt-promo", { pref: "promo" }),
  ];
  const record = { fetches: [], enableCalls: 0, disableCalls: 0 };
  const sb = {
    console, setTimeout, clearTimeout, Promise, Date, Array, Object, Number, String, JSON,
    window: null,
    document: {
      getElementById: (id) => els[id] || fakeEl(id),
      querySelectorAll: (sel) => {
        if (sel === "#nt-types input[data-pref]") return prefInputs;
        return [];
      },
    },
    fetch: async (url, opts) => {
      record.fetches.push({ url, opts });
      if (url.startsWith("/api/push/prefs") && (!opts || !opts.method || opts.method === "GET"))
        return { ok: true, status: 200, json: async () => ({ fusion_done: true, day_sniper: false, daily_omens: false, promo: false, quiet_start: null, quiet_end: null, subscribed: false }) };
      if (url === "/api/push/prefs") return { ok: true, status: 200, json: async () => ({ ok: true }) };
      if (url === "/api/push/test") return { ok: true, status: 200, json: async () => ({ ok: true, sent: 1 }) };
      return { ok: false, status: 500, json: async () => ({}) };
    },
    esc: (s) => String(s == null ? "" : s),
    tx: (k) => k,
    alertMsg: () => {},
  };
  sb.window = sb;
  sb.window.HK_I18N = {};
  sb.window.hkPush = {
    supported: () => true,
    needsInstall: () => false,
    enable: async () => { record.enableCalls++; return { ok: true }; },
    disable: async () => { record.disableCalls++; return { ok: true }; },
    state: async () => ({ supported: true, needsInstall: false, permission: "default", subscribed: false }),
  };
  vm.createContext(sb);
  vm.runInContext(ntBlock, sb);
  await new Promise((res) => setTimeout(res, 350)); // ให้ refreshMasterState (poll hkPush) จบ
  ok(els["nt-master"].disabled === false, "สวิตช์หลักพร้อมใช้เมื่อเครื่องรองรับ");
  ok(record.enableCalls === 0, "โหลดหน้า → ยังไม่เรียก enable (ไม่ auto)");
  ok(els["nt-quiet-start"].innerHTML.includes("23:00") && els["nt-quiet-start"].innerHTML.includes('value=""'), "dropdown quiet hours 0-23 + ตัวเลือกไม่ใช้");
  /* กดเปิดสวิตช์หลัก */
  els["nt-master"].checked = true;
  await els["nt-master"].fire("change");
  ok(record.enableCalls === 1, "กดเปิด → เรียก hkPush.enable (permission+subscribe จริงอยู่ในนั้น)");
  ok(els["nt-types"].hidden === false, "เปิดสำเร็จ → โชว์ toggle รายประเภท");
  /* toggle รายประเภท → PATCH */
  prefInputs[1].checked = true;
  await prefInputs[1].fire("change");
  const patchCall = record.fetches.find((f) => f.url === "/api/push/prefs" && f.opts && f.opts.method === "PATCH");
  ok(!!patchCall && JSON.parse(patchCall.opts.body).day_sniper === true, "toggle day_sniper → PATCH /api/push/prefs");
  /* ปุ่มทดสอบ */
  await els["nt-test"].fire("click");
  ok(record.fetches.some((f) => f.url === "/api/push/test" && f.opts.method === "POST"), "ปุ่มทดสอบ → POST /api/push/test");
  /* ปิดสวิตช์ */
  els["nt-master"].checked = false;
  await els["nt-master"].fire("change");
  ok(record.disableCalls === 1 && els["nt-types"].hidden === true, "กดปิด → hkPush.disable + ซ่อน toggle");
}

/* ═══ 5 · static: i18n + ids + fusion hook ═══ */
console.log("[5] static checks");
const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let syntaxOk = true;
for (let i = 0; i < scripts.length; i++) {
  try { new Function(scripts[i]); } catch (e) { syntaxOk = false; ok(false, `inline script #${i} syntax`, e.message); }
}
ok(syntaxOk, `inline script ทุกก้อน (${scripts.length}) syntax ผ่าน`);
const ntKeys = [...HTML.matchAll(/data-i18n="(nt\.[^"]+)"/g)].map((m) => m[1]);
const uniqNt = [...new Set(ntKeys)];
const missingNt = uniqNt.filter((k) => {
  const re = new RegExp(`'${k.replace(/\./g, "\\.")}':\\s*\\{[^}]*th:[^}]*en:[^}]*zh:`);
  return !re.test(HTML);
});
ok(uniqNt.length >= 14 && missingNt.length === 0, `i18n nt.* ครบ 3 ภาษา (${uniqNt.length} keys)`, "ขาด: " + missingNt.join(","));
/* key dynamic ที่ไม่อยู่ใน data-i18n ก็ต้องครบ 3 ภาษา */
const dynKeys = ["nt.on", "nt.off", "nt.unsupported", "nt.ios", "nt.denied", "nt.error", "nt.quiet.none", "nt.test.ok", "nt.test.none", "nt.test.err", "nt.saved"];
const missingDyn = dynKeys.filter((k) => {
  const re = new RegExp(`'${k.replace(/\./g, "\\.")}':\\s*\\{[^}]*th:[^}]*en:[^}]*zh:`);
  return !re.test(HTML);
});
ok(missingDyn.length === 0, "i18n dynamic keys (สถานะ/ปุ่ม) ครบ 3 ภาษา", "ขาด: " + missingDyn.join(","));
const ntIds = ["card-notify", "nt-master", "nt-status", "nt-types", "nt-fusion-done", "nt-day-sniper", "nt-daily-omens", "nt-promo", "nt-quiet-start", "nt-quiet-end", "nt-test", "nt-test-msg"];
const missNtIds = ntIds.filter((id) => !HTML.includes(`id="${id}"`));
ok(missNtIds.length === 0, `element การ์ดแจ้งเตือนครบ ${ntIds.length} ids`, "ขาด: " + missNtIds.join(","));
ok(HTML.indexOf('id="card-notify"') > HTML.indexOf('id="card-devices"'), "การ์ดแจ้งเตือนอยู่หลังการ์ดอุปกรณ์");
const fusionSrc = readFileSync("src/app/api/sifu/fusion5/route.ts", "utf8");
ok(/notifyFusionDone\(p\.userId\)/.test(fusionSrc) && /from "@\/lib\/push-sender"/.test(fusionSrc), "fusion5 route เสียบ hook notifyFusionDone แล้ว");
ok((fusionSrc.match(/notifyFusionDone/g) || []).length === 2, "hook จุดเดียว (import + call)");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
ok(!!pkg.dependencies["web-push"], "web-push อยู่ใน package.json dependencies จริง");

/* ═══ cleanup ═══ */
sender.__setWebPushForTest(null);
await cleanup();
console.log(`\n[push-r380] ${pass}/${pass + fail} passed`);
await pool.end();
process.exit(fail ? 1 : 0);
