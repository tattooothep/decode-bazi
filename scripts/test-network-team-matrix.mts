/* เทสเส้น /api/mobile/v1/network/team-matrix — 24 ก.ค. 2569
 * ส่วนที่ 1 = ตัวคิดล้วน (ไม่แตะ DB) · ส่วนที่ 2 = เรียก POST() ของ route ตรง ๆ ผ่าน tsx
 *   → ครอบคลุม auth bearer + เพดานแพ็กเกจ + DB + engine + cache ครบ ขาดแค่ชั้น HTTP ของ Next
 *
 * ⚠️ ความเป็นส่วนตัว: ดึงจาก DB เฉพาะ "รหัส" (uuid + session_version + ธงเวลาเกิด) เท่านั้น
 *    ไม่ SELECT ชื่อ/อีเมล · ที่พิมพ์ออกจอตัดเหลือ 8 ตัวแรกของ uuid เสมอ
 *
 * สิ่งที่ต้องพิสูจน์ (เจ้านายสั่ง 24 ก.ค.):
 *   1) คู่ครบ N(N−1)/2 เป๊ะ · ไม่ซ้ำ · ไม่ขาด
 *   2) ทิศทางไม่สมมาตรจริง (a→b ≠ b→a)
 *   3) ส่งเกินเพดานแพ็กเกจ = 4xx และบอกจำนวน (ห้ามตัดรายชื่อทิ้งเงียบ)
 *   4) คู่ที่มีคนไม่รู้เวลาเกิดถูกติดธง + ความมั่นใจต่ำลงจริง
 *   5) ผลไม่แปรตามวัน (ยิงคนละวันได้ผลเดียวกัน) และต้องมีคำกำกับบอกผู้ใช้ว่าเป็นค่าคงที่
 *
 * รัน: npx tsx --tsconfig tsconfig.json scripts/test-network-team-matrix.mts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";

/* โหลด .env.local เข้า process.env โดยไม่พิมพ์ค่าใด ๆ ออกจอ */
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const { q1, q } = await import("@/lib/db");
const { POST } = await import("@/app/api/mobile/v1/network/team-matrix/route");
const {
  CONFIDENCE_FLOOR,
  HOUR_UNKNOWN_FLAG,
  TEAM_MATRIX_MAX_PEOPLE,
  buildTeamMatrix,
  expectedPairCount,
  pairConfidence,
} = await import("@/app/api/mobile/v1/network/team-matrix/team-matrix-lib");
const { PRODUCT_PAGE_ENTITLEMENTS } = await import("@/lib/product-entitlement");
type Person = Parameters<typeof buildTeamMatrix>[0][number];

const short = (id: string) => String(id).slice(0, 8);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
}

/* ══ ส่วนที่ 1 · ตัวคิดล้วน (ไม่แตะ DB) ═══════════════════════════════════ */
console.log("\n══ ส่วนที่ 1 · ตัวคิดล้วน ══");

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
/** ดวงสมมุติสำหรับเทสตัวคิด (ไม่ใช่คนจริง · ไม่แตะ DB) */
function fakePerson(i: number, hourKnown = true): Person {
  const p = (k: number) => ({ stem: STEMS[(i * 3 + k) % 10], branch: BRANCHES[(i * 5 + k) % 12] });
  return {
    id: `0000000${i}-0000-4000-8000-00000000000${i % 10}`,
    pillars: hourKnown
      ? { year: p(0), month: p(1), day: p(2), hour: p(3) }
      : { year: p(0), month: p(1), day: p(2) },
    hourKnown,
    useful: null,
  };
}

for (const n of [2, 3, 5, 8, TEAM_MATRIX_MAX_PEOPLE]) {
  const t0 = Date.now();
  const m = buildTeamMatrix(Array.from({ length: n }, (_, i) => fakePerson(i)));
  const ms = Date.now() - t0;
  const want = expectedPairCount(n);
  const keys = new Set(m.pairs.map((p) => [p.a, p.b].sort().join("|")));
  check(m.pairs.length === want && keys.size === want && m.coverage.complete,
    `${n} คน = ${want} คู่ ครบไม่ซ้ำ`, `ได้ ${m.pairs.length} คู่ · ไม่ซ้ำ ${keys.size} · ${ms}ms`);
  check(m.pairs.every((p) => p.a !== p.b), `${n} คน: ไม่มีคู่ที่จับกับตัวเอง`);
}

