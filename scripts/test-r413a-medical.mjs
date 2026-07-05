/**
 * test-r413a-medical.mjs — ทดสอบ fix "ผ่าตัด/พบแพทย์ ถูก map เป็น 祭祀 (ไหว้เจ้า)"
 * =====================================================================
 * r413a: เพิ่ม ActivityType "求醫" · medical_visit/surgery ใช้ 求醫 แทน 祭祀
 *
 * รัน:  node scripts/test-r413a-medical.mjs [--baseline <before.json>]
 * env:  TEST_BASE (default http://127.0.0.1:3990 — dev server จาก source · ห้ามชี้ production)
 *
 * มิติที่ทดสอบ:
 *  A. medical_visit + surgery + activityType 求醫 ตรง ๆ × 3 ช่วงเวลา (ก.ค.2569/ต.ค.2569/ม.ค.2570)
 *     - meta.activityType ต้องเป็น 求醫 (ไม่ใช่ 祭祀)
 *     - dong_gong: yi_matches/ji_matches ต้องว่าง (ตำราไม่มีคำแพทย์ · ตรวจ DB 5 ก.ค. 2569)
 *       + reason ห้ามพูด 還福願/ไหว้เจ้า
 *     - moon_sign: fit ห้ามเป็น "good" (ตาราง 求醫 conservative · good=[])
 *     - คะแนน 0-100 + เรียงมาก→น้อย (สมเหตุผล)
 *  B. backward compat: 祭祀 ตรง ๆ ยังใช้ได้ · activityType มั่ว (手術) ต้อง 400
 *  C. regression: 8 กิจกรรมเดิม × 3 ช่วง เทียบ byte กับ baseline (ถ้าส่ง --baseline)
 */
import { readFileSync } from "node:fs";

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3990";
const baselineArg = process.argv.indexOf("--baseline");
const BASELINE_FILE = baselineArg > -1 ? process.argv[baselineArg + 1] : null;

