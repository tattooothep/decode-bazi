/**
 * Test · security login (1 มิ.ย.): ตัด fallback secret + rate-limit 3 ทาง login
 * รัน: node --experimental-strip-types scripts/test-auth-security.mts
 */
import { readFileSync } from "node:fs";
const AUTH = readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
const RL = readFileSync(new URL("../src/lib/rate-limit.ts", import.meta.url), "utf8");
const L1 = readFileSync(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");
const L2 = readFileSync(new URL("../src/app/api/auth/login-phone/route.ts", import.meta.url), "utf8");
const L3 = readFileSync(new URL("../src/app/api/auth/login-form/route.ts", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ck = (l: string, c: boolean) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l)); };

console.log("[#1 fallback secret ถูกตัด (fail-closed)]");
ck("ไม่เหลือ fallback secret สาธารณะใน auth.ts", !/decode-dev-secret/.test(AUTH));
ck("มี getSecret() throw ถ้าไม่มี AUTH_SECRET", /function getSecret\(\)/.test(AUTH) && /throw new Error\("AUTH_SECRET/.test(AUTH));
ck("signSession ใช้ getSecret()", /\.sign\(getSecret\(\)\)/.test(AUTH));
ck("verifySession ใช้ getSecret()", /jwtVerify\(token, getSecret\(\)\)/.test(AUTH));
ck("ไม่เหลือตัวแปร SECRET ดิบ", !/\bconst SECRET =/.test(AUTH));

console.log("\n[#2 rate-limit ครบ 3 ทาง login (กัน brute-force)]");
ck("login route ใช้ rateLimit ก่อนเรียก verifyPassword", /rateLimit\(/.test(L1) && L1.indexOf("rateLimit(") < L1.indexOf("verifyPassword(password"));
ck("login-phone ใช้ rateLimit ก่อนเรียก verifyPassword", /rateLimit\(/.test(L2) && L2.indexOf("rateLimit(") < L2.indexOf("verifyPassword(password"));
ck("login-form ใช้ rateLimit ก่อนเรียก verifyPassword", /rateLimit\(/.test(L3) && L3.indexOf("rateLimit(") < L3.indexOf("verifyPassword(password"));
ck("login/login-phone ตอบ 429 เมื่อเกิน", /status: 429/.test(L1) && /status: 429/.test(L2));
ck("ใช้ clientIp + อีเมล/เบอร์ เป็น key", /clientIp\(req\)/.test(L1) && /clientIp\(req\)/.test(L2) && /clientIp\(req\)/.test(L3));

console.log("\n[#3 rate-limit logic (sliding window)]");
const mod = await import(new URL("../src/lib/rate-limit.ts", import.meta.url).href);
const k = "t:" + Math.random();
let okCount = 0, blocked = false, retry = 0;
for (let i = 0; i < 7; i++) {
  const r = mod.rateLimit(k, 5, 60_000);
  if (r.ok) okCount++; else { blocked = true; retry = r.retryAfterMs; }
}
ck("อนุญาต 5 ครั้งแรก", okCount === 5);
ck("บล็อกครั้งที่ 6+ (429)", blocked);
ck("retryAfterMs > 0 เมื่อบล็อก", retry > 0);
const r2 = mod.rateLimit("other:" + Math.random(), 5, 60_000);
ck("key อื่นไม่โดนผลกระทบ (แยก bucket)", r2.ok);

console.log(`\n[auth-security] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
