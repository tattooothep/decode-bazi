/* test-account-r378.mjs · Account Phase 1 (3 ก.ค. 2026)
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/test-account-r378.mjs
 * in-process route pattern (ไม่ยิง server จริง · ไม่ชนพอร์ต 3349-3352)
 * next/headers ถูก stub (scripts/_stub-next-headers.mjs) → cookies() อ่าน globalThis.__testCookies
 * ครอบ: profile GET/PATCH · avatar upload+resize+GET+cache · password ผิด401+rate429+google-set ·
 *       export ครบ field+clip · ping/devices · delete 2ชั้น → login เดิม 401 · UI static checks
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import bcrypt from "bcryptjs";
import sharp from "sharp";

nextEnv.loadEnvConfig(process.cwd());

const { q, q1, pool } = await import("../src/lib/db.ts");
const { signSession } = await import("../src/lib/auth.ts");

let pass = 0, fail = 0;
const ok = (c, l, d = "") => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (d ? " · " + d : ""))); };

const EMAIL_A = "acct-r378-a@test.hourkey.io";
const EMAIL_B = "acct-r378-b@test.hourkey.io";
const PASS_OLD = "OldPass1234";
const PASS_NEW = "NewPass5678";

async function cleanup() {
  const users = await q(
    `SELECT id FROM users WHERE email LIKE '%acct-r378-%@test.hourkey.io'`
  );
  for (const u of users) {
    await q1(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [u.id]);
    await q1(`DELETE FROM chart_sifu_history WHERE user_id=$1`, [u.id]);
    await q1(`DELETE FROM hour_transactions WHERE user_id=$1`, [u.id]);
    await q1(`DELETE FROM user_devices WHERE user_id=$1`, [u.id]);
    await q1(`DELETE FROM profiles WHERE created_by_user_id=$1`, [u.id]);
    await q1(`DELETE FROM org_members WHERE user_id=$1`, [u.id]);
    await q1(`DELETE FROM organizations WHERE owner_user_id=$1`, [u.id]);
    await q1(`DELETE FROM users WHERE id=$1`, [u.id]);
  }
}

async function makeUser(email, { password = null, googleSub = null } = {}) {
  const userId = randomUUID();
  const orgId = randomUUID();
  const hash = password ? await bcrypt.hash(password, 10) : null;
  await q1(
    `INSERT INTO users (id, email, password_hash, google_user_id, name, is_active, created_at)
     VALUES ($1, $2, $3, $4, 'ทดสอบ r378', true, now())`,
    [userId, email, hash, googleSub]
  );
  try {
    await q1(`INSERT INTO organizations (id, owner_user_id, name) VALUES ($1, $2, 'test-org-r378')`, [orgId, userId]);
  } catch {
    await q1(`INSERT INTO organizations (id, name) VALUES ($1, 'test-org-r378')`, [orgId]);
  }
  await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  return { userId, orgId };
}

const setCookie = (token) => { globalThis.__testCookies = token ? { decode_auth: token } : {}; };
const jreq = (url, method, body) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

/* ── routes (in-process) ── */
const profileRoute = await import("../src/app/api/account/profile/route.ts");
const avatarRoute = await import("../src/app/api/account/avatar/route.ts");
const avatarGetRoute = await import("../src/app/api/account/avatar/[userId]/route.ts");
const passwordRoute = await import("../src/app/api/account/password/route.ts");
const exportRoute = await import("../src/app/api/account/export/route.ts");
const deleteRoute = await import("../src/app/api/account/delete/route.ts");
const pingRoute = await import("../src/app/api/account/ping/route.ts");
const devicesRoute = await import("../src/app/api/account/devices/route.ts");
const loginRoute = await import("../src/app/api/auth/login/route.ts"); // อ่านอย่างเดียว · ใช้ยืนยัน delete → login ไม่ได้

await cleanup();
const A = await makeUser(EMAIL_A, { password: PASS_OLD });
const B = await makeUser(EMAIL_B, { googleSub: "test-google-sub-r378" });
const tokenA = await signSession({ userId: A.userId, email: EMAIL_A, orgId: A.orgId });
const tokenB = await signSession({ userId: B.userId, email: EMAIL_B, orgId: B.orgId });

