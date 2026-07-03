/* test-fusion5-guest-r381.mjs · "ดวงชั่วคราว" (guest births) fusion5 (r381)
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/test-fusion5-guest-r381.mjs
 * in-process route pattern (ไม่ยิง server จริง · ไม่ชนพอร์ต 3349-3352)
 *   - next/headers stub → cookies() อ่าน globalThis.__testCookies (jwt mint ด้วย signSession)
 *   - /api/sifu ภายในถูก mock ด้วย http server local (SIFU_INTERNAL_BASE_URL) → จับ payload ทุก call ไม่เรียก AI จริง
 * ครอบ:
 *   [1] unit: parseGuestBirths validate (วันเกิดมั่ว/นอกช่วง/เวลาเพี้ยน/เพศ/lat/default ชื่อ+กทม)
 *   [2] unit: buildGuestFusionBirth golden เอี๊ยว 1984-12-31 13:15 → 甲子/丙子/己亥/庚午 (calcBazi Layer 1)
 *       + shape baziPillars {ge_ju,pillars,day_boundary} เหมือน DB + yongshen=null + no-time → 3p
 *   [3] unit: buildGuestBaziPanelPrompt (PILLAR LOCK/GUEST_NOTE/คำถาม/≤cap · no-time · pair packet)
 *   [4] route: guest เดี่ยว (bazi+western) → job done · bazi ไป externalPrompt · yam ถูก · GET คืน guest
 *   [5] route: profile 1 + guest 1 (bazi) → pair ทำงาน (PAIR_INTERACTION_PACKET มีทั้งคู่ ทั้งสองฝั่ง)
 *   [6] route: 4 ดวง (2 profiles + 2 guests · western) → prompt ≤118K + ชื่อครบ + yam 4 ดวง
 *   [7] route: เกิน 4 → 400 · วันเกิดมั่ว → 400 · guest ไม่ทราบเวลา → ziwei skipped + western no-time note
 *   [8] ไม่มี row ใหม่ในตาราง profiles (นับก่อน/หลัง) · jobs.guest_births เก็บครบ · resonance/day-sniper ไม่ล้ม
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

let pass = 0, fail = 0;
const ok = (c, l, d = "") => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (d ? " · " + d : ""))); };

/* ── mock /api/sifu ภายใน (จับ payload · ตอบ reply คงที่ · ไม่เรียก AI จริง) ── */
const sifuCalls = [];
const mock = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => { chunks.push(c); });
  req.on("end", () => {
    // Buffer.concat ก่อนค่อย toString — กัน multibyte ไทย/จีนขาดกลาง chunk (length เพี้ยน +1)
    const body = Buffer.concat(chunks).toString("utf8");
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch {}
    sifuCalls.push({ url: req.url, payload });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ reply: `【mock-reply】ฟันธงทดสอบจาก ${payload.model || "?"} · ` + "x".repeat(80), model: payload.model || "mock" }));
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockPort = mock.address().port;
process.env.SIFU_INTERNAL_BASE_URL = `http://127.0.0.1:${mockPort}`;

/* ── imports หลังตั้ง env (route อ่าน SIFU_INTERNAL_BASE_URL ตอน module load) ── */
const { q, q1, pool } = await import("../src/lib/db.ts");
const { signSession } = await import("../src/lib/auth.ts");
const { calcBazi } = await import("../src/lib/bazi-calc.ts");
const { parseGuestBirths, buildGuestFusionBirth, buildGuestBaziPanelPrompt } = await import("../src/lib/fusion5/guest-birth.ts");
const { FUSION_PANEL_PROMPT_MAX_CHARS } = await import("../src/lib/fusion5/build-prompt.ts");
const fusion5Route = await import("../src/app/api/sifu/fusion5/route.ts");

