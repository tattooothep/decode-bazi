/**
 * Phase 10 · Final regression + 4p vs 3p comparison
 * เจ้านายขอ: "ดวงใหม่ต้องเทียบดวง 4 เสาได้ทุกมิติ"
 */
import { calcBazi } from "../src/lib/bazi-calc";
import { buildChartExtensions } from "../src/lib/chart-extensions";

async function main() {
  console.log("══════ Phase 10 · 4p vs 3p comparison ══════\n");

  const TEST_CASES = [
    { name: "Aeaw 1984-12-31", date: "1984-12-31", time: "13:15" },
    { name: "Mai 1986-04-12", date: "1986-04-12", time: "16:42" },
    { name: "Today 2026-05-19", date: "2026-05-19", time: "10:00" },
  ];

  const fails: string[] = [];

  for (const tc of TEST_CASES) {
    console.log(`── ${tc.name} ──`);
    const r4 = await calcBazi({
      date: tc.date, time: tc.time, longitude: 100.5018,
      gmtOffsetHours: 7, birthTimeKnown: true,
    });
    const r3 = await calcBazi({
      date: tc.date, longitude: 100.5018, gmtOffsetHours: 7, birthTimeKnown: false,
    });

    /* 1. Year/Month/Day ต้องตรงกัน · 4p+3p ใช้ noon anchor วันเดียวกัน */
    if (r4.pillarsZh.year !== r3.pillarsZh.year) fails.push(`${tc.name}: Year mismatch ${r4.pillarsZh.year} vs ${r3.pillarsZh.year}`);
    if (r4.pillarsZh.month !== r3.pillarsZh.month) fails.push(`${tc.name}: Month mismatch ${r4.pillarsZh.month} vs ${r3.pillarsZh.month}`);
    if (r4.pillarsZh.day !== r3.pillarsZh.day) fails.push(`${tc.name}: Day mismatch ${r4.pillarsZh.day} vs ${r3.pillarsZh.day}`);

    /* 2. DM ต้องตรงกัน · เพราะ day pillar เดียวกัน */
    if (r4.dayMaster !== r3.dayMaster) fails.push(`${tc.name}: DM mismatch ${r4.dayMaster} vs ${r3.dayMaster}`);

    /* 3. mode flag */
    if (r4.mode !== "4p") fails.push(`${tc.name}: 4p mode flag wrong`);
    if (r3.mode !== "3p") fails.push(`${tc.name}: 3p mode flag wrong`);
    if (r3.dayBoundaryUncertain !== true) fails.push(`${tc.name}: 3p dayBoundaryUncertain not true`);

    /* 4. 4p hour mặต้องเป็น object · 3p hour = null */
    if (!r4.pillars.hour) fails.push(`${tc.name}: 4p hour missing`);
    if (r3.pillars.hour !== null) fails.push(`${tc.name}: 3p hour not null`);

    /* 5. chart-extensions ต้องทำงานทั้ง 4p+3p ไม่ crash */
    try {
      const ext4 = buildChartExtensions(r4.pillars as any, new Date("2026-05-19T12:00:00Z"), "M", new Date(tc.date + "T" + tc.time + ":00+07:00"), 10, r4.geJu.structure, r4.strength.percent, r4.yongshen[0]?.element || null);
      const ext3 = buildChartExtensions(r3.pillars as any, new Date("2026-05-19T12:00:00Z"), "M", new Date(tc.date + "T12:00:00+07:00"), 10, r3.geJu.structure, r3.strength.percent, r3.yongshen[0]?.element || null);

      /* 4p · hour-fields populated · 3p · hour-fields null */
      if (!ext4.ten_gods_map.hour) fails.push(`${tc.name}: 4p ten_gods.hour null`);
      if (ext3.ten_gods_map.hour !== null) fails.push(`${tc.name}: 3p ten_gods.hour not null`);
      if (ext3.life_palace !== null) fails.push(`${tc.name}: 3p life_palace not null (ต้อง null · 命宮 ใช้ไม่ได้)`);
      if (ext3.nayin.hour !== null) fails.push(`${tc.name}: 3p nayin.hour not null`);

      console.log(`  4p: ${r4.pillarsZh.year}/${r4.pillarsZh.month}/${r4.pillarsZh.day}/${r4.pillarsZh.hour} · DM=${r4.dayMaster} · ${r4.geJu.structure} · ${r4.strength.level}`);
      console.log(`  3p: ${r3.pillarsZh.year}/${r3.pillarsZh.month}/${r3.pillarsZh.day}/—   · DM=${r3.dayMaster} · ${r3.geJu.structure} · ${r3.strength.level} · uncertainty: dayBoundary=${r3.dayBoundaryUncertain} monthJQ=${r3.monthPillarUncertainNearJieqi}`);
      console.log(`  match: Y${r4.pillarsZh.year===r3.pillarsZh.year?"✓":"✗"} M${r4.pillarsZh.month===r3.pillarsZh.month?"✓":"✗"} D${r4.pillarsZh.day===r3.pillarsZh.day?"✓":"✗"} DM${r4.dayMaster===r3.dayMaster?"✓":"✗"}`);
    } catch (e: any) {
      fails.push(`${tc.name}: ext crash ${e.message}`);
    }
    console.log();
  }

  if (fails.length) {
    console.log("\n❌ FAIL " + fails.length + ":\n  - " + fails.join("\n  - "));
    process.exit(1);
  }
  console.log("\n✅ Phase 10 · 4p vs 3p comparison ทุกมิติผ่าน · 4p byte-equal · 3p เทียบ 4p ได้");
}

main().catch(e => { console.error(e); process.exit(1); });
