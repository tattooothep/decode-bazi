/* HK-XCH resolver v1 tests — 三合解六沖 / 貪合忘冲 / 因解而反得刑衝
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-xch-resolver.mjs
 *
 * ตำราอ้างอิง:
 *  - 子平真詮·論刑沖會合解法 (沈孝瞻)
 *  - 子平真詮評註 (徐樂吾, 1936) 第07章
 *  - 滴天髓·體用 / 合局 (任鐵樵 1848)
 *  - data/library/sifu-extra/bazi-hechong-resolution.md (A2.2–A2.3)
 *
 * 9 cases (3 ต่อกฎ) — 1 positive + 2 edge ต่อกฎ
 */
import { resolveXch, explainXchResolution } from "../src/lib/bazi-xch-resolver.ts";
import { BAZI_INTERACTION_RULES } from "../src/lib/bazi-interaction-rule-registry.ts";

const STEM_PARITY = { 甲:0, 丙:0, 戊:0, 庚:0, 壬:0, 乙:1, 丁:1, 己:1, 辛:1, 癸:1 };
const BRANCH_PARITY = { 子:0, 寅:0, 辰:0, 午:0, 申:0, 戌:0, 丑:1, 卯:1, 巳:1, 未:1, 酉:1, 亥:1 };

function assertPillar(x, label) {
  if (!x) return null;
  const stem = x[0], branch = x[1];
  if (!(stem in STEM_PARITY)) throw new Error(`${label}: unknown stem ${stem}`);
  if (!(branch in BRANCH_PARITY)) throw new Error(`${label}: unknown branch ${branch}`);
  if (STEM_PARITY[stem] !== BRANCH_PARITY[branch]) throw new Error(`${label}: invalid 干支 ${x}`);
  return { stem, branch };
}

const P = (y, m, d, h) => ({
  year: assertPillar(y, "year"),
  month: assertPillar(m, "month"),
  day: assertPillar(d, "day"),
  hour: assertPillar(h, "hour"),
});

const cases = [
  /* ──── ZPZQ-XCH-001 三合解六沖 (3) ──── */
  {
    name: "[XCH-001-A positive · 半三合คลายชง長生] 壬申 丙午 甲寅 丁卯 — 寅申沖ปลาย長生 + 寅午半合火",
    pillars: P("壬申", "丙午", "甲寅", "丁卯"),
    expectRule: "ZPZQ-XCH-001",
    expectVerdict: "weakened_by_combination",
  },
  {
    name: "[XCH-001-B positive · 三合full คลายชงปลาย墓] 庚辰 庚午 丙寅 壬戌 — 辰戌沖 (year/hour) + 寅午戌火局",
    pillars: P("庚辰", "庚午", "丙寅", "壬戌"),
    expectRule: "ZPZQ-XCH-001",
    expectVerdict: "weakened_by_combination",
  },
  {
    name: "[XCH-001-C edge · 沖กลาง帝旺 → 沖開 ไม่ flag] 壬午 壬子 庚辰 甲申 (徐樂吾 子午沖 + 申子辰; center=子 ถูกชน)",
    // ตาม A2.3.4 ของตำรา: 三合 + 沖ก้านกลาง帝旺 → 沖開 (combination opened) → resolver ไม่ตีว่าคลายชง
    pillars: P("壬午", "壬子", "庚辰", "甲申"),
    expectRule: "ZPZQ-XCH-001",
    expectAbsent: true,
  },

  /* ──── ZPZQ-XCH-002 貪合忘冲 (3) ──── */
  {
    name: "[XCH-002-A positive] 乙卯 庚午 戊申 丁酉 — 卯酉沖 (year↔hour) + 乙庚天干合 (ก้าน乙อยู่บนเสาชง)",
    pillars: P("乙卯", "庚午", "戊申", "丁酉"),
    expectRule: "ZPZQ-XCH-002",
    expectVerdict: "suppressed_by_stem_combo",
  },
  {
    name: "[XCH-002-B edge · ไม่มีคู่ก้านฮะ] 甲子 庚午 戊申 丁卯 — 子午沖 แต่ 甲/庚 ไม่ใช่คู่合",
    pillars: P("甲子", "庚午", "戊申", "丁卯"),
    expectRule: "ZPZQ-XCH-002",
    expectAbsent: true,
  },
  {
    name: "[XCH-002-C edge · 天干合 ไม่อยู่บนเสาชง] 戊辰 癸亥 庚午 丙子 — 子午沖 (day↔hour), 戊癸合 (year/month) ห่าง clash",
    pillars: P("戊辰", "癸亥", "庚午", "丙子"),
    expectRule: "ZPZQ-XCH-002",
    expectAbsent: true,
  },

  /* ──── ZPZQ-XCH-003 因解而反得刑衝 (3) ──── */
  {
    name: "[XCH-003-A positive · 六沖รอง] 辛酉 乙未 丁卯 辛丑 — half巳酉丑 (酉丑) แก้ชง卯酉 แต่ดึง未เปิดชง未丑/丑เสาhour",
    // half酉丑 (year/hour) covers酉; clash卯酉 → flag XCH-001 + ตรวจ secondary: 丑→未 (month=未) → secondary六沖 (未丑) เสา month vs hour
    pillars: P("辛酉", "乙未", "丁卯", "辛丑"),
    expectRule: "ZPZQ-XCH-003",
    expectVerdict: "secondary_clash_exposed",
  },
  {
    name: "[XCH-003-B positive · 自刑รอง] 丙午 壬辰 庚戌 庚辰 — half午戌คลายชง辰戌 + ปลุก 辰辰自刑 เสา hour",
    pillars: P("丙午", "壬辰", "庚戌", "庚辰"),
    expectRule: "ZPZQ-XCH-003",
    expectVerdict: "secondary_clash_exposed",
  },
  {
    name: "[XCH-003-C edge · 三合คลายชงสำเร็จ ไม่มี secondary] 壬申 丙午 甲寅 丁卯 — half寅午คลาย寅申, ไม่ดึงชง/刑เสาอื่น",
    pillars: P("壬申", "丙午", "甲寅", "丁卯"),
    expectRule: "ZPZQ-XCH-003",
    expectAbsent: true,
  },
];