/* ทิศทางไม่สมมาตร */
const sym = buildTeamMatrix(Array.from({ length: 8 }, (_, i) => fakePerson(i)));
const asym = sym.pairs.filter((p) => p.direction.a_to_b !== p.direction.b_to_a);
check(asym.length > 0, "ทิศทางสองฝั่งไม่เท่ากันจริง (a→b ≠ b→a)", `${asym.length}/${sym.pairs.length} คู่`);
check(sym.pairs.every((p) => p.direction.gap === Math.abs(p.direction.a_to_b - p.direction.b_to_a)), "ระยะห่างสองทิศคำนวณตรง");
check(sym.pairs.every((p) => (p.direction.stronger === "even") === (p.direction.a_to_b === p.direction.b_to_a)), "ป้ายฝั่งที่แรงกว่าตรงกับตัวเลข");
const flipped = buildTeamMatrix([fakePerson(1), fakePerson(0)]).pairs[0];
const origin = buildTeamMatrix([fakePerson(0), fakePerson(1)]).pairs[0];
check(flipped.direction.a_to_b === origin.direction.b_to_a && flipped.direction.b_to_a === origin.direction.a_to_b,
  "สลับลำดับคน = ทิศสลับกันพอดี (ไม่ใช่ค่าเดียวกันสองด้าน)",
  `${origin.direction.a_to_b}/${origin.direction.b_to_a}`);

/* ไม่แปรตามวัน — ต้องเป็นแบบนี้ และต้องมีคำกำกับ */
const people6 = Array.from({ length: 6 }, (_, i) => fakePerson(i));
const dayA = buildTeamMatrix(people6, "2026-01-01");
const dayB = buildTeamMatrix(people6, "2026-08-15");
check(hash(dayA) === hash(dayB), "ยิงคนละวันได้ผลเดียวกันเป๊ะ (ปฏิกิริยาพื้นดวง ไม่ใช่ค่าของวันนี้)", `แฮช ${hash(dayA)}`);

/* คนไม่รู้เวลาเกิด → ติดธง + ความมั่นใจลด */
const pairFull = buildTeamMatrix([fakePerson(2), fakePerson(3)]).pairs[0];
const pairOne = buildTeamMatrix([fakePerson(2), fakePerson(3, false)]).pairs[0];
const pairNone = buildTeamMatrix([fakePerson(2, false), fakePerson(3, false)]).pairs[0];
check(pairFull.data_flags.length === 0 && pairFull.hour_unknown.length === 0, "คู่ข้อมูลครบ = ไม่ติดธง");
check(pairOne.data_flags.includes(HOUR_UNKNOWN_FLAG) && pairOne.hour_unknown.length === 1, "คู่ที่มีคนไม่รู้เวลาเกิด 1 คน = ติดธง 3P_NO_HOUR");
check(pairNone.hour_unknown.length === 2, "ไม่รู้เวลาเกิดทั้งคู่ = ระบุครบสองคน");
check(pairOne.confidence.value < pairFull.confidence.value && pairNone.confidence.value < pairOne.confidence.value,
  "ความมั่นใจลดจริงตามจำนวนคนที่ข้อมูลไม่ครบ",
  `ครบ ${pairFull.confidence.value} · ขาด1 ${pairOne.confidence.value} · ขาด2 ${pairNone.confidence.value}`);
check(pairOne.confidence.penalty > 0 && pairOne.confidence.notes.length > 0, "บอกเหตุผลที่ลดความมั่นใจให้ผู้ใช้เห็น");
check(pairConfidence(0.4, 2).value >= CONFIDENCE_FLOOR, "ความมั่นใจไม่ทะลุพื้นลงไปติดลบ");
check(buildTeamMatrix([fakePerson(2), fakePerson(3, false)]).coverage.pairs_with_missing_hour === 1, "coverage นับคู่ที่ข้อมูลไม่ครบ");