/* seed ข้อมูลไว้เทส export/delete */
const profileId = randomUUID();
await q1(
  `INSERT INTO profiles (id, org_id, created_by_user_id, name, birth_datetime, gender, is_archived)
   VALUES ($1, $2, $3, 'ดวงทดสอบ r378', '1990-01-01T12:00:00+07:00', 'M', false)`,
  [profileId, A.orgId, A.userId]
);
await q1(
  `INSERT INTO hour_transactions (user_id, delta, reason, balance_after, note)
   VALUES ($1, -5, 'test_r378', 495, 'เทส export r378')`,
  [A.userId]
);
await q1(
  `INSERT INTO chart_sifu_history (user_id, profile_id, pillars_hash, question, answer)
   VALUES ($1, $2, 'testhash-r378', 'คำถามทดสอบ r378', $3)`,
  [A.userId, profileId, "ย".repeat(5000)]
);

/* ═══ 1 · profile GET/PATCH ═══ */
console.log("[1] /api/account/profile");
setCookie(null);
ok((await profileRoute.GET()).status === 401, "ไม่ login → 401");
setCookie(tokenA);
let r = await profileRoute.GET();
let d = await r.json();
ok(r.status === 200 && d.email === EMAIL_A, "GET คืนข้อมูลบัญชี");
ok(d.has_password === true && d.google_linked === false, "has_password/google_linked ถูก (user A)");
r = await profileRoute.PATCH(jreq("http://x/api/account/profile", "PATCH", { displayName: "" }));
ok(r.status === 400, "ชื่อว่าง → 400");
r = await profileRoute.PATCH(jreq("http://x/api/account/profile", "PATCH", { displayName: "x".repeat(81) }));
ok(r.status === 400, "ชื่อ 81 ตัว → 400");
r = await profileRoute.PATCH(jreq("http://x/api/account/profile", "PATCH", { displayName: "จาวิสทดสอบ" }));
d = await r.json();
ok(r.status === 200 && d.displayName === "จาวิสทดสอบ", "PATCH เปลี่ยนชื่อสำเร็จ");
const nameRow = await q1(`SELECT name FROM users WHERE id=$1`, [A.userId]);
ok(nameRow.name === "จาวิสทดสอบ", "ชื่อใหม่ persist ลง DB");

/* ═══ 2 · avatar upload + resize + GET ═══ */
console.log("[2] /api/account/avatar");
const bigPng = await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer();
const fd = new FormData();
fd.append("file", new File([bigPng], "test.png", { type: "image/png" }));
r = await avatarRoute.POST(new Request("http://x/api/account/avatar", { method: "POST", body: fd }));
d = await r.json();
ok(r.status === 200 && d.ok, "อัปโหลด 900x700 png → 200", JSON.stringify(d));
ok(String(d.avatar_url || "").startsWith(`/api/account/avatar/${A.userId}?v=`), "avatar_url ชี้ endpoint ใหม่ + cache-bust ?v=");
const avRow = await q1(`SELECT avatar, avatar_updated_at FROM users WHERE id=$1`, [A.userId]);
ok(avRow.avatar && avRow.avatar.length > 0 && avRow.avatar_updated_at, "avatar bytea + avatar_updated_at ลง DB");
const meta = await sharp(avRow.avatar).metadata();
ok(meta.format === "webp" && meta.width === 256 && meta.height === 256, `resize เป็น webp 256x256 (ได้ ${meta.format} ${meta.width}x${meta.height})`);
/* GET รูปกลับ (ไม่ต้อง login) */
setCookie(null);
r = await avatarGetRoute.GET(new Request(`http://x/api/account/avatar/${A.userId}`), { params: Promise.resolve({ userId: A.userId }) });
ok(r.status === 200 && r.headers.get("content-type") === "image/webp", "GET avatar → 200 webp");
ok(r.headers.get("cache-control") === "public, max-age=3600", "Cache-Control 1 ชม.");
const etag = r.headers.get("etag");
const r304 = await avatarGetRoute.GET(new Request(`http://x/a`, { headers: { "if-none-match": etag } }), { params: Promise.resolve({ userId: A.userId }) });
ok(r304.status === 304, "If-None-Match → 304");
ok((await avatarGetRoute.GET(new Request("http://x/a"), { params: Promise.resolve({ userId: "not-a-uuid" }) })).status === 400, "userId ไม่ใช่ uuid → 400");
ok((await avatarGetRoute.GET(new Request("http://x/a"), { params: Promise.resolve({ userId: B.userId }) })).status === 404, "user ไม่มีรูป → 404");
/* ไฟล์เกิน 2MB → 413 */
setCookie(tokenA);
const huge = new FormData();
huge.append("file", new File([Buffer.alloc(2 * 1024 * 1024 + 10)], "big.png", { type: "image/png" }));
ok((await avatarRoute.POST(new Request("http://x/a", { method: "POST", body: huge }))).status === 413, "ไฟล์ >2MB → 413");
const junk = new FormData();
junk.append("file", new File([Buffer.from("not an image")], "x.png", { type: "image/png" }));
ok((await avatarRoute.POST(new Request("http://x/a", { method: "POST", body: junk }))).status === 400, "ไฟล์ไม่ใช่รูป → 400");

