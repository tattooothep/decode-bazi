// ตัวประกอบคำตีความรายยาม: กฎ "ไม่มีอะไรเปลี่ยน = ไม่เด้ง" + ใช้ผลเดียวร่วมกันระหว่าง suppress() กับ interpret() (19 ก.ย. 2569)
// ฐานข้อมูล/AI จำลองทั้งหมด — ไม่แตะของจริง
import assert from "node:assert/strict";
import { createAstronomyInterpretDep } from "../src/lib/mobile-astronomy-interpret-runtime";

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks += 1; }

const entry = (t: string) => ({ title: t, body: `${t} body`, meaning: "m", doList: ["ทำ"], avoidList: ["เลี่ยง"] });
const locales = (t: string) => ({ th: entry(t), en: entry(`${t} en`), zh: entry(`${t} zh`) });
type Row = { locales: Record<string, unknown> };

function world(options: { prior?: Record<string, unknown> | null; existing?: Record<string, unknown> | null; hits: { transit: string; natal: string; aspect: string; pace: string }[] }) {
  const inserted: Record<string, unknown>[] = [];
  let generated = 0;
  const pool = { query: async (sql: string, params: unknown[]) => {
    if (/^\s*INSERT INTO mobile_astronomy_interpretations_r8/iu.test(sql)) { inserted.push(JSON.parse(String(params[2]))); return { rows: [] }; }
    if (/SELECT locales FROM mobile_astronomy_interpretations_r8 WHERE occurrence_id/iu.test(sql)) return { rows: options.existing ? [{ locales: options.existing } as Row] : [] };
    if (/interval '2 hours'/iu.test(sql)) return { rows: options.prior ? [{ locales: options.prior } as Row] : [] };
    if (/interval '6 hours'/iu.test(sql)) return { rows: [] };
    if (/FROM mobile_science_notification_occurrences WHERE id/iu.test(sql)) return { rows: [{ snapshot: { facts: { localBoundary: "2026-09-19T12:00:00+07:00", physicalBodies: [] } } }] };
    if (/FROM users u WHERE u\.id/iu.test(sql)) return { rows: [{ id: "u", email: "e", current_org_id: "o", session_version: 1, profile_id: "p", profile_name: "n" }] };
    if (/FROM mobile_daily_ai_summaries/iu.test(sql)) return { rows: [] };
    throw new Error(`unexpected sql: ${sql.slice(0, 60)}`);
  } };
  const dep = createAstronomyInterpretDep({
    pool: pool as never, base: "http://x", signSession: () => "t",
    fetchImpl: (async () => ({ ok: true, json: async () => ({ ok: true, reading: { stars: [{ key: "Mars", lonTrop: 334.57 }], yongshen: { key: "Mars", statusTh: "ปานกลาง" } } }) })) as never,
    generate: async () => { generated += 1; return { locales: locales("ใหม่") as never, model: "mock", factsDigest: "a".repeat(64) }; },
    hits: () => options.hits,
  });
  return { dep, inserted, generatedCount: () => generated };
}
const admission = { locale: "th", userId: "u" } as never;
const slow = [{ transit: "Venus", natal: "Mars", aspect: "120°/trine", pace: "slow_background" }, { transit: "Saturn", natal: "Yuebo", aspect: "ทับ/conjunct", pace: "slow_background" }];
const sig = "Saturn>Yuebo:ทับ/conjunct|Venus>Mars:120°/trine";

// 1) ไม่มีมุมจันทร์ + ฉากหลังชุดเดิมกับยามก่อน → ข้ามการส่ง · ไม่เรียก AI · เก็บคำอ่านยามก่อนไว้ให้เปิดดูในแอพ
{
  const w = world({ prior: { ...locales("ยามก่อน"), _sig: sig }, hits: slow });
  check(await w.dep.suppress("occ", admission) === true, "no moon hit + same background as the previous period → suppressed");
  check(w.generatedCount() === 0, "a suppressed period never calls the AI");
  check(w.inserted.length === 1 && w.inserted[0]._unchanged === true && w.inserted[0]._sig === sig && (w.inserted[0].th as { title: string }).title === "ยามก่อน", "the previous reading is carried so the app still has something to show");
  check((await w.dep("occ", admission))?.title === "ยามก่อน" && w.generatedCount() === 0, "interpret() reuses the same resolution");
}
// 2) มีมุมจันทร์ → ส่งตามปกติ แม้ฉากหลังเหมือนเดิม
{
  const w = world({ prior: { ...locales("ยามก่อน"), _sig: sig }, hits: [{ transit: "Moon", natal: "Sun", aspect: "ทับ/conjunct", pace: "fast_this_period" }, ...slow] });
  check(await w.dep.suppress("occ", admission) === false && w.generatedCount() === 1, "a moon hit always produces a fresh reading");
  check(w.inserted[0]._sig === sig && w.inserted[0]._unchanged === undefined, "fresh readings store the background signature for the next period");
  check((await w.dep("occ", admission))?.title === "ใหม่" && w.generatedCount() === 1, "suppress() and interpret() share one AI call");
}
// 3) ฉากหลังเปลี่ยน → ส่ง
{
  const w = world({ prior: { ...locales("ยามก่อน"), _sig: "Sun>Saturn:60°/sextile" }, hits: slow });
  check(await w.dep.suppress("occ", admission) === false && w.generatedCount() === 1, "a changed background is sent");
}
// 4) ไม่ข้ามสองยามติดกัน (กันเงียบยาวจนดูเหมือนระบบพัง)
{
  const w = world({ prior: { ...locales("ยามก่อน"), _sig: sig, _unchanged: true }, hits: slow });
  check(await w.dep.suppress("occ", admission) === false && w.generatedCount() === 1, "never suppress two periods in a row");
}
// 5) ยามแรกของวัน (ยามก่อนไม่มีคำอ่าน) → ส่งเสมอ
{
  const w = world({ prior: null, hits: slow });
  check(await w.dep.suppress("occ", admission) === false && w.generatedCount() === 1, "the first period after quiet hours is always sent");
}
// 6) แถวที่ถูกข้ามไว้แล้ว → รอบกวาดถัดไปยังตอบว่าข้าม โดยไม่คิดใหม่
{
  const w = world({ existing: { ...locales("ยามก่อน"), _sig: sig, _unchanged: true }, hits: slow });
  check(await w.dep.suppress("occ", admission) === true && w.generatedCount() === 0 && w.inserted.length === 0, "a stored suppressed period stays suppressed on later sweeps");
}
console.log(`PASS astronomy-interpret-runtime: ${checks} checks (fake pool + fake AI).`);