/* เพดานของแพ็กเกจ (ค่าคงที่ที่เส้นนี้พึ่งพา) */
check(PRODUCT_PAGE_ENTITLEMENTS.master.network.team_people === TEAM_MATRIX_MAX_PEOPLE, "แพ็กสูงสุด = 12 คน = 66 คู่", `${expectedPairCount(12)} คู่`);
check(PRODUCT_PAGE_ENTITLEMENTS.free.network.team_people === 0, "แพ็กฟรียังไม่เปิดอ่านความสัมพันธ์ในทีม");

/* ══ ส่วนที่ 2 · เส้นจริง (DB + auth + เพดาน + cache) ═════════════════════ */
console.log("\n══ ส่วนที่ 2 · เส้นจริง ══");

const owner = await q1<{ id: string; current_org_id: string; session_version: number | null }>(
  `SELECT id, current_org_id, session_version FROM users WHERE email=$1 AND deleted_at IS NULL AND is_active=true`,
  [process.env.TEAM_MATRIX_TEST_EMAIL || "tattoothep@gmail.com"]
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

/* ip สุ่มต่อรอบเทส เพื่อให้รัน 3 รอบติดได้โดยไม่ชนตัวจำกัดอัตรา (10 ครั้ง/นาที ต่อ ip+user) */
const testIp = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const call = (body: unknown, bearer: string | null = token) =>
  POST(new Request("http://localhost/api/mobile/v1/network/team-matrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": testIp,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  }));

/* ดวงจริงของบัญชีเทส: เอาเฉพาะ id + ธงเวลาเกิด (ไม่แตะชื่อ/อีเมล) */
const rows = await q<{ id: string; hour_known: boolean }>(
  `SELECT id, (birth_time_known IS DISTINCT FROM false) AS hour_known
     FROM profiles
    WHERE created_by_user_id=$1 AND org_id=$2 AND COALESCE(is_archived,false)=false
      AND bazi_pillars IS NOT NULL
    ORDER BY (birth_time_known IS DISTINCT FROM false) DESC, created_at DESC`,
  [owner.id, owner.current_org_id]
);
if (rows.length < 3) throw new Error("ต้องมีดวงที่มีเสาอย่างน้อย 3 ดวงในบัญชีเทส");
const withHour = rows.filter((r) => r.hour_known).map((r) => r.id);
const noHour = rows.filter((r) => !r.hour_known).map((r) => r.id);

/* 1) token ปลอม = 401
 * (เคส "ไม่ส่ง header เลย" จะตกไป getSession() ซึ่งอ่าน cookie ของ Next → เรียกนอก request scope ไม่ได้
 *  เป็นข้อจำกัดของการเทสแบบ import ตรง ไม่ใช่บั๊กของ route · เหมือนที่ test-network-bestday.mts ระบุไว้) */
const anon = await call({ profileIds: rows.slice(0, 2).map((r) => r.id) }, "aaa.bbb.ccc");
check(anon.status === 401, "token ปลอม = 401", `HTTP ${anon.status}`);

/* 2) ไม่ส่งรายชื่อ */
const noBody = await call({});
check(noBody.status === 400, "ไม่ส่ง profileIds = 400", `HTTP ${noBody.status}`);

/* 3) เกินเพดานแพ็กเกจ ต้องบอกจำนวน ห้ามตัดเงียบ */
// รหัสสมมุติ 13 ตัว (รูปแบบถูกต้องแต่ไม่ใช่ดวงจริง) — ด่านเพดานต้องตัดสินก่อนแตะ DB เสมอ
const overIds = Array.from({ length: TEAM_MATRIX_MAX_PEOPLE + 1 }, (_, i) =>
  `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee${String(i).padStart(4, "0")}`);