/* ═══ 3 · password ═══ */
console.log("[3] /api/account/password");
r = await passwordRoute.POST(jreq("http://x/a", "POST", { current: "WRONG-pass-1", next: PASS_NEW }));
ok(r.status === 401, "รหัสเดิมผิด → 401");
r = await passwordRoute.POST(jreq("http://x/a", "POST", { current: PASS_OLD, next: "short" }));
ok(r.status === 400, "รหัสใหม่ <8 ตัว → 400");
r = await passwordRoute.POST(jreq("http://x/a", "POST", { current: PASS_OLD, next: PASS_NEW }));
d = await r.json();
ok(r.status === 200 && d.mode === "changed", "เปลี่ยนรหัสสำเร็จ (mode=changed)");
const pwRow = await q1(`SELECT password_hash FROM users WHERE id=$1`, [A.userId]);
ok(await bcrypt.compare(PASS_NEW, pwRow.password_hash), "hash ใหม่เทียบ bcrypt ผ่าน");
/* rate limit 5/ชม. — ใช้ไป 3 · ยิงผิดอีก 2 (ครั้งที่ 4,5) แล้วครั้งที่ 6 ต้อง 429 */
await passwordRoute.POST(jreq("http://x/a", "POST", { current: "WRONG-2", next: PASS_NEW + "x" }));
await passwordRoute.POST(jreq("http://x/a", "POST", { current: "WRONG-3", next: PASS_NEW + "x" }));
r = await passwordRoute.POST(jreq("http://x/a", "POST", { current: "WRONG-4", next: PASS_NEW + "x" }));
ok(r.status === 429, "ครั้งที่ 6 ใน 1 ชม. → 429 (rate limit 5/ชม.)", "got " + r.status);
/* google-only → ตั้งรหัสได้โดยไม่ต้องมี current */
setCookie(tokenB);
r = await passwordRoute.POST(jreq("http://x/a", "POST", { next: "GoogleSet999" }));
d = await r.json();
ok(r.status === 200 && d.mode === "set", "บัญชี Google-only ตั้งรหัสครั้งแรก (mode=set)");