const WINDOWS = [
  ["2026-07-10", "2026-07-17"],
  ["2026-10-05", "2026-10-12"],
  ["2027-01-10", "2027-01-17"],
];
const MODULES = ["ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars", "tai_sui", "qi_men", "he_luo", "hex64", "tian_xing", "dong_gong", "moon_void", "moon_sign", "retro_window", "eclipse_zone", "rahu_kalam", "panchanga"];

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function post(body) {
  // API มี rate limit 60 req/min/IP · เทสยิง ~38 req/รอบ → เจอ 429 ให้รอตาม Retry-After แล้วยิงซ้ำ (สูงสุด 3 ครั้ง)
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}/api/auspicious`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let data = null;
    try { data = await r.json(); } catch { /* non-JSON */ }
    if (r.status === 429 && attempt < 3) {
      const waitSec = Number(r.headers.get("retry-after") || data?.retryAfter || 5) + 1;
      console.log(`  ⏳ rate limit · รอ ${waitSec}s แล้วลองใหม่`);
      await new Promise((res) => setTimeout(res, waitSec * 1000));
      continue;
    }
    return { status: r.status, data };
  }
}

function medicalChecks(name, data) {
  ok(data?.meta?.activityType === "求醫", `${name}: meta.activityType = 求醫`, `ได้ ${data?.meta?.activityType}`);
  const cands = data?.candidates || [];
  ok(cands.length > 0, `${name}: มีฤกษ์ให้ (${cands.length} ช่อง)`);
  let scoresSane = true, sorted = true, dgClean = true, msClean = true, textClean = true, prev = Infinity;
  for (const c of cands) {
    const s = c.scoring?.finalScore;
    if (typeof s !== "number" || s < 0 || s > 100) scoresSane = false;
    if (s > prev + 1e-9) sorted = false;
    prev = s;
    const dg = c.modules?.dong_gong;
    if (dg && dg.status === "ready") {
      if ((dg.raw?.yi_matches || []).length || (dg.raw?.ji_matches || []).length) dgClean = false;
    }
    const ms = c.modules?.moon_sign;
    if (ms && ms.status === "ready" && ms.raw?.fit === "good") msClean = false;
    const texts = [
      ...(c.scoring?.reasonsUp || []), ...(c.scoring?.reasonsDown || []), ...(c.scoring?.warnings || []),
    ].filter((r) => r.source === "dong_gong").map((r) => r.thai || "");
    if (texts.some((t) => /還福願|ไหว้เจ้า|แก้บน/.test(t))) textClean = false;
  }
  ok(scoresSane, `${name}: คะแนนทุกช่อง 0-100`);
  ok(sorted, `${name}: เรียงคะแนนมาก→น้อย`);
  ok(dgClean, `${name}: ตงกง yi/ji ไม่ match กิจกรรมแพทย์ (aliases ว่างตามตำราจริง)`);
  ok(msClean, `${name}: จันทร์ราศีไม่แจกโบนัส good (ตาราง 求醫 conservative)`);
  ok(textClean, `${name}: เหตุผลตงกงไม่พูด 還福願/ไหว้เจ้า/แก้บน`);
  if (cands.length) {
    const top = cands[0];
    console.log(`     ↳ top: ${top.datetime?.start} score=${Math.round(top.scoring?.finalScore)} tier=${top.scoring?.tier}`);
  }
}

console.log(`\n=== A. ฤกษ์การแพทย์ (medical_visit / surgery / 求醫 ตรง) × 3 ช่วงเวลา · BASE=${BASE} ===`);
for (const [df, dt] of WINDOWS) {
  for (const [name, body] of [
    [`medical_visit ${df}`, { activityType: "求醫", activityProfileKey: "medical_visit", dateFrom: df, dateTo: dt, activeModules: MODULES, options: { limit: 8 } }],
    [`surgery ${df}`, { activityType: "求醫", activityProfileKey: "surgery", dateFrom: df, dateTo: dt, activeModules: MODULES, options: { limit: 8 } }],
    [`求醫-ตรง ${df}`, { activityType: "求醫", dateFrom: df, dateTo: dt, activeModules: MODULES, options: { limit: 8 } }],
    /* เคสเก่า (client เก่า/cache เก่า) ส่ง 祭祀 + profileKey — profile ต้องชนะ → 求醫 */
    [`surgery-legacy-body ${df}`, { activityType: "祭祀", activityProfileKey: "surgery", dateFrom: df, dateTo: dt, activeModules: MODULES, options: { limit: 8 } }],
  ]) {
    const { status, data } = await post(body);
    ok(status === 200, `${name}: HTTP 200`, `ได้ ${status} ${data?.error || ""}`);
    if (status === 200) medicalChecks(name, data);
  }
}

console.log(`\n=== B. backward compat + validation ===`);
{
  const { status, data } = await post({ activityType: "祭祀", dateFrom: "2026-07-10", dateTo: "2026-07-13", activeModules: ["ze_ri", "dong_gong"], options: { limit: 3 } });
  ok(status === 200 && data?.meta?.activityType === "祭祀", "祭祀 ตรง ๆ (ไหว้เจ้าจริง) ยังใช้ได้เหมือนเดิม", `HTTP ${status}`);
  const bad = await post({ activityType: "手術", dateFrom: "2026-07-10", dateTo: "2026-07-13", activeModules: ["ze_ri"] });
  ok(bad.status === 400, "activityType นอก whitelist (手術) → 400", `ได้ ${bad.status}`);
}

if (BASELINE_FILE) {
  console.log(`\n=== C. regression 8 กิจกรรมเดิม × 3 ช่วง เทียบ byte กับ baseline ===`);
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const ACTIVITIES = ["立約", "出行", "動土", "搬家", "開市", "婚姻", "求財", "祭祀"];
  for (const act of ACTIVITIES) {
    for (const [df, dt] of WINDOWS) {
      const key = `${act}|${df}`;
      const { status, data } = await post({ activityType: act, dateFrom: df, dateTo: dt, activeModules: MODULES, options: { limit: 10 } });
      if (data && data.meta) delete data.meta; // ตัด field ผันแปร (durationMs/cache)
      const same = status === 200 && JSON.stringify(data) === JSON.stringify(baseline[key]);
      ok(same, `${act} ${df}: ผลเท่า baseline ทุก byte`);
    }
  }
}

console.log(`\n=== สรุป: ${pass} ผ่าน · ${fail} ไม่ผ่าน ===`);
process.exit(fail ? 1 : 0);