const over = await call({ profileIds: overIds });
const overBody: any = await over.json();
check(over.status >= 400 && over.status < 500, "ส่งเกินเพดาน = 4xx", `HTTP ${over.status}`);
check(overBody.error === "team_limit_exceeded", "บอกสาเหตุว่าเกินเพดานทีม", String(overBody.error));
check(Number(overBody.requested) === TEAM_MATRIX_MAX_PEOPLE + 1 && Number(overBody.limit) === TEAM_MATRIX_MAX_PEOPLE,
  "บอกจำนวนที่ขอกับเพดานครบ", `ขอ ${overBody.requested} · เพดาน ${overBody.limit}`);
check(typeof overBody.message === "string" && overBody.message.includes(String(overBody.requested)),
  "ข้อความไทยบอกจำนวนจริงให้ผู้ใช้อ่าน");
check(!Array.isArray(overBody.pairs), "เกินเพดานแล้วต้องไม่แอบคืนผลบางส่วน");

/* 4) คนเดียว = ไม่มีคู่ให้อ่าน */
const single = await call({ profileIds: [rows[0].id] });
check(single.status === 400, "ส่งมาคนเดียว = 400", `HTTP ${single.status}`);

/* 5) ของจริง 8 คน */
const teamIds = rows.slice(0, 8).map((r) => r.id);
const t0 = Date.now();
const res = await call({ profileIds: teamIds, centerProfileId: teamIds[0] });
const ms = Date.now() - t0;
const body: any = await res.json();
console.log(`\n── ทีม 8 คน · HTTP ${res.status} · ${ms}ms (server วัดได้ ${body.elapsed_ms}ms) ──`);
check(res.status === 200 && body.ok === true, "ตอบ 200 ok");
check(body.pairs?.length === expectedPairCount(8), `8 คน = ${expectedPairCount(8)} คู่`, `ได้ ${body.pairs?.length}`);
check(body.coverage?.complete === true && body.coverage?.expected_pairs === expectedPairCount(8), "coverage บอกว่าครบ");
const dedup = new Set((body.pairs || []).map((p: any) => [p.a, p.b].sort().join("|")));
check(dedup.size === body.pairs?.length, "ไม่มีคู่ซ้ำ");
const idSet = new Set(teamIds);
check((body.pairs || []).every((p: any) => idSet.has(p.a) && idSet.has(p.b)), "ทุกคู่อ้างถึงคนในทีมที่ขอเท่านั้น");
check((body.pairs || []).every((p: any) => typeof p.score === "number" && p.label?.th && p.summary?.primary),
  "ทุกคู่มีคะแนน + ป้าย + เหตุผลย่อจาก engine");
check((body.pairs || []).some((p: any) => p.reasons?.a_to_b?.length > 0), "มีเหตุผลรายข้อจาก engine");
const asymLive = (body.pairs || []).filter((p: any) => p.direction.a_to_b !== p.direction.b_to_a);
check(asymLive.length > 0, "ทิศทางไม่สมมาตรบนดวงจริง", `${asymLive.length}/${body.pairs?.length} คู่`);
check(body.center_profile_id === teamIds[0], "คืนดวงศูนย์กลางที่แอพขอ", short(String(body.center_profile_id)));
check(body.basis?.time_scope === "static" && !!body.basis?.not_measures?.th, "มีคำกำกับว่าเป็นค่าคงที่ ไม่ใช่ของวันนี้");
check(!!body.basis?.usage_limits?.th && /จ้าง/.test(body.basis.usage_limits.th), "มีคำกำกับห้ามใช้ตัดสินเรื่องงาน/การจ้าง");
check(!("date" in body) && !("today" in body), "ไม่มีช่องที่สื่อว่าเป็นผลของวันนี้");
check(body.entitlement?.limit === TEAM_MATRIX_MAX_PEOPLE, "บอกเพดานที่ใช้จริงกลับไปด้วย");
console.log(`  ตัวอย่างคู่: ${short(body.pairs[0].a)}×${short(body.pairs[0].b)} = ${body.pairs[0].score} (${body.pairs[0].label.th}) · a→b ${body.pairs[0].direction.a_to_b} · b→a ${body.pairs[0].direction.b_to_a} · มั่นใจ ${body.pairs[0].confidence.value}`);