let pass = 0, fail = 0;
function mark(ok, label, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `\n  ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

console.log("=== HK-XCH resolver v1 ===");
for (const c of cases) {
  const { resolutions } = resolveXch({ pillars: c.pillars });
  const matched = resolutions.filter((r) => r.ruleId === c.expectRule);
  if (c.expectAbsent) {
    const ok = matched.length === 0;
    mark(
      ok,
      c.name,
      ok ? `(no ${c.expectRule} flagged ✓)` : `unexpected: ${matched.map(explainXchResolution).join(" | ")}`,
    );
  } else {
    const matchVerdict = matched.find((r) => r.verdict === c.expectVerdict);
    const ok = Boolean(matchVerdict);
    mark(
      ok,
      c.name,
      matchVerdict
        ? explainXchResolution(matchVerdict)
        : `expected ${c.expectRule}/${c.expectVerdict} · got: ${
            resolutions.map(explainXchResolution).join(" | ") || "(none)"
          }`,
    );
  }
}

/* coverage: ทุก rule ต้องมี positive case อย่างน้อย 1 */
const positiveRules = new Set(cases.filter((c) => !c.expectAbsent).map((c) => c.expectRule));
for (const id of ["ZPZQ-XCH-001", "ZPZQ-XCH-002", "ZPZQ-XCH-003"]) {
  mark(positiveRules.has(id), `coverage has positive case of ${id}`);
}

/* registry: 3 rule ต้องเป็น supported + ลิงก์ resolver */
const ruleMap = new Map(BAZI_INTERACTION_RULES.map((r) => [r.ruleId, r]));
for (const id of ["ZPZQ-XCH-001", "ZPZQ-XCH-002", "ZPZQ-XCH-003"]) {
  const r = ruleMap.get(id);
  const linked = r ? /xch_resolver|bazi-xch-resolver/.test([r.engineMeaning, ...r.appliesTo].join(" ")) : false;
  mark(
    Boolean(r && r.engineStatus === "supported" && linked),
    `registry ${id} engineStatus=supported + linked resolver`,
    r ? `${r.engineStatus} · appliesTo=${r.appliesTo.join("/")}` : "missing",
  );
}

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
