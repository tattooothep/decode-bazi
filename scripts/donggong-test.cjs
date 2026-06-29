const tyme = require("tyme4ts"); const { SolarDay } = tyme; const fs = require("fs");
const tests = ["2026-07-01", "2026-02-17", "2026-11-11", "2026-01-15", "2026-09-20"];
const out = [];
for (const d of tests) {
  const [y, m, da] = d.split("-").map(Number);
  const scd = SolarDay.fromYmd(y, m, da).getSixtyCycleDay();
  const monBr = scd.getMonth().getEarthBranch().getName();
  const monIdx = ["寅","卯","辰","巳","午","未","申","酉","戌","亥","子","丑"].indexOf(monBr) + 1;
  const gz = scd.getSixtyCycle().getName();
  const dayBr = scd.getSixtyCycle().getEarthBranch().getName();
  out.push(`\\echo '== ${d} | จันทรคติเดือน${monIdx} วัน${gz} =='`);
  out.push(`SELECT d.jianchu AS 建除, d.base_verdict AS ผลตำแหน่ง, d.shensha::text AS 神煞, e.verdict AS exc, e.note AS exc_note FROM ref_donggong_day d LEFT JOIN ref_donggong_exception e ON e.month=d.month AND e.day_ganzhi='${gz}' WHERE d.month=${monIdx} AND d.day_branch='${dayBr}';`);
}
fs.writeFileSync("/tmp/dgtest.sql", out.join("\n") + "\n");
console.log("wrote /tmp/dgtest.sql");