/* 6) cache รอบสอง = ผลเดิมเป๊ะ */
const res2 = await call({ profileIds: teamIds, centerProfileId: teamIds[0] });
const body2: any = await res2.json();
check(body2.cached === true, "รอบสองใช้ cache", `${body2.elapsed_ms}ms (รอบแรก ${body.elapsed_ms}ms)`);
check(hash(body.pairs) === hash(body2.pairs), "ผล cache ตรงกับรอบแรกทุกตัว", `แฮช ${hash(body2.pairs)}`);

/* 7) id ที่ไม่ใช่ของเรา / ไม่มีจริง ต้องไม่หายเงียบ */
const alien = "11111111-2222-4333-8444-555555555555";
const mixed = await call({ profileIds: [...teamIds.slice(0, 3), alien, "not-a-uuid"] });
const mixedBody: any = await mixed.json();
check(mixed.status === 200 && mixedBody.pairs?.length === expectedPairCount(3), "อ่านเฉพาะดวงของเจ้าของบัญชี", `${mixedBody.pairs?.length} คู่`);
check((mixedBody.notAvailable || []).some((n: any) => n.id === alien && n.reason === "not_found_or_not_yours"), "ดวงที่ไม่ใช่ของเรา = แจ้งใน notAvailable");
check((mixedBody.notAvailable || []).some((n: any) => n.reason === "invalid_id"), "รหัสผิดรูป = แจ้งใน notAvailable");
check((mixedBody.people || []).every((p: any) => p.id !== alien), "ไม่มีดวงข้ามบัญชีหลุดเข้ามาในรายชื่อ");

/* 8) คู่ที่มีคนไม่รู้เวลาเกิด บนดวงจริง */
if (noHour.length && withHour.length) {
  const mixIds = [withHour[0], withHour[1] || withHour[0], noHour[0]].filter((v, i, a) => a.indexOf(v) === i);
  const res3 = await call({ profileIds: mixIds });
  const body3: any = await res3.json();
  const flagged = (body3.pairs || []).filter((p: any) => p.hour_unknown.includes(noHour[0]));
  const clean = (body3.pairs || []).filter((p: any) => p.hour_unknown.length === 0);
  check(flagged.length > 0 && flagged.every((p: any) => p.data_flags.includes(HOUR_UNKNOWN_FLAG)),
    "คู่ที่มีคนไม่รู้เวลาเกิดถูกติดธงบนดวงจริง", `${flagged.length} คู่`);
  check(flagged.every((p: any) => p.confidence.penalty > 0 && p.confidence.value < p.confidence.engine),
    "คู่ที่ข้อมูลไม่ครบ ความมั่นใจต่ำกว่าที่ engine ให้");
  check(clean.every((p: any) => p.confidence.penalty === 0), "คู่ข้อมูลครบไม่ถูกหักความมั่นใจ");
  check((body3.people || []).some((p: any) => p.chart_mode === "3p"), "รายชื่อบอกโหมดดวง 3 เสา ให้แอพแสดงได้");
} else {
  console.log("  ⚠️ ข้ามเทสดวง 3 เสาบนของจริง (บัญชีเทสไม่มีดวงที่ไม่รู้เวลาเกิด)");
}

/* 9) เทสว่าเส้นนี้ไม่เขียน DB (read-only) */
const before = await q1<{ n: number }>(`SELECT count(*)::int AS n FROM profiles WHERE created_by_user_id=$1`, [owner.id]);
await call({ profileIds: teamIds.slice(0, 4) });
const after = await q1<{ n: number }>(`SELECT count(*)::int AS n FROM profiles WHERE created_by_user_id=$1`, [owner.id]);
check(before?.n === after?.n, "เส้นนี้ไม่เพิ่ม/ลบข้อมูลโปรไฟล์ (read-only)");

console.log(`\nTEAM_MATRIX ${fail === 0 ? "OK" : "FAIL"} — ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail === 0 ? 0 : 1);
