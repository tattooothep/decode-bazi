/**
 * test-verdict-hierarchy.mjs — golden test ถาวรของ r417 (ยกเครื่องชั้นตัดสิน "ห้าม vs เลี่ยง")
 * =====================================================================
 * เจ้านายเคาะ 5-6 ก.ค. 2569: ทงซู 通書 (破日/黑道) + ตงกง 董公 (大凶/忌ตรงกิจกรรม) +
 * ฉีเหมิน avoidDoors ราย活動 = "ห้าม" (veto → ตัดออกจาก candidates จริง ไปอยู่ cutSlots)
 * ดวงบุคคล (ba_zi/yong_shen) = "เลี่ยง" เท่านั้น (cap/warning ไม่ veto)
 *
 * รัน:  node scripts/test-verdict-hierarchy.mjs --baseline <verdict-baseline.json>
 * env:  TEST_BASE (default http://127.0.0.1:3990)
 *
 * ต้องมี baseline (จับ "ก่อนแก้" ด้วย capture-verdict-baseline.mjs) เพื่อ assert (ค)/(ง):
 *  (ก) ไม่มี slot แนะนำ (candidates) ที่มี dong_gong ji-match / 大凶 / 破日 / ยามดำ(กิจกรรมมงคล)
 *  (ข) slot ที่ถูกตัดไปอยู่ cutSlots พร้อม vetoes[].reasonTh/reasonEn/reasonZh ไม่ว่าง
 *  (ค) slot ที่ไม่โดน veto และไม่เข้าเงื่อนไข dong_gong off-topic (2c) → finalScore เท่าเดิมเป๊ะ
 *  (ง) slot ที่เข้าเงื่อนไข off-topic (2c) → คะแนนลดหรือเท่าเดิมเท่านั้น ห้ามเพิ่ม
 */
import { readFileSync } from "node:fs";

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3990";
const baselineArg = process.argv.indexOf("--baseline");
const BASELINE_FILE = baselineArg > -1 ? process.argv[baselineArg + 1] : null;

if (!BASELINE_FILE) {
  console.error("ต้องระบุ --baseline <verdict-baseline.json> (จับด้วย capture-verdict-baseline.mjs ก่อนแก้)");
  process.exit(2);
}