const EMAIL = "fusion5-guest-r381@test.hourkey.io";
const setCookie = (token) => { globalThis.__testCookies = token ? { decode_auth: token } : {}; };
const jreq = (method, body) => new Request("http://127.0.0.1/api/sifu/fusion5", {
  method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const greq = (qs) => new Request(`http://127.0.0.1/api/sifu/fusion5?${qs}`, { method: "GET" });

async function cleanup() {
  const users = await q(`SELECT id FROM users WHERE email = $1`, [EMAIL]);
  for (const u of users) {
    await q1(`DELETE FROM fusion5_jobs WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM research_ai_messages WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM research_events WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM hour_transactions WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM push_skip_log WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [u.id]);
    await q1(`DELETE FROM profiles WHERE created_by_user_id=$1`, [u.id]);
    await q1(`DELETE FROM org_members WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM organizations WHERE owner_user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM users WHERE id=$1`, [u.id]);
  }
}

async function makeUser() {
  const userId = randomUUID();
  const orgId = randomUUID();
  await q1(`INSERT INTO users (id, email, name, is_active, hour_balance, created_at) VALUES ($1,$2,'เทส guest r381',true,10000,now())`, [userId, EMAIL]);
  try {
    await q1(`INSERT INTO organizations (id, owner_user_id, name) VALUES ($1,$2,'test-org-guest-r381')`, [orgId, userId]);
  } catch {
    await q1(`INSERT INTO organizations (id, name) VALUES ($1,'test-org-guest-r381')`, [orgId]);
  }
  await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  return { userId, orgId };
}

/* profile ทดสอบ = golden Mai 1986-04-12 16:42 (จะได้เทียบ pair กับ guest) · bazi_pillars เขียนด้วย calcBazi (Layer 1) */
async function makeProfile(orgId, userId, name, date, time, gender, relationshipType = null) {
  const id = randomUUID();
  const calc = await calcBazi({ date, time, longitude: 100.5018, gmtOffsetHours: 7, gender, dayBoundary: "23:00", birthTimeKnown: true });
  await q1(
    `INSERT INTO profiles (id, org_id, created_by_user_id, name, relationship_type, birth_datetime, birth_lat, birth_lng, gender, birth_time_known, is_archived, bazi_pillars)
     VALUES ($1,$2,$3,$4,$5,$6::timestamptz,13.7563,100.5018,$7,true,false,$8)`,
    [id, orgId, userId, name, relationshipType, `${date}T${time}:00+07:00`, gender, JSON.stringify({ ge_ju: calc.geJu.structure || null, pillars: calc.pillars, day_boundary: "23:00" })]
  );
  return id;
}

async function pollJob(jobId, timeoutMs = 240_000) {
  const t0 = Date.now();
  for (;;) {
    const row = await q1(`SELECT status, result, error, guest_births FROM fusion5_jobs WHERE id=$1`, [jobId]);
    if (row && row.status !== "running") return row;
    if (Date.now() - t0 > timeoutMs) return row || { status: "timeout" };
    await new Promise((r) => setTimeout(r, 500));
  }
}

await cleanup();
const A = await makeUser();
const token = await signSession({ userId: A.userId, email: EMAIL, orgId: A.orgId });
setCookie(token);
const profileMai = await makeProfile(A.orgId, A.userId, "ไหมมี่เทส", "1986-04-12", "16:42", "F");
const profileAeaw = await makeProfile(A.orgId, A.userId, "เอี๊ยวโปรไฟล์", "1984-12-31", "13:15", "M", "เพื่อน"); // กัน unique self ต่อ org
const profilesBefore = Number((await q1(`SELECT count(*)::text AS n FROM profiles`)).n);

/* ═══ [1] unit · parseGuestBirths ═══ */
console.log("[1] parseGuestBirths validate");
{
  let r = parseGuestBirths([{ birthDate: "1899-12-31", gender: "M" }]);
  ok(!r.ok && r.error === "guest_birth_date_out_of_range", "ก่อน 1900 → out_of_range");
  r = parseGuestBirths([{ birthDate: "2999-01-01", gender: "M" }]);
  ok(!r.ok && r.error === "guest_birth_date_out_of_range", "อนาคต → out_of_range");
  r = parseGuestBirths([{ birthDate: "2026-02-30", gender: "M" }]);
  ok(!r.ok && r.error === "invalid_guest_birth_date", "2026-02-30 (วันมั่ว) → invalid");
  r = parseGuestBirths([{ birthDate: "31-12-1984", gender: "M" }]);
  ok(!r.ok && r.error === "invalid_guest_birth_date", "format มั่ว → invalid");
  r = parseGuestBirths([{ birthDate: "1984-12-31", birthTime: "25:00", gender: "M" }]);
  ok(!r.ok && r.error === "invalid_guest_birth_time", "เวลา 25:00 → invalid_time");
  r = parseGuestBirths([{ birthDate: "1984-12-31", gender: "X" }]);
  ok(!r.ok && r.error === "invalid_guest_gender", "เพศมั่ว → invalid_gender");
  r = parseGuestBirths([{ birthDate: "1984-12-31", gender: "M", lat: 999 }]);
  ok(!r.ok && r.error === "invalid_guest_lat", "lat 999 → invalid_lat");
  r = parseGuestBirths([{ birthDate: "1984-12-31", birthTime: "13:15", gender: "M" }, { birthDate: "1990-05-05", birthTime: null, gender: "F" }]);
  ok(r.ok && r.list.length === 2, "เคสถูก 2 ดวง → ok");
  if (r.ok) {
    ok(r.list[0].name === "ดวงชั่วคราว 1" && r.list[1].name === "ดวงชั่วคราว 2", "ชื่อ default ดวงชั่วคราว 1/2");
    ok(r.list[0].lat === 13.7563 && r.list[0].lng === 100.5018, "lat/lng default กทม");
    ok(r.list[1].birthTime === null, "ไม่ส่งเวลา → birthTime null");
  }
  r = parseGuestBirths([1, 2, 3, 4, 5].map(() => ({ birthDate: "1990-01-01", gender: "M" })));
  ok(!r.ok && r.error === "too_many_births", "guest 5 ดวง → too_many_births");
  r = parseGuestBirths(undefined);
  ok(r.ok && r.list.length === 0, "ไม่ส่ง guestBirths → list ว่าง (backward compat)");
}

/* ═══ [2] unit · buildGuestFusionBirth golden ═══ */
console.log("[2] buildGuestFusionBirth golden เอี๊ยว + shape + no-time");
{
  const [g] = parseGuestBirths([{ name: "เอี๊ยวเทส", birthDate: "1984-12-31", birthTime: "13:15", gender: "M" }]).list;
  const b = await buildGuestFusionBirth(g);
  const p = b.baziPillars.pillars;
  ok(p.year.stem + p.year.branch === "甲子", "เสาปี 甲子", JSON.stringify(p.year));
  ok(p.month.stem + p.month.branch === "丙子", "เสาเดือน 丙子", JSON.stringify(p.month));
  ok(p.day.stem + p.day.branch === "己亥", "เสาวัน 己亥", JSON.stringify(p.day));
  ok(p.hour.stem + p.hour.branch === "庚午", "เสายาม 庚午", JSON.stringify(p.hour));
  ok("ge_ju" in b.baziPillars && "pillars" in b.baziPillars && b.baziPillars.day_boundary === "23:00", "shape baziPillars = {ge_ju,pillars,day_boundary} เหมือน DB jsonb");
  ok(b.yongshen === null, "yongshen = null (R5 ข้ามสุภาพ)");
  ok(b.isGuest === true && b.profileId === null && b.isSelf === false, "isGuest true · ไม่มี profileId");
  ok(b.dtUTC.toISOString() === "1984-12-31T06:15:00.000Z", "dtUTC = wall time +07:00", b.dtUTC.toISOString());
  ok(b.hasTime === true && b.guestCalc.mode === "4p", "รู้เวลา → 4p");

  const [gn] = parseGuestBirths([{ birthDate: "1984-12-31", birthTime: null, gender: "M" }]).list;
  const bn = await buildGuestFusionBirth(gn);
  ok(bn.hasTime === false && bn.guestCalc.mode === "3p" && bn.baziPillars.pillars.hour === null, "ไม่ทราบเวลา → 3p + hour null (honest null)");
  ok(bn.birthTime === "12:00", "no-time ใช้ 12:00 noon convention เดิม");
}

/* ═══ [3] unit · buildGuestBaziPanelPrompt ═══ */
console.log("[3] buildGuestBaziPanelPrompt");
{
  const [g] = parseGuestBirths([{ name: "เอี๊ยวเทส", birthDate: "1984-12-31", birthTime: "13:15", gender: "M" }]).list;
  const b = await buildGuestFusionBirth(g);
  const prompt = await buildGuestBaziPanelPrompt({
    focus: b, allNames: ["เอี๊ยวเทส"], question: "ปี 2026 การเงินเป็นอย่างไร", lang: "th",
    timingLine: "จังหวะเวลาที่ผู้ใช้ถาม: ปี 2026", notes: ["NOTE_TEST_MARKER"],
  });
  ok(prompt.includes("年甲子 月丙子 日己亥 時庚午"), "PILLAR LOCK golden ครบ 4 เสา");
  ok(prompt.includes("GUEST_NOTE") && prompt.includes("ดวงชั่วคราว"), "มี GUEST_NOTE ดวงชั่วคราว + note 用神 ตามจริง");
  ok(prompt.includes("ไม่มีข้อมูล用神ที่บันทึกไว้"), "ระบุไม่มี用神บันทึก (ตามจริง)");
  ok(prompt.includes("ปี 2026 การเงินเป็นอย่างไร") && prompt.includes("NOTE_TEST_MARKER"), "มีคำถาม + notes จาก worker");
  ok(prompt.includes("CHART PACKET รายเสา"), "มี packet canonical จาก renderChartPrompt");
  ok(prompt.includes("=== คัมภีร์ปาจื้อ"), "มีคัมภีร์ปฏิกิริยา");
  ok(prompt.length <= FUSION_PANEL_PROMPT_MAX_CHARS - 2000, `≤ cap-headroom (${prompt.length})`);

  const [gn] = parseGuestBirths([{ name: "โนไทม์", birthDate: "1993-06-06", birthTime: null, gender: "F" }]).list;
  const bn = await buildGuestFusionBirth(gn);
  const pn = await buildGuestBaziPanelPrompt({ focus: bn, allNames: ["โนไทม์"], question: "งานปีนี้", lang: "th" });
  ok(pn.includes("ไม่ทราบเวลาเกิด") && pn.includes("時—"), "no-time: เตือน 3 เสา + 時—");
  ok(pn.includes("ดวง 3 เสา"), "no-time: packet ติดธง 3p");
}

/* ═══ [4] route · guest เดี่ยว (bazi+western) ═══ */
console.log("[4] POST guest เดี่ยว bazi+western");
let jobGuestSolo = null;
{
  sifuCalls.length = 0;
  const res = await fusion5Route.POST(jreq("POST", {
    sciences: ["bazi", "western"],
    question: "ทดสอบดวงชั่วคราวเดี่ยว การเงินปี 2026",
    guestBirths: [{ name: "เอี๊ยวเทส", birthDate: "1984-12-31", birthTime: "13:15", gender: "M" }],
  }));
  const j = await res.json();
  ok(res.status === 200 && j.jobId, "POST 200 + jobId", JSON.stringify(j).slice(0, 200));
  jobGuestSolo = j.jobId;
  ok(j.yam?.charged === 25, "yam = 10(bazi)+10(western) ×1ดวง +5(judge) = 25", String(j.yam?.charged));
  ok(Array.isArray(j.guestBirths) && j.guestBirths[0]?.name === "เอี๊ยวเทส", "POST คืน guestBirths");
  ok((j.profileNames || []).join(",") === "เอี๊ยวเทส", "profileNames = ชื่อ guest");
  const row = await pollJob(j.jobId);
  ok(row.status === "done", "job done (mock sifu)", row.status + " " + (row.error || ""));
  const baziCall = sifuCalls.find((c) => typeof c.payload.externalPrompt === "string" && c.payload.externalPrompt.includes("GUEST_NOTE") && c.payload.externalPrompt.includes("八字"));
  ok(!!baziCall, "bazi ของ guest ไปทาง externalPrompt (ไม่ใช่ profileId)");
  ok(baziCall && !baziCall.payload.profileId, "payload bazi guest ไม่มี profileId");
  ok(baziCall && baziCall.payload.externalPrompt.includes("年甲子 月丙子 日己亥 時庚午"), "externalPrompt มี PILLAR LOCK golden");
  ok(baziCall && baziCall.payload.externalPrompt.length <= FUSION_PANEL_PROMPT_MAX_CHARS, "bazi guest prompt ≤ 118K");
  const westernCall = sifuCalls.find((c) => typeof c.payload.externalPrompt === "string" && c.payload.externalPrompt.includes("โหราตะวันตก"));
  ok(!!westernCall && westernCall.payload.externalPrompt.includes("เอี๊ยวเทส"), "western panel มีชื่อ guest ใน prompt");
  const panels = row.result?.fusion5?.panels || [];
  ok(panels.length === 2 && panels.every((x) => x.ok), "panel 2 ศาสตร์ ok ครบ");
  /* GET jobId คืน guest */
  const gres = await fusion5Route.GET(greq(`jobId=${j.jobId}`));
  const gj = await gres.json();
  ok(gres.status === 200 && Array.isArray(gj.guestBirths) && gj.guestBirths[0]?.name === "เอี๊ยวเทส" && gj.guestBirths[0]?.birthDate === "1984-12-31", "GET jobId คืน guestBirths ครบ (UI วาดชื่อได้)");
}

/* ═══ [5] route · profile + guest = pair ═══ */
console.log("[5] POST profile 1 + guest 1 (bazi pair)");
{
  sifuCalls.length = 0;
  const res = await fusion5Route.POST(jreq("POST", {
    profileIds: [profileMai],
    sciences: ["bazi"],
    question: "ดูคู่โปรไฟล์กับดวงชั่วคราว เข้ากันไหม",
    guestBirths: [{ name: "เอี๊ยวเทส", birthDate: "1984-12-31", birthTime: "13:15", gender: "M" }],
  }));
  const j = await res.json();
  ok(res.status === 200 && j.jobId, "POST 200 + jobId");
  ok(j.pairMode === true && (j.profileNames || []).length === 2, "pairMode true · 2 ดวง (ลำดับ: profile ก่อน guest)");
  ok(j.profileNames?.[0] === "ไหมมี่เทส" && j.profileNames?.[1] === "เอี๊ยวเทส", "ลำดับชื่อ: profile → guest", JSON.stringify(j.profileNames));
  ok(j.yam?.charged === 20, "yam = 10(bazi) ×2ดวง = 20 (ศาสตร์เดียวไม่มี judge)", String(j.yam?.charged));
  const row = await pollJob(j.jobId);
  ok(row.status === "done", "pair job done", row.status + " " + (row.error || ""));
  const profCall = sifuCalls.find((c) => c.payload.profileId === profileMai);
  const guestCall = sifuCalls.find((c) => typeof c.payload.externalPrompt === "string" && c.payload.externalPrompt.includes("GUEST_NOTE"));
  ok(!!profCall, "ฝั่ง profile ยังไปทาง profileId เดิม (pipeline sifu เต็ม)");
  ok(!!guestCall, "ฝั่ง guest ไปทาง externalPrompt");
  const profHasPair = profCall && String(profCall.payload.message || "").includes("PAIR_INTERACTION_PACKET bazi");
  const guestHasPair = guestCall && guestCall.payload.externalPrompt.includes("PAIR_INTERACTION_PACKET bazi");
  ok(profHasPair && guestHasPair, "pair packet มีทั้งสองฝั่ง");
  const pairInGuest = guestCall && guestCall.payload.externalPrompt.includes("ไหมมี่เทส") && guestCall.payload.externalPrompt.includes("เอี๊ยวเทส");
  ok(pairInGuest, "pair packet ฝั่ง guest มีชื่อทั้งคู่ (synastry จาก pillars calcBazi)");
  ok(row.result?.fusion5?.pairMode === true, "result pairMode true");
}

/* ═══ [6] route · 4 ดวง (2 profiles + 2 guests · western) ≤118K ═══ */
console.log("[6] POST 4 ดวง (2+2) western");
{
  sifuCalls.length = 0;
  const res = await fusion5Route.POST(jreq("POST", {
    profileIds: [profileMai, profileAeaw],
    sciences: ["western"],
    question: "ทั้ง 4 คนร่วมทีมกันดีไหม",
    guestBirths: [
      { name: "เกสต์หนึ่ง", birthDate: "1991-07-15", birthTime: "02:30", gender: "M" },
      { name: "เกสต์สอง", birthDate: "1995-11-03", birthTime: "13:45", gender: "F", lat: 7.8804, lng: 98.3923 },
    ],
  }));
  const j = await res.json();
  ok(res.status === 200 && j.jobId, "POST 200 (4 ดวงรวม guest)");
  ok(j.yam?.charged === 40, "yam = 10(western) ×4ดวง = 40", String(j.yam?.charged));
  const row = await pollJob(j.jobId);
  ok(row.status === "done", "job 4 ดวง done", row.status + " " + (row.error || ""));
  const wCall = sifuCalls.find((c) => typeof c.payload.externalPrompt === "string" && c.payload.externalPrompt.includes("เกสต์หนึ่ง"));
  ok(!!wCall, "western call มี guest ใน prompt");
  const ep = wCall ? wCall.payload.externalPrompt : "";
  ok(ep.length <= FUSION_PANEL_PROMPT_MAX_CHARS, `prompt 4 ดวง ≤118K (${ep.length})`);
  ok(["ไหมมี่เทส", "เอี๊ยวโปรไฟล์", "เกสต์หนึ่ง", "เกสต์สอง"].every((n) => ep.includes(n)), "ชื่อครบ 4 ดวง (profile+guest)");
  const gb = row.guest_births;
  ok(Array.isArray(gb) && gb.length === 2 && gb[1].name === "เกสต์สอง" && gb[1].lat === 7.8804, "jobs.guest_births เก็บครบ (รวมพิกัดที่ส่งเอง)");
}

/* ═══ [7] route · reject + no-time ═══ */
console.log("[7] reject เกิน 4 / วันเกิดมั่ว / guest ไม่ทราบเวลา");
{
  let res = await fusion5Route.POST(jreq("POST", {
    profileIds: [profileMai, profileAeaw],
    sciences: ["western"],
    question: "x",
    guestBirths: [1, 2, 3].map((i) => ({ name: `g${i}`, birthDate: "1990-01-01", birthTime: "10:00", gender: "M" })),
  }));
  let j = await res.json();
  ok(res.status === 400 && j.error === "too_many_births", "2 profiles + 3 guests = 5 → 400 too_many_births", `${res.status} ${j.error}`);

  res = await fusion5Route.POST(jreq("POST", {
    sciences: ["western"], question: "x",
    guestBirths: [{ birthDate: "1990-13-40", gender: "M" }],
  }));
  j = await res.json();
  ok(res.status === 400 && j.error === "invalid_guest_birth_date" && j.guestIndex === 0, "วันเกิดมั่ว → 400 + guestIndex");

  res = await fusion5Route.POST(jreq("POST", {
    sciences: ["western"], question: "x",
    guestBirths: [{ birthDate: "1899-01-01", gender: "F" }],
  }));
  j = await res.json();
  ok(res.status === 400 && j.error === "guest_birth_date_out_of_range", "ก่อน 1900 → 400");

  /* guest ไม่ทราบเวลา: ziwei (needsBirthTime) ต้องถูก skip · western วิ่งแบบ no-time */
  sifuCalls.length = 0;
  res = await fusion5Route.POST(jreq("POST", {
    sciences: ["western", "ziwei"],
    question: "ดวงชั่วคราวไม่รู้เวลา อ่านได้แค่ไหน",
    guestBirths: [{ name: "โนไทม์เทส", birthDate: "1993-06-06", gender: "F" }],
  }));
  j = await res.json();
  ok(res.status === 200 && j.jobId, "POST no-time 200");
  ok((j.skipped || []).includes("ziwei") && j.skippedReasons?.ziwei === "no_birth_time", "ziwei skipped = no_birth_time");
  ok(j.yam?.charged === 10, "yam = 10 (western อย่างเดียว · ไม่มี judge)", String(j.yam?.charged));
  const row = await pollJob(j.jobId);
  ok(row.status === "done", "no-time job done", row.status + " " + (row.error || ""));
  const wCall = sifuCalls.find((c) => typeof c.payload.externalPrompt === "string" && c.payload.externalPrompt.includes("โนไทม์เทส"));
  ok(!!wCall && wCall.payload.externalPrompt.includes("ไม่ทราบเวลาเกิด"), "western prompt มี no-time note");
  const gres = await fusion5Route.GET(greq(`jobId=${j.jobId}`));
  const gj = await gres.json();
  ok(gj.guestBirths?.[0]?.birthTime === null, "GET คืน birthTime null (UI รู้ว่าไม่ทราบเวลา)");
}

/* ═══ [8] ไม่มี row ใหม่ใน profiles ═══ */
console.log("[8] ตาราง profiles ต้องไม่โต");
{
  const after = Number((await q1(`SELECT count(*)::text AS n FROM profiles`)).n);
  ok(after === profilesBefore, `profiles count คงเดิม (${profilesBefore} → ${after}) — guest ไม่ถูกเขียนเป็นโปรไฟล์`);
}

await cleanup();
mock.close();
await pool.end().catch(() => {});
console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
