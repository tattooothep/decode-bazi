import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import runtime from "../src/lib/notification-payload.cjs";
import { buildZibaiSnapshot } from "../src/lib/zibai-science.ts";

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"] as const;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/zibai-three-layer-cases.json", import.meta.url), "utf8"));

function exactPermutation(palaces: Record<string, number>, label: string) {
  assert.deepEqual(Object.keys(palaces).sort(), [...DIRECTIONS].sort(), `${label}: exact palace keys`);
  assert.deepEqual(Object.values(palaces).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9], `${label}: exact 1-9 permutation`);
}

function sectorsFor(testCase: any) {
  return DIRECTIONS.map((direction) => ({
    direction,
    month: testCase.month.palaces[direction],
    day: testCase.day.palaces[direction],
    shichen: testCase.shichen?.palaces[direction] ?? null,
    patternCode: direction === testCase.assertion.direction ? testCase.assertion.pattern : "reference_only",
  }));
}

assert.deepEqual(fixture.cases.map((testCase: any) => testCase.id), [
  "triple-nine-northwest",
  "mixed-nine-five-two-north",
  "daily-two-layer-northwest",
]);

for (const testCase of fixture.cases) {
  assert.equal(testCase.snapshotSchema, 2);
  assert.equal(testCase.calculationVersion, "zibai-zaoming-true-solar-v2");
  assert.equal(testCase.interpretationVersion, "zibai-3layer-rule-v1");
  assert.deepEqual(
    { startTermCode: testCase.month.startTermCode, endTermCode: testCase.month.endTermCode },
    { startTermCode: "liqiu", endTermCode: "bailu" },
  );
  for (const layer of ["month", "day"] as const) exactPermutation(testCase[layer].palaces, `${testCase.id}.${layer}`);
  if (testCase.shichen !== null) exactPermutation(testCase.shichen.palaces, `${testCase.id}.shichen`);
  const { direction, month, day, shichen, pattern } = testCase.assertion;
  assert.deepEqual(
    { month: testCase.month.palaces[direction], day: testCase.day.palaces[direction], shichen: testCase.shichen?.palaces[direction] ?? null, pattern },
    { month, day, shichen, pattern },
  );
  assert.equal(sectorsFor(testCase).length, 9, `${testCase.id}: all nine sectors are contract data`);
}

const accountId = "00000000-0000-4000-8000-000000000001";
const v1DayPalaces = { N: 1, NE: 2, E: 3, SE: 4, S: 5, SW: 6, W: 7, NW: 8, C: 9 };
const v1ShichenPalaces = { N: 9, NE: 8, E: 7, SE: 6, S: 5, SW: 4, W: 3, NW: 2, C: 1 };
const v1Facts = {
  event: "zibai_shichen",
  referenceId: "zibai|2026-08-16|si|zibai-zaoming-true-solar-v2",
  calculationVersion: "zibai-zaoming-true-solar-v2",
  apparentSolarDate: "2026-08-16",
  shichenKey: "si",
  startAt: "2026-08-16T02:07:00.000Z",
  endAt: "2026-08-16T04:07:00.000Z",
  dayPalaces: v1DayPalaces,
  shichenPalaces: v1ShichenPalaces,
  focus: [1, 2, 5, 9].map((star) => ({
    star,
    dayDirection: DIRECTIONS.find((direction) => v1DayPalaces[direction] === star),
    dayRelation: "same-element",
    shichenDirection: DIRECTIONS.find((direction) => v1ShichenPalaces[direction] === star),
    shichenRelation: "same-element",
    overlaps: star === 5,
  })),
  url: "/zibai",
};
const preservedV1 = runtime.buildNotificationPayload("zibai", accountId, v1Facts);
assert.deepEqual(JSON.parse(JSON.stringify(preservedV1)), { v: 1, kind: "zibai", accountId, ...v1Facts }, "backend must preserve the current exact v1 Zi Bai payload");
console.log("ZIBAI_V1_BACKEND_CONTRACT_OK");

const failures: Error[] = [];
function contract(name: string, check: () => void) {
  try {
    check();
  } catch (error) {
    const reason = error instanceof Error ? error : new Error(String(error));
    failures.push(new Error(`${name}: ${reason.message}`, { cause: reason }));
  }
}

const snapshot = buildZibaiSnapshot(new Date("2026-08-16T03:07:00.000Z"), 100.5018) as any;
contract("canonical snapshot exposes monthPalaces", () => {
  assert.ok(snapshot.monthPalaces, "monthPalaces must be present on the canonical snapshot");
  exactPermutation(snapshot.monthPalaces, "snapshot.monthPalaces");
});
contract("canonical snapshot exposes exact Liqiu-to-Bailu bounds", () => {
  assert.equal(snapshot.month?.startAt, "2026-08-07T11:42:43.000Z");
  assert.equal(snapshot.month?.endAt, "2026-09-07T14:41:16.000Z");
  assert.equal(snapshot.month?.meta?.startTermCode, "liqiu");
  assert.equal(snapshot.month?.meta?.endTermCode, "bailu");
});

function v2FactsFor(testCase: any) {
  const daily = testCase.shichen === null;
  return {
    snapshotSchema: testCase.snapshotSchema,
    event: daily ? "zibai_daily" : "zibai_shichen",
    referenceId: `zibai|2026-08-16|${daily ? "daily" : "si"}|zibai-zaoming-true-solar-v2`,
    calculationVersion: testCase.calculationVersion,
    interpretationVersion: testCase.interpretationVersion,
    month: {
      ...testCase.month,
      startAt: "2026-08-07T11:42:43.000Z",
      endAt: "2026-09-07T14:41:16.000Z",
    },
    day: {
      ...testCase.day,
      apparentSolarDate: "2026-08-16",
      startAt: "2026-08-15T16:00:00.000Z",
      endAt: "2026-08-16T16:00:00.000Z",
    },
    shichen: daily ? null : {
      ...testCase.shichen,
      key: "si",
      startAt: "2026-08-16T02:00:00.000Z",
      endAt: "2026-08-16T04:00:00.000Z",
    },
    sectors: sectorsFor(testCase),
    url: "/zibai",
  };
}

const mixed = fixture.cases[1];
const daily = fixture.cases[2];
const v2Facts = v2FactsFor(mixed);

contract("backend accepts and preserves the explicit v2 contract", () => {
  const payload = runtime.buildNotificationPayload("zibai", accountId, v2Facts) as any;
  assert.equal(payload.snapshotSchema, 2);
  assert.equal(payload.sectors.length, 9);
  assert.deepEqual(payload.sectors.find((sector: any) => sector.direction === "N"), {
    direction: "N", month: 9, day: 5, shichen: 2, patternCode: "mixed_caution_priority",
  });
});
contract("backend v2 daily preserves month and day while shichen stays null", () => {
  const payload = runtime.buildNotificationPayload("zibai", accountId, v2FactsFor(daily)) as any;
  assert.equal(payload.snapshotSchema, 2);
  assert.deepEqual(payload.month.palaces, daily.month.palaces);
  assert.deepEqual(payload.day.palaces, daily.day.palaces);
  assert.equal(payload.shichen, null);
  assert.deepEqual(payload.sectors.find((sector: any) => sector.direction === "NW"), {
    direction: "NW", month: 9, day: 9, shichen: null, patternCode: "two_layer_same_star",
  });
});

if (failures.length > 0) throw new AggregateError(failures, "Zi Bai three-layer backend contract is RED");
console.log("ZIBAI_THREE_LAYER_BACKEND_CONTRACT_OK");
