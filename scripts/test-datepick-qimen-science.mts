import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlPath = path.join(root, "public/datepick.html");
const html = fs.readFileSync(htmlPath, "utf8");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function functionBlock(name: string): string {
  const start = html.indexOf(`function ${name}`);
  assert(start >= 0, `missing function ${name}`);
  let depth = 0;
  let seenOpen = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") {
      depth++;
      seenOpen = true;
    } else if (ch === "}") {
      depth--;
      if (seenOpen && depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const scienceKey = functionBlock("scienceKeyFromReason");
const qimenSignal = functionBlock("hasQimenScienceSignal");
const enrich = functionBlock("enrichScienceSectionsForSlot");
const resultMapper = html.slice(html.indexOf("const qm = c.modules?.qi_men?.raw || {}"), html.indexOf("tongshu: { day_officer", html.indexOf("const qm = c.modules?.qi_men?.raw || {}")));

assert(scienceKey.includes("ฉีเหมิน"), "science reason router must recognize Thai Qimen reasons");
assert(scienceKey.includes("Qi Men"), "science reason router must recognize English Qi Men reasons");
assert(scienceKey.includes("qi_men"), "science reason router must recognize module key reasons");
assert(scienceKey.includes("PROFILE_QIMEN"), "science reason router must recognize profile Qimen cap codes");
assert(scienceKey.includes("QM_BAD_DOOR_CAP"), "science reason router must recognize generic Qimen cap codes");

assert(qimenSignal.includes("t?.door, t?.star, t?.deity"), "Qimen science signal must read palace layers");
assert(qimenSignal.includes("scienceKeyFromReason(x) === 'qi_men'"), "Qimen science signal must read Qimen reasons");
assert(qimenSignal.includes("s !== '·'"), "Qimen science signal must ignore placeholder layer values");

assert(enrich.includes("if (hasQimenScienceSignal(t))"), "Qimen science section must not depend on moduleScores.qi_men");
assert(!enrich.includes("if (moduleScores.qi_men != null)"), "old moduleScores.qi_men gate must not return");
assert(enrich.includes("ensureScienceSection(sections, 'qi_men', moduleScores)"), "Qimen science section must still use canonical section helper");

assert(resultMapper.includes("const qm = c.modules?.qi_men?.raw || {}"), "datepick result mapper must keep Qimen raw packet");
assert(resultMapper.includes("door: qm.door || '·'"), "datepick result mapper must expose Qimen door layer");
assert(resultMapper.includes("star: qm.star || '·'"), "datepick result mapper must expose Qimen star layer");
assert(resultMapper.includes("deity: qm.deity || '·'"), "datepick result mapper must expose Qimen deity layer");

console.log("PASS datepick qimen science grouping smoke");