const DATE_FROM = "2026-07-05";
const DATE_TO = "2026-09-03"; // 60 วัน
const ACTIVITIES = ["立約", "婚姻", "動土", "開市", "求醫"];
const AUSPICIOUS_ACTIVITIES = new Set(["立約", "動土", "搬家", "開市", "婚姻", "求財", "祭祀"]);
const HEIDAO_SPIRITS = new Set(["天刑", "朱雀", "白虎", "天牢", "玄武", "勾陳"]);
const MODULES = [
  "ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars",
  "tai_sui", "qi_men", "he_luo", "hex64", "tian_xing", "dong_gong",
];

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function post(body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}/api/auspicious`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let data = null;
    try { data = await r.json(); } catch { /* non-JSON */ }
    if (r.status === 429 && attempt < 5) {
      const waitSec = Number(r.headers.get("retry-after") || data?.retryAfter || 5) + 1;
      console.log(`  ⏳ rate limit · รอ ${waitSec}s แล้วลองใหม่`);
      await new Promise((res) => setTimeout(res, waitSec * 1000));
      continue;
    }
    return { status: r.status, data };
  }
}

/** เกณฑ์ "ควรโดน veto" อ้างอิงข้อมูลจริงจาก modules (ไม่พึ่งพา engine's own vetoes field — cross-check อิสระ) */
function expectedVetoCodes(activity, modules) {
  const codes = [];
  if (AUSPICIOUS_ACTIVITIES.has(activity)) {
    const officer = modules?.twelve_officers;
    if (officer?.status === "ready" && officer.raw?.officer === "破") codes.push("TONGSHU_PO");
    const spirit = modules?.twelve_spirits;
    if (spirit?.status === "ready" && HEIDAO_SPIRITS.has(spirit.raw?.spirit)) codes.push("TONGSHU_HEIDAO");
  }
  const dg = modules?.dong_gong;
  if (dg?.status === "ready") {
    if (dg.raw?.verdict === "大凶") codes.push("DONGGONG_DAXIONG");
    if ((dg.raw?.ji_matches || []).length > 0) codes.push("DONGGONG_JI");
  }
  return codes;
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));

console.log(`=== test-verdict-hierarchy · BASE=${BASE} · ${DATE_FROM}..${DATE_TO} ===`);

for (const act of ACTIVITIES) {
  console.log(`\n--- ${act} ---`);
  const body = {
    activityType: act, dateFrom: DATE_FROM, dateTo: DATE_TO,
    activeModules: MODULES, options: { limit: 2000, scanLimit: 3000 },
  };
  const { status, data } = await post(body);
  ok(status === 200, `${act}: HTTP 200`, `ได้ ${status} ${data?.error || ""}`);
  if (status !== 200) continue;

  const candidates = data.candidates || [];
  const cutSlots = data.cutSlots || [];
  const baseAct = baseline[act];
  ok(!!baseAct && !baseAct.error, `${act}: baseline มีข้อมูล`);
  const baseById = new Map((baseAct?.candidates || []).map((c) => [String(c.id), c]));

  // (ก) candidates (แนะนำจริง) ต้องไม่มี slot ที่เข้าเกณฑ์ veto ใด ๆ
  let dirtyRecommended = 0;
  for (const c of candidates) {
    const codes = expectedVetoCodes(act, c.modules);
    if (codes.length) { dirtyRecommended++; if (dirtyRecommended <= 3) console.log(`     ⚠ leaked: id=${c.id} ${c.calendar?.gregorianDate} codes=${codes.join(",")}`); }
  }
  ok(dirtyRecommended === 0, `${act}: candidates ไม่มี slot ที่ควรโดน veto (${dirtyRecommended} หลุด)`);

  // (ข) ทุก slot ที่เข้าเกณฑ์ veto (จาก candidates ทั้งหมดใน baseline ก่อนแก้ = universe เดียวกัน)
  //     ต้องปรากฏใน cutSlots พร้อม vetoes[] ครบ 3 ภาษา
  const cutById = new Map(cutSlots.map((c) => [String(c.id), c]));
  let expectedCutCount = 0, missingFromCut = 0, badReasonShape = 0;
  for (const bc of baseAct?.candidates || []) {
    const codes = expectedVetoCodes(act, bc.modules);
    if (!codes.length) continue;
    expectedCutCount++;
    const cut = cutById.get(String(bc.id));
    if (!cut) { missingFromCut++; continue; }
    const vetoes = cut.vetoes || [];
    for (const code of codes) {
      const v = vetoes.find((x) => x.code === code);
      if (!v || !v.reasonTh || !v.reasonEn || !v.reasonZh) badReasonShape++;
    }
  }
  ok(missingFromCut === 0, `${act}: ทุก slot ที่ควรโดน veto (${expectedCutCount} รายการ) อยู่ใน cutSlots ครบ`, `ขาด ${missingFromCut}`);
  ok(badReasonShape === 0, `${act}: cutSlots.vetoes มี reasonTh/reasonEn/reasonZh ครบทุกรายการ`, `${badReasonShape} รายการไม่ครบ`);

  // (ค)/(ง) เทียบคะแนนกับ baseline สำหรับ slot ที่ไม่โดน veto
  const afterById = new Map([...candidates, ...cutSlots].map((c) => [String(c.id), c]));
  let sameScore = 0, changedUnexpected = 0, offTopicChecked = 0, offTopicIncreased = 0, notFound = 0;
  for (const bc of baseAct?.candidates || []) {
    const codes = expectedVetoCodes(act, bc.modules);
    if (codes.length) continue; // ตัวที่ veto ไม่เข้าเงื่อนไข (ค)/(ง) — ตรวจแยกข้างบนแล้ว
    const after = afterById.get(String(bc.id));
    if (!after) { notFound++; continue; }
    const baseScore = bc.scoring?.finalScore;
    const afterScore = after.scoring?.finalScore;
    const offTopic = !!bc.modules?.dong_gong?.raw?.off_topic_verdict === true
      || !!after.modules?.dong_gong?.raw?.off_topic_verdict === true;
    if (offTopic) {
      offTopicChecked++;
      if (afterScore > baseScore) offTopicIncreased++;
    } else {
      if (afterScore === baseScore) sameScore++; else changedUnexpected++;
    }
  }
  ok(notFound === 0, `${act}: ทุก slot (ไม่ veto) หาเจอใน after (candidates+cutSlots)`, `หาไม่เจอ ${notFound}`);
  ok(changedUnexpected === 0, `${act}: slot ที่ไม่เข้าเงื่อนไข off-topic (2c) คะแนนเท่าเดิมเป๊ะ (${sameScore} slot ตรวจแล้ว)`, `เปลี่ยน ${changedUnexpected} slot`);
  ok(offTopicIncreased === 0, `${act}: slot off-topic (2c) คะแนนไม่เพิ่ม (${offTopicChecked} slot ตรวจแล้ว)`, `เพิ่ม ${offTopicIncreased} slot`);

  console.log(`     ↳ candidates=${candidates.length} cutSlots=${cutSlots.length} allCut=${data.allCut} vetoCut=${data.funnelStats?.vetoCut}`);
}

console.log(`\n=== สรุป: ${pass} ผ่าน · ${fail} ไม่ผ่าน ===`);
process.exit(fail ? 1 : 0);
