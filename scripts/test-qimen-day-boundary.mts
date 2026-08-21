import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-canonical-day-boundary.cjs") as {
  CALCULATION_VERSION: string;
  resolveFaqiaoDayJu(at: Date | string): {
    calculationVersion: string;
    dun: "yang" | "yin";
    ju: 1 | 3 | 4 | 6 | 7 | 9;
    validFrom: string;
    validUntil: string;
    startTermCode: string;
    endTermCode: string;
  };
};
const solarTerms = require("../src/lib/zibai-solar-term-runtime.cjs") as {
  canonicalSolarTermInstant(year: number, index: number): string | null;
};
const advisory = require("../src/lib/qimen-notification-advisory.cjs") as {
  trueSolarDayWindow(input: { timezone: string; longitude: number; instant: Date | string }): {
    startAt: string; endAt: string; apparentDate: string;
  };
};

assert.equal(runtime.CALCULATION_VERSION, "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1");

const transitions = [
  { index: 0, code: "dongzhi", before: ["yin", 6], after: ["yang", 1] },
  { index: 4, code: "yushui", before: ["yang", 1], after: ["yang", 7] },
  { index: 8, code: "guyu", before: ["yang", 7], after: ["yang", 4] },
  { index: 12, code: "xiazhi", before: ["yang", 4], after: ["yin", 9] },
  { index: 16, code: "chushu", before: ["yin", 9], after: ["yin", 3] },
  { index: 20, code: "shuangjiang", before: ["yin", 3], after: ["yin", 6] },
] as const;

for (const cycleYear of [2024, 2025, 2026, 2027, 2030, 2040]) {
  for (const transition of transitions) {
    const boundary = solarTerms.canonicalSolarTermInstant(cycleYear, transition.index);
    assert.ok(boundary, `astronomical term ${cycleYear}/${transition.code} must resolve`);
    const boundaryMs = Date.parse(boundary!);
    const before = runtime.resolveFaqiaoDayJu(new Date(boundaryMs - 1));
    const exact = runtime.resolveFaqiaoDayJu(new Date(boundaryMs));
    const after = runtime.resolveFaqiaoDayJu(new Date(boundaryMs + 1));
    assert.deepEqual([before.dun, before.ju], transition.before, `${transition.code} T-1ms keeps old Ju`);
    assert.deepEqual([exact.dun, exact.ju], transition.after, `${transition.code} T adopts new Ju`);
    assert.deepEqual([after.dun, after.ju], transition.after, `${transition.code} T+1ms keeps new Ju`);
    assert.equal(exact.validFrom, boundary);
    assert.equal(exact.startTermCode, transition.code);
    assert.equal(exact.calculationVersion, runtime.CALCULATION_VERSION);
    assert.ok(Date.parse(exact.validUntil) > boundaryMs);
  }
}

for (let year = 2000; year <= 2050; year += 1) {
  for (let month = 0; month < 12; month += 1) {
    const at = new Date(Date.UTC(year, month, 15, 12));
    const resolved = runtime.resolveFaqiaoDayJu(at);
    assert.ok(Date.parse(resolved.validFrom) <= at.valueOf());
    assert.ok(Date.parse(resolved.validUntil) > at.valueOf());
    assert.ok([1, 3, 4, 6, 7, 9].includes(resolved.ju));
  }
}

assert.throws(() => runtime.resolveFaqiaoDayJu("not-an-instant"), /QIMEN_DAY_BOUNDARY_INVALID/u);
assert.equal(solarTerms.canonicalSolarTermInstant(2026, -1), null);
assert.equal(solarTerms.canonicalSolarTermInstant(2026, 24), null);

for (const input of [
  { timezone: "Asia/Bangkok", longitude: 100.5018, instant: "2026-08-21T06:00:00.000Z" },
  { timezone: "America/New_York", longitude: -74.006, instant: "2026-03-08T07:30:00.000Z" },
  { timezone: "America/New_York", longitude: -74.006, instant: "2026-11-01T06:30:00.000Z" },
]) {
  const window = advisory.trueSolarDayWindow(input);
  const instant = Date.parse(input.instant);
  assert.ok(Date.parse(window.startAt) <= instant && Date.parse(window.endAt) > instant);
  assert.ok(Date.parse(window.endAt) - Date.parse(window.startAt) >= 22 * 3_600_000);
  assert.ok(Date.parse(window.endAt) - Date.parse(window.startAt) <= 26 * 3_600_000);
  assert.match(window.apparentDate, /^\d{4}-\d{2}-\d{2}$/u);
}

console.log("qimen nominal four-qi day boundary tests passed");
