#!/usr/bin/env node
/* สร้าง SQL โหลด 董公 dataset → ref_donggong_* (additive · tier-1 NLC) · pipe เข้า psql */
const fs = require("fs");
const D = "data/donggong/";
const zhi = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const ORDER = ["建","除","滿","平","定","執","破","危","成","收","開","閉"];
const jc = (monthBranch, dayBranch) => ORDER[(zhi.indexOf(dayBranch) - zhi.indexOf(monthBranch) + 12) % 12];
const q = (s) => s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const out = [];
out.push(`BEGIN;`);
out.push(`DROP TABLE IF EXISTS ref_donggong_day, ref_donggong_exception, ref_donggong_meta CASCADE;`);
out.push(`CREATE TABLE ref_donggong_day(
  month int, month_branch text, jianchu text, day_branch text,
  base_verdict text, yi jsonb, ji jsonb, shensha jsonb, note text, missing bool DEFAULT false,
  PRIMARY KEY(month, day_branch));`);
out.push(`CREATE TABLE ref_donggong_exception(
  month int, jianchu text, day_branch text, day_ganzhi text, verdict text, note text);`);
out.push(`CREATE INDEX ix_dg_exc ON ref_donggong_exception(day_ganzhi, month);`);
out.push(`CREATE TABLE ref_donggong_meta(key text PRIMARY KEY, descr text, data jsonb);`);

const months = JSON.parse(fs.readFileSync(D + "months.json")).months;
let dayN = 0, excN = 0;
for (const mo of months) {
  for (const p of mo.positions) {
    dayN++;
    out.push(`INSERT INTO ref_donggong_day VALUES(${mo.month},${q(mo.month_branch)},${q(p.pos)},${q(p.branch)},${q(p.verdict)},${j(p.yi||[])},${j(p.ji||[])},${j(p.shensha||[])},${q(p.note||null)},${p._missing?true:false});`);
    for (const e of (p.exceptions || [])) {
      excN++;
      out.push(`INSERT INTO ref_donggong_exception VALUES(${mo.month},${q(p.pos)},${q(p.branch)},${q(e.gz)},${q(e.v||null)},${q(e.note||null)});`);
    }
  }
}

// meta = ภาคผนวกเก็บเป็น jsonb ทั้งก้อน
const meta = [
  ["jianchu_logic", "建除十二神 logic (協紀辨方 tier-1)", "jianchu_logic.json"],
  ["shensha_monthly", "神煞รายเดือน (黃沙/小紅沙/天賊/受死/往亡/六黑道)", "shensha_monthly.json"],
  ["blacklist_fixed", "วันร้ายตายตัว (正四廢/白虎入中宮/九土鬼/金神七煞)", "blacklist_fixed.json"],
  ["sanxing", "三星 煞貢/直星/人專", "sanxing.json"],
  ["directions", "ทิศ 喜神/財神/五鬼/三煞/九宮飛宮", "directions.json"],
  ["gejue", "歌訣 金神七煞歌+黃黑道口訣", "gejue.json"],
];
for (const [k, d, f] of meta) {
  const data = JSON.parse(fs.readFileSync(D + f));
  out.push(`INSERT INTO ref_donggong_meta VALUES(${q(k)},${q(d)},${j(data)});`);
}
out.push(`COMMIT;`);
out.push(`SELECT 'days='||count(*) FROM ref_donggong_day;`);
out.push(`SELECT 'exceptions='||count(*) FROM ref_donggong_exception;`);
out.push(`SELECT 'meta='||count(*) FROM ref_donggong_meta;`);
process.stderr.write(`generated: ${dayN} days, ${excN} exceptions, ${meta.length} meta\n`);
process.stdout.write(out.join("\n") + "\n");
