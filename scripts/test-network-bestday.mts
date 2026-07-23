/* เทสเส้น /api/mobile/v1/network/bestday — 23 ก.ค. 2569
 * เรียก GET() ของ route ตรง ๆ ผ่าน tsx (ยังไม่ build/restart ตามคำสั่ง)
 * → ครอบคลุม auth bearer + rate limit + DB + engine + cache ครบ ขาดแค่ชั้น HTTP ของ Next
 *
 * ⚠️ ความเป็นส่วนตัว: ดึงจาก DB เฉพาะ "รหัส" (uuid + session_version) เท่านั้น
 *    ไม่ SELECT อีเมล/ชื่อ · ที่พิมพ์ออกจอตัดเหลือ 8 ตัวแรกของ uuid เสมอ
 * รัน: npx tsx --tsconfig tsconfig.json scripts/test-network-bestday.mts
 */
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";

/* โหลด .env.local เข้า process.env โดยไม่พิมพ์ค่าใด ๆ ออกจอ */
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const { q1, q } = await import("@/lib/db");
const { GET } = await import("@/app/api/mobile/v1/network/bestday/route");
const { dayScoreLabelLevel } = await import("@/lib/scoring/pair-base");

const short = (id: string) => String(id).slice(0, 8);
let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
}

/* บัญชีเทส: อ่านเฉพาะรหัส ไม่แตะคอลัมน์ที่เป็นข้อมูลส่วนตัว */
const owner = await q1<{ id: string; current_org_id: string; session_version: number | null }>(
  `SELECT id, current_org_id, session_version FROM users WHERE email=$1 AND deleted_at IS NULL AND is_active=true`,
  [process.env.BESTDAY_TEST_EMAIL || "tattoothep@gmail.com"]
);
if (!owner) throw new Error("ไม่พบบัญชีเทส");

const token = await new SignJWT({
  userId: owner.id,
  email: "redacted@test.local", // validateMobileBearerToken ดึงอีเมลจริงจาก DB เองอยู่แล้ว
  orgId: owner.current_org_id,
  sv: Number(owner.session_version) || 0,
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

/* ดวงเป้าหมาย: เอาเฉพาะ id ของคนอื่นในเครือข่ายที่มีเสาครบ */
const targets = await q<{ id: string }>(
  `SELECT id FROM profiles
    WHERE created_by_user_id=$1 AND org_id=$2 AND COALESCE(is_archived,false)=false
      AND relationship_type IS NOT NULL AND btrim(relationship_type) <> ''
      AND bazi_pillars IS NOT NULL
    ORDER BY created_at DESC LIMIT 2`,
  [owner.id, owner.current_org_id]
);
if (targets.length < 2) throw new Error("ต้องมีดวงคนอื่นในเครือข่ายอย่างน้อย 2 ดวง");

const call = (qs: string, bearer: string | null = token) =>
  GET(new Request(`http://localhost/api/mobile/v1/network/bestday${qs}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  }));

async function inspect(profileId: string, label: string) {
  const res = await call(`?profileId=${profileId}`);
  const body: any = await res.json();
  console.log(`\n── ${label} · ดวง ${short(profileId)} · HTTP ${res.status} ──`);
  check(res.status === 200 && body.ok === true, "ตอบ 200 ok");
  check(Array.isArray(body.days) && body.days.length === 14, "ได้ 14 วัน", `ได้ ${body.days?.length}`);
  check(body.days?.[0]?.date === body.start_date, "วันแรก = วันนี้ (ไม่ถอยไปเมื่อวาน)", `${body.days?.[0]?.date}`);

  const distinct = new Set(body.days.map((d: any) => d.score)).size;
  check(distinct >= 5, "คะแนนแปรตามวันจริง", `ค่าต่างกัน ${distinct}/14 วัน`);

  const mismatch = body.days.filter((d: any) => d.label !== dayScoreLabelLevel(d.score).label);
  check(mismatch.length === 0, "ป้ายตรงกับคะแนนเฉลี่ยทุกวัน", `ไม่ตรง ${mismatch.length} วัน`);

  const avgBad = body.days.filter((d: any) => d.score !== Math.round((d.self.score + d.other.score) / 2));
  check(avgBad.length === 0, "คะแนน = เฉลี่ยสองฝั่ง");

  const noReason = body.days.filter((d: any) => !d.why?.text || !d.day_pillar);
  check(noReason.length === 0, "ทุกวันมีเสาวัน + เหตุผลจาก engine");

  check(!!body.basis?.measures?.th && !!body.basis?.not_measures?.th, "มีคำกำกับที่มาของคะแนน");
  console.log(`  วันดีสุด: ${body.best?.date} (${body.best?.score} ${body.best?.label})`);
  console.log(`  ควรเลี่ยง: ${body.avoid ? `${body.avoid.date} (${body.avoid.score} ${body.avoid.label})` : "null — engine ไม่ตีระดับว่าควรเลี่ยง"}`);
  console.log(`  เหตุผลวันดีสุด: ${body.best?.why?.text?.slice(0, 150)}`);
  return body;
}

console.log("════ รอบ 1 · ดวงที่หนึ่ง ════");
const r1 = await inspect(targets[0].id, "รอบ 1");
check(r1.cached === false, "รอบแรกยังไม่มี cache");

console.log("\n════ รอบ 2 · ดวงที่สอง (ต้องได้ผลคนละชุด) ════");
const r2 = await inspect(targets[1].id, "รอบ 2");
check(
  JSON.stringify(r1.days.map((d: any) => d.score)) !== JSON.stringify(r2.days.map((d: any) => d.score)),
  "คนละคนได้คะแนนคนละชุด (ไม่ใช่ค่าคงที่)"
);

console.log("\n════ รอบ 3 · cache + ด่านความปลอดภัย ════");
const r3 = await call(`?profileId=${targets[0].id}`);
const b3: any = await r3.json();
check(b3.cached === true, "รอบสองของคู่เดิมมาจาก cache 6 ชม.");
check(
  JSON.stringify(b3.days) === JSON.stringify(r1.days),
  "ค่าจาก cache ตรงกับรอบแรกทุกตัว"
);

/* token ปลอม = 401 (ทางนี้ไม่แตะ cookie fallback จึงเทสใน harness ได้จริง)
 * ส่วนเคส "ไม่ส่ง header เลย" จะตกไป getSession() ซึ่งอ่าน cookie ของ Next
 * → เรียกนอก request scope ไม่ได้ (ข้อจำกัดของการเทสแบบ import ตรง ไม่ใช่บั๊กของ route) */
const badToken = await call(`?profileId=${targets[0].id}`, "aaa.bbb.ccc");
check(badToken.status === 401, "token ปลอม = 401");
const badId = await call(`?profileId=not-a-uuid`);
check(badId.status === 400, "profileId ผิดรูป = 400");
const missing = await call(`?profileId=00000000-0000-4000-8000-000000000000`);
check(missing.status === 404, "ดวงที่ไม่ใช่ของบัญชีนี้ = 404");
const noParam = await call("");
check(noParam.status === 400, "ไม่ส่ง profileId = 400");

console.log(`\n════ สรุป: ผ่าน ${pass} · ไม่ผ่าน ${fail} ════`);
process.exit(fail ? 1 : 0);
