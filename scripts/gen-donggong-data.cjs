#!/usr/bin/env node
/* gen src/lib/donggong-data.ts จาก data/donggong/months.json (self-contained · ไม่พึ่ง DB ตอน runtime) */
const fs = require("fs");
const months = JSON.parse(fs.readFileSync("data/donggong/months.json")).months;
const day = {};   // "month|branch" -> {pos,verdict,shensha,yi,ji,note,missing}
const exc = {};    // "month|ganzhi" -> {verdict,note}
for (const mo of months) {
  for (const p of mo.positions) {
    day[`${mo.month}|${p.branch}`] = {
      pos: p.pos, verdict: p.verdict, shensha: p.shensha || [], yi: p.yi || [], ji: p.ji || [],
      note: p.note || "", missing: !!p._missing,
    };
    for (const e of (p.exceptions || [])) exc[`${mo.month}|${e.gz}`] = { verdict: e.v || "", note: e.note || "" };
  }
}
const head = `// AUTO-GEN จาก data/donggong/months.json (董公選要覽 NLC tier-1) · gen: scripts/gen-donggong-data.cjs · อย่าแก้มือ
export type DGDay = { pos: string; verdict: string; shensha: string[]; yi: string[]; ji: string[]; note: string; missing: boolean };
export type DGExc = { verdict: string; note: string };
`;
fs.writeFileSync("src/lib/donggong-data.ts",
  head +
  `export const DG_DAY: Record<string, DGDay> = ${JSON.stringify(day, null, 0)};\n` +
  `export const DG_EXC: Record<string, DGExc> = ${JSON.stringify(exc, null, 0)};\n`);
console.log(`gen donggong-data.ts: ${Object.keys(day).length} days, ${Object.keys(exc).length} exceptions`);