/* ═══ 4 · ping + devices ═══ */
console.log("[4] /api/account/ping + /devices");
setCookie(tokenA);
r = await pingRoute.POST(new Request("http://x/a", { method: "POST", headers: { "Content-Type": "application/json", "user-agent": "TestUA/1.0 (Linux) Chrome/999", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ deviceId: "dv_test_r378" }) }));
ok(r.status === 200, "ping บันทึกอุปกรณ์ → 200");
r = await pingRoute.POST(new Request("http://x/a", { method: "POST", headers: { "Content-Type": "application/json", "user-agent": "TestUA/1.0 (Linux) Chrome/999", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ deviceId: "dv_test_r378" }) }));
ok(r.status === 200, "ping ซ้ำ (upsert) → 200");
const devCount = await q1(`SELECT count(*)::int AS n FROM user_devices WHERE user_id=$1`, [A.userId]);
ok(devCount.n === 1, "อุปกรณ์เดิมไม่ถูกบันทึกซ้ำ (unique user+device)");
r = await devicesRoute.GET(new Request("http://x/api/account/devices?device=dv_test_r378", { headers: { "user-agent": "TestUA/1.0 (Linux) Chrome/999" } }));
d = await r.json();
ok(r.status === 200 && d.devices.length === 1, "GET devices คืน 1 เครื่อง");
ok(d.devices[0].current === true, "mark เครื่องปัจจุบัน (current=true)");
ok(!!d.devices[0].ip_hash && d.devices[0].ip_hash.length === 16 && !String(JSON.stringify(d)).includes("203.0.113.9"), "เก็บ ip แบบ hash · ไม่มี IP ดิบใน response");
const devId = d.devices[0].id;
r = await devicesRoute.DELETE(new Request(`http://x/api/account/devices?id=${devId}`, { method: "DELETE" }));
ok(r.status === 200, "DELETE device → 200");
r = await devicesRoute.GET(new Request("http://x/api/account/devices"));
d = await r.json();
ok(d.devices.length === 0, "รายการว่างหลังลบ");
ok((await pingRoute.POST(jreq("http://x/a", "POST", {}))).status === 400, "ping ไม่มี deviceId → 400");

/* ═══ 5 · export (PDPA) ═══ */
console.log("[5] /api/account/export");
r = await exportRoute.GET();
ok(r.status === 200, "export → 200");
ok(String(r.headers.get("content-disposition") || "").includes("attachment"), "Content-Disposition attachment");
d = await r.json();
ok(d.user && d.user.email === EMAIL_A && !("password_hash" in d.user), "user ครบ + ไม่มี password_hash หลุด");
ok(Array.isArray(d.profiles) && d.profiles.some((p) => p.id === profileId), "profiles มีดวงทดสอบ");
ok(Array.isArray(d.hour_transactions) && d.hour_transactions.some((t) => t.note === "เทส export r378"), "ธุรกรรม 時 ครบ");
const hist = (d.sifu_history || []).find((h) => h.question === "คำถามทดสอบ r378");
ok(!!hist, "ประวัติถามซินแสครบ");
ok(hist && hist.answer.length < 2100, `เนื้อยาวถูกตัด (${hist ? hist.answer.length : "-"} < 2100)`);
ok(Array.isArray(d.devices), "มี field devices");

/* ═══ 6 · delete (soft 30 วัน) → login ไม่ได้ ═══ */
console.log("[6] /api/account/delete");
r = await deleteRoute.POST(jreq("http://x/a", "POST", { confirm: "ผิดคำ", password: PASS_NEW }));
ok(r.status === 400, "คำยืนยันผิด → 400");
r = await deleteRoute.POST(jreq("http://x/a", "POST", { confirm: "ลบบัญชี", password: "WRONG-pass" }));
ok(r.status === 401, "รหัสผ่านผิด → 401");
globalThis.__testCookieSets = [];
r = await deleteRoute.POST(jreq("http://x/a", "POST", { confirm: "ลบบัญชี", password: PASS_NEW }));
d = await r.json();
ok(r.status === 200 && d.ok, "delete สำเร็จ → 200", JSON.stringify(d));
const delRow = await q1(`SELECT email, password_hash, google_user_id, deleted_at, is_active, deleted_snapshot FROM users WHERE id=$1`, [A.userId]);
ok(!!delRow.deleted_at && delRow.is_active === false, "deleted_at + is_active=false");
ok(delRow.email.startsWith("deleted+") && delRow.password_hash === null, "email ถูก mangle + password_hash ถูกล้าง");
ok(delRow.deleted_snapshot && delRow.deleted_snapshot.email === EMAIL_A, "snapshot เก็บ email เดิม (กู้คืนได้ 30 วัน)");
const archRow = await q1(`SELECT is_archived FROM profiles WHERE id=$1`, [profileId]);
ok(archRow.is_archived === true, "โปรไฟล์ทั้งหมดถูก archive");
ok((globalThis.__testCookieSets || []).some((c) => c.name === "decode_auth" && c.value === ""), "cookie ถูกเคลียร์ (logout เครื่องนี้)");
/* login เดิม (email/password) ต้อง 401 · เรียก route login จริงแบบอ่านอย่างเดียว */
r = await loginRoute.POST(jreq("http://x/api/auth/login", "POST", { email: EMAIL_A, password: PASS_NEW }));
ok(r.status === 401, "login อีเมล/รหัสเดิมหลังลบ → 401");
/* token เก่า (เครื่องอื่น) เรียก /api/account/* ต้อง 401 (getAccountUser เช็ค deleted_at) */
setCookie(tokenA);
ok((await profileRoute.GET()).status === 401, "token ค้างเครื่องอื่น → /api/account/* = 401");
ok((await exportRoute.GET()).status === 401, "export หลังลบ → 401");
/* avatar สาธารณะของ user ที่ลบ → 404 */
ok((await avatarGetRoute.GET(new Request("http://x/a"), { params: Promise.resolve({ userId: A.userId }) })).status === 404, "avatar หลังลบ → 404");

/* ═══ 7 · UI static checks (account.html + hk-user-menu.js) ═══ */
console.log("[7] UI · account.html + hk-user-menu.js");
const HTML = readFileSync("public/account.html", "utf8");
const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(scripts.length >= 2, `พบ inline script ${scripts.length} ก้อน`);
let syntaxOk = true;
for (let i = 0; i < scripts.length; i++) {
  try {
    new Function(scripts[i]); // syntax check เทียบเท่า node --check
  } catch (e) { syntaxOk = false; ok(false, `script #${i} syntax`, e.message); }
}
ok(syntaxOk, "inline script ทุกก้อน syntax ผ่าน");
try {
  execFileSync("node", ["--check", "public/js/hk-user-menu.js"], { encoding: "utf8" });
  ok(true, "hk-user-menu.js ผ่าน node --check");
} catch (e) { ok(false, "hk-user-menu.js ผ่าน node --check", String(e.message).slice(0, 120)); }
ok(/api\/account\/ping/.test(readFileSync("public/js/hk-user-menu.js", "utf8")), "hk-user-menu.js มี device ping");
/* i18n: ทุก data-i18n key ในส่วน mg.* ต้องมีครบ th/en/zh */
const mgKeys = [...HTML.matchAll(/data-i18n="(mg\.[^"]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(mgKeys)];
const missing = uniq.filter((k) => {
  const re = new RegExp(`'${k.replace(/\./g, "\\.")}':\\s*\\{[^}]*th:[^}]*en:[^}]*zh:`);
  return !re.test(HTML);
});
ok(uniq.length >= 25 && missing.length === 0, `i18n mg.* ครบ 3 ภาษา (${uniq.length} keys)`, "ขาด: " + missing.join(","));
/* โครงหลัก: element id สำคัญต้องมี */
const requiredIds = ["mg-avatar", "display-name", "btn-save-name", "pw-current", "pw-new", "btn-save-pw", "dev-list", "btn-export", "btn-delete-open", "delete-step1", "delete-step2", "del-confirm", "btn-delete-final", "crop-modal", "crop-canvas", "crop-zoom", "spirit-pick"];
const missIds = requiredIds.filter((id) => !HTML.includes(`id="${id}"`));
ok(missIds.length === 0, "element หลักครบ " + requiredIds.length + " ids", "ขาด: " + missIds.join(","));
ok(/SPIRIT_BODY\s*=/.test(HTML) && ["phoenix", "dragon", "qilin", "tiger", "tortoise"].every((k) => HTML.includes(`${k}:`)), "SVG สัตว์มงคลครบ 5 ตัว");
ok(HTML.includes("hk-user-menu.js?v=20"), "bump hk-user-menu.js เป็น ?v=20 ในหน้า account");

/* ═══ cleanup ═══ */
await cleanup();
console.log(`\n[account-r378] ${pass}/${pass + fail} passed`);
await pool.end();
process.exit(fail ? 1 : 0);
