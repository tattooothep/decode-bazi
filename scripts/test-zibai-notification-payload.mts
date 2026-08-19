import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import runtime from "../src/lib/notification-payload.cjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/zibai-three-layer-cases.json", import.meta.url), "utf8"));

const dayPalaces = { N: 1, NE: 2, E: 3, SE: 4, S: 5, SW: 6, W: 7, NW: 8, C: 9 };
const hourPalaces = { N: 9, NE: 8, E: 7, SE: 6, S: 5, SW: 4, W: 3, NW: 2, C: 1 };
const focus = [1, 2, 5, 9].map((star) => ({
  star,
  dayDirection: Object.keys(dayPalaces).find((key) => dayPalaces[key as keyof typeof dayPalaces] === star),
  dayRelation: "same-element",
  shichenDirection: Object.keys(hourPalaces).find((key) => hourPalaces[key as keyof typeof hourPalaces] === star),
  shichenRelation: "generates-palace",
  overlaps: star === 5,
}));

const facts = {
  event: "zibai_shichen",
  referenceId: "zibai|2026-08-16|si|zibai-zaoming-true-solar-v2",
  calculationVersion: "zibai-zaoming-true-solar-v2",
  apparentSolarDate: "2026-08-16",
  shichenKey: "si",
  startAt: "2026-08-16T02:07:00.000Z",
  endAt: "2026-08-16T04:07:00.000Z",
  dayPalaces,
  shichenPalaces: hourPalaces,
  focus,
  url: "/zibai",
};

const payload = runtime.buildNotificationPayload("zibai", "00000000-0000-4000-8000-000000000001", facts);
assert.equal(payload.kind, "zibai");
assert.equal(payload.url, "/zibai");
assert.ok(JSON.stringify(payload).length < 4_096);
assert.equal(JSON.stringify(payload), JSON.stringify({ v: 1, kind: "zibai", accountId: payload.accountId, ...facts }),
  "schema-v1 byte order and values remain exact");

assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, dayPalaces: { ...dayPalaces, C: 8 } }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, shichenKey: "midnight" }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, latitude: 13.7 }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, url: "/luopan" }), /invalid zibai/u);
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, { ...facts, referenceId: "zibai|2026-08-15|si|zibai-zaoming-true-solar-v2" }), /invalid zibai/u,
  "the occurrence reference date must equal apparentSolarDate");

const daily = runtime.buildNotificationPayload("zibai", payload.accountId, {
  ...facts,
  event: "zibai_daily",
  referenceId: "zibai|2026-08-16|daily|zibai-zaoming-true-solar-v2",
  shichenKey: null,
  endAt: "2026-08-17T02:07:00.000Z",
  shichenPalaces: null,
  focus: focus.map((item) => ({ ...item, shichenDirection: null, shichenRelation: null, overlaps: false })),
});
assert.equal(daily.event, "zibai_daily");
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, {
  ...daily,
  endAt: "2026-08-16T04:07:00.000Z",
}), /invalid zibai/u, "daily envelopes must cover one apparent-solar day, not one shichen");
assert.throws(() => runtime.buildNotificationPayload("zibai", payload.accountId, {
  ...facts,
  endAt: "2026-08-17T02:07:00.000Z",
}), /invalid zibai/u, "shichen envelopes cannot claim a full day");

function v2FactsFor(testCase: any) {
  const isDaily = testCase.shichen === null;
  return {
    snapshotSchema: 2,
    event: isDaily ? "zibai_daily" : "zibai_shichen",
    referenceId: `zibai|2026-08-16|${isDaily ? "daily" : "si"}|zibai-zaoming-true-solar-v2`,
    calculationVersion: "zibai-zaoming-true-solar-v2",
    interpretationVersion: "zibai-3layer-rule-v1",
    month: {
      startTermCode: testCase.month.startTermCode,
      endTermCode: testCase.month.endTermCode,
      palaces: structuredClone(testCase.month.palaces),
      startAt: "2026-08-07T11:42:43.000Z",
      endAt: "2026-09-07T14:41:16.000Z",
    },
    day: {
      palaces: structuredClone(testCase.day.palaces),
      apparentSolarDate: "2026-08-16",
      startAt: "2026-08-15T16:00:00.000Z",
      endAt: "2026-08-16T16:00:00.000Z",
    },
    shichen: isDaily ? null : {
      palaces: structuredClone(testCase.shichen.palaces),
      key: "si",
      startAt: "2026-08-16T02:00:00.000Z",
      endAt: "2026-08-16T04:00:00.000Z",
    },
    sectors: structuredClone(testCase.sectors),
    url: "/zibai",
  };
}

function invalidV2(candidate: unknown, message: string) {
  assert.throws(
    () => runtime.buildNotificationPayload("zibai", payload.accountId, candidate),
    /invalid zibai/u,
    message,
  );
}

const mixedFacts = v2FactsFor(fixture.cases[1]);
const dailyFacts = v2FactsFor(fixture.cases[2]);
let shichenWireBytes = 0;
let dailyWireBytes = 0;
const SECTION_CODES = [
  "xiaohan", "lichun", "jingzhe", "qingming", "lixia", "mangzhong",
  "xiaoshu", "liqiu", "bailu", "hanlu", "lidong", "daxue",
] as const;
const SECTION_INSTANTS_2026 = [
  "2026-01-05T08:23:10.000Z", "2026-02-03T20:02:08.000Z",
  "2026-03-05T13:59:00.000Z", "2026-04-04T18:40:00.000Z",
  "2026-05-05T11:48:44.000Z", "2026-06-05T15:48:21.000Z",
  "2026-07-07T01:56:57.000Z", "2026-08-07T11:42:43.000Z",
  "2026-09-07T14:41:16.000Z", "2026-10-08T06:29:17.000Z",
  "2026-11-07T09:52:05.000Z", "2026-12-07T02:52:32.000Z",
  "2027-01-05T14:09:58.000Z",
] as const;
const v2Failures: Error[] = [];
function v2Contract(name: string, check: () => void) {
  try {
    check();
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    v2Failures.push(new Error(`${name}: ${cause.message}`, { cause }));
  }
}

v2Contract("exact shichen v2 wire facts are accepted below 3.5 KB", () => {
  const built = runtime.buildNotificationPayload("zibai", payload.accountId, mixedFacts);
  assert.deepEqual(built, { v: 1, kind: "zibai", accountId: payload.accountId, ...mixedFacts });
  assert.equal(built.sectors.length, 9);
  assert.deepEqual(built.sectors[0], {
    direction: "N", month: 9, day: 5, shichen: 2, patternCode: "mixed_caution_priority",
  });
  shichenWireBytes = Buffer.byteLength(JSON.stringify(built), "utf8");
  assert.ok(shichenWireBytes <= 3.5 * 1_024, `v2 wire payload is ${shichenWireBytes} bytes`);
});
v2Contract("exact daily v2 excludes shichen from every attestation", () => {
  const built = runtime.buildNotificationPayload("zibai", payload.accountId, dailyFacts);
  assert.equal(built.shichen, null);
  assert.equal(built.sectors.length, 9);
  assert.ok(built.sectors.every((sector: any) => sector.shichen === null));
  assert.deepEqual(built.sectors.find((sector: any) => sector.direction === "NW"), {
    direction: "NW", month: 9, day: 9, shichen: null, patternCode: "two_layer_same_star",
  });
  dailyWireBytes = Buffer.byteLength(JSON.stringify(built), "utf8");
  assert.ok(dailyWireBytes <= 3.5 * 1_024);
});
v2Contract("top-level data fields are enumerated exactly once", () => {
  let ownKeysCalls = 0;
  const observed = new Proxy(mixedFacts, {
    ownKeys(target) {
      ownKeysCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  runtime.buildNotificationPayload("zibai", payload.accountId, observed);
  assert.equal(ownKeysCalls, 1, "one exact own-key snapshot prevents validate/use divergence");
});
v2Contract("all twelve named 2026 section windows use their exact canonical instants", () => {
  for (let index = 0; index < SECTION_CODES.length; index += 1) {
    const startAt = SECTION_INSTANTS_2026[index];
    const endAt = SECTION_INSTANTS_2026[index + 1];
    const apparentSolarDate = new Date(Date.parse(startAt) + 3 * 86_400_000).toISOString().slice(0, 10);
    const dayStart = `${apparentSolarDate}T00:00:00.000Z`;
    const candidate = {
      ...dailyFacts,
      referenceId: `zibai|${apparentSolarDate}|daily|zibai-zaoming-true-solar-v2`,
      month: {
        ...dailyFacts.month,
        startTermCode: SECTION_CODES[index],
        endTermCode: SECTION_CODES[(index + 1) % SECTION_CODES.length],
        startAt,
        endAt,
      },
      day: {
        ...dailyFacts.day,
        apparentSolarDate,
        startAt: dayStart,
        endAt: new Date(Date.parse(dayStart) + 86_400_000).toISOString(),
      },
    };
    runtime.buildNotificationPayload("zibai", payload.accountId, candidate);
    invalidV2({
      ...candidate,
      month: { ...candidate.month, startAt: new Date(Date.parse(startAt) + 1_000).toISOString() },
    }, `${SECTION_CODES[index]} rejects a one-second boundary mutation`);
  }
});
v2Contract("the named section pair cannot be relabelled over valid instants", () => {
  invalidV2({
    ...mixedFacts,
    month: { ...mixedFacts.month, startTermCode: "xiaoshu", endTermCode: "liqiu" },
  }, "valid Liqiu/Bailu instants reject Xiaoshu/Liqiu labels");
});
v2Contract("canonical section instants reject every one-second and one-day shift", () => {
  for (const shiftMs of [-86_400_000, -1_000, 1_000, 86_400_000]) {
    invalidV2({
      ...mixedFacts,
      month: {
        ...mixedFacts.month,
        startAt: new Date(Date.parse(mixedFacts.month.startAt) + shiftMs).toISOString(),
        endAt: new Date(Date.parse(mixedFacts.month.endAt) + shiftMs).toISOString(),
      },
    }, `canonical Liqiu/Bailu instants reject ${shiftMs}ms shift`);
  }
});
v2Contract("Daxue to Xiaohan validates across the Gregorian year rollover", () => {
  const apparentSolarDate = "2025-12-09";
  const candidate = {
    ...dailyFacts,
    referenceId: `zibai|${apparentSolarDate}|daily|zibai-zaoming-true-solar-v2`,
    month: {
      ...dailyFacts.month,
      startTermCode: "daxue",
      endTermCode: "xiaohan",
      startAt: "2025-12-06T21:04:37.000Z",
      endAt: "2026-01-05T08:23:10.000Z",
    },
    day: {
      ...dailyFacts.day,
      apparentSolarDate,
      startAt: "2025-12-09T00:00:00.000Z",
      endAt: "2025-12-10T00:00:00.000Z",
    },
  };
  runtime.buildNotificationPayload("zibai", payload.accountId, candidate);
  invalidV2({
    ...candidate,
    month: { ...candidate.month, endAt: "2026-01-05T08:23:11.000Z" },
  }, "rollover Xiaohan instant is exact");
});
v2Contract("apparent date and reference year remain physically consistent with UTC day bounds", () => {
  const apparentSolarDate = "2027-08-16";
  invalidV2({
    ...dailyFacts,
    referenceId: `zibai|${apparentSolarDate}|daily|zibai-zaoming-true-solar-v2`,
    day: { ...dailyFacts.day, apparentSolarDate },
  }, "a matching but unrelated reference/date year cannot describe the 2026 day bounds");
  const tooEarly = "2026-08-14";
  invalidV2({
    ...dailyFacts,
    referenceId: `zibai|${tooEarly}|daily|zibai-zaoming-true-solar-v2`,
    day: { ...dailyFacts.day, apparentSolarDate: tooEarly },
  }, "an apparent date more than the physical one-day UTC displacement rejects");
});
v2Contract("all present layers require a positive common active intersection", () => {
  const base = {
    ...mixedFacts,
    referenceId: "zibai|2026-08-07|si|zibai-zaoming-true-solar-v2",
    day: {
      ...mixedFacts.day,
      apparentSolarDate: "2026-08-07",
      startAt: "2026-08-06T16:00:00.000Z",
      endAt: "2026-08-07T16:00:00.000Z",
    },
  };
  invalidV2({
    ...base,
    shichen: { ...mixedFacts.shichen, startAt: "2026-08-07T08:00:00.000Z", endAt: "2026-08-07T10:00:00.000Z" },
  }, "shichen wholly before the active month cannot borrow the day's overlap");
  invalidV2({
    ...base,
    shichen: { ...mixedFacts.shichen, startAt: "2026-08-07T09:42:43.000Z", endAt: mixedFacts.month.startAt },
  }, "an interval touching the month boundary has no positive common intersection");
  runtime.buildNotificationPayload("zibai", payload.accountId, {
    ...base,
    shichen: { ...mixedFacts.shichen, startAt: "2026-08-07T11:00:00.000Z", endAt: "2026-08-07T13:00:00.000Z" },
  });
});
v2Contract("own __proto__, constructor, and prototype fields reject before canonical return", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const v2Candidate = { ...mixedFacts };
    Object.defineProperty(v2Candidate, key, { value: "injected", enumerable: true, configurable: true });
    invalidV2(v2Candidate, `v2 rejects own enumerable data ${key}`);

    const v1Candidate = { ...facts };
    Object.defineProperty(v1Candidate, key, { value: "injected", enumerable: true, configurable: true });
    assert.throws(
      () => runtime.buildNotificationPayload("zibai", payload.accountId, v1Candidate),
      /invalid zibai/u,
      `v1 rejects own enumerable data ${key}`,
    );
  }
});

for (const field of ["latitude", "longitude", "houseId", "natalChart", "period9", "qimenScore", "floorPlan", "unknown"]) {
  invalidV2({ ...mixedFacts, [field]: field }, `v2 rejects forbidden/unknown ${field}`);
}
invalidV2({ ...mixedFacts, snapshotSchema: 1 }, "v2 fields cannot claim schema 1");
invalidV2({ ...mixedFacts, snapshotSchema: "2" }, "snapshotSchema is the exact integer 2");
invalidV2({ ...mixedFacts, interpretationVersion: "zibai-3layer-rule-v2" }, "unknown interpretation versions fail closed");
invalidV2({ ...mixedFacts, calculationVersion: "zibai-zaoming-true-solar-v1" }, "unknown calculation versions fail closed");

const invalidMaps = [
  { ...mixedFacts.month.palaces, C: 3 },
  Object.fromEntries(Object.entries(mixedFacts.month.palaces).filter(([direction]) => direction !== "C")),
  { ...mixedFacts.month.palaces, UP: 8 },
];
for (const [index, palaces] of invalidMaps.entries()) {
  invalidV2({ ...mixedFacts, month: { ...mixedFacts.month, palaces } }, `month map mutation ${index + 1}`);
}
invalidV2({ ...mixedFacts, day: { ...mixedFacts.day, palaces: { ...mixedFacts.day.palaces, N: 4 } } }, "day map must be a permutation");
invalidV2({ ...mixedFacts, shichen: { ...mixedFacts.shichen, palaces: { ...mixedFacts.shichen.palaces, NW: 6 } } }, "shichen map must be a permutation");

for (const field of ["startAt", "endAt"] as const) {
  const month = { ...mixedFacts.month };
  delete month[field];
  invalidV2({ ...mixedFacts, month }, `month.${field} is required`);
}
invalidV2({ ...mixedFacts, month: { ...mixedFacts.month, startAt: "2026-09-08T00:00:00.000Z" } }, "month bounds must increase");
invalidV2({ ...mixedFacts, month: { ...mixedFacts.month, endTermCode: "hanlu" } }, "month term metadata must name consecutive section terms");
invalidV2({ ...mixedFacts, month: { ...mixedFacts.month, termName: "Autumn begins" } }, "month term metadata has exact fields");
invalidV2({ ...mixedFacts, day: { ...mixedFacts.day, apparentSolarDate: "2026-08-15" } }, "day date matches the occurrence reference");
invalidV2({ ...mixedFacts, day: { ...mixedFacts.day, endAt: "2026-08-15T18:00:00.000Z" } }, "day bounds cover one apparent-solar day");
invalidV2({ ...mixedFacts, shichen: null }, "shichen events require a shichen layer");
invalidV2({ ...dailyFacts, shichen: mixedFacts.shichen }, "daily events require shichen null");

const attestationMutations: Array<[string, (sector: any) => void]> = [
  ["direction", (sector) => { sector.direction = "NE"; }],
  ["month star", (sector) => { sector.month = sector.month === 9 ? 8 : 9; }],
  ["day star", (sector) => { sector.day = sector.day === 5 ? 4 : 5; }],
  ["shichen star", (sector) => { sector.shichen = sector.shichen === 2 ? 1 : 2; }],
  ["pattern code", (sector) => { sector.patternCode = "reference_only"; }],
];
for (const [name, mutate] of attestationMutations) {
  const candidate = structuredClone(mixedFacts);
  mutate(candidate.sectors[0]);
  invalidV2(candidate, `every ${name} attestation mismatch rejects`);
}
invalidV2({ ...mixedFacts, sectors: mixedFacts.sectors.slice(0, 8) }, "exactly nine sectors are required");
invalidV2({ ...mixedFacts, sectors: [...mixedFacts.sectors].reverse() }, "sector order is canonical and exact");
invalidV2({ ...dailyFacts, sectors: dailyFacts.sectors.map((sector: any, index: number) => index === 0 ? { ...sector, shichen: 4 } : sector) },
  "daily compact attestations cannot smuggle shichen data");

let topAccessorCalls = 0;
const topAccessor = { ...mixedFacts };
Object.defineProperty(topAccessor, "snapshotSchema", {
  enumerable: true,
  get() { topAccessorCalls += 1; return 2; },
});
invalidV2(topAccessor, "top-level accessors reject without execution");
assert.equal(topAccessorCalls, 0, "top-level accessor was never invoked");
let nestedAccessorCalls = 0;
const accessorMonth = { ...mixedFacts.month };
Object.defineProperty(accessorMonth, "startAt", {
  enumerable: true,
  get() { nestedAccessorCalls += 1; return mixedFacts.month.startAt; },
});
invalidV2({ ...mixedFacts, month: accessorMonth }, "nested accessors reject without execution");
assert.equal(nestedAccessorCalls, 0, "nested accessor was never invoked");

const symbolFacts = { ...mixedFacts };
symbolFacts[Symbol("coordinates")] = [13.7, 100.5];
invalidV2(symbolFacts, "symbol fields reject");
const hiddenFacts = { ...mixedFacts };
Object.defineProperty(hiddenFacts, "period9", { value: 9, enumerable: false });
invalidV2(hiddenFacts, "non-enumerable fields reject");
const hiddenMap = { ...mixedFacts.month.palaces };
Object.defineProperty(hiddenMap, "latitude", { value: 13.7, enumerable: false });
invalidV2({ ...mixedFacts, month: { ...mixedFacts.month, palaces: hiddenMap } }, "nested non-enumerable fields reject");
const symbolSector = structuredClone(mixedFacts);
symbolSector.sectors[0][Symbol("qimen")] = 88;
invalidV2(symbolSector, "nested symbol fields reject");
const inheritedFacts = Object.assign(Object.create({ floorPlan: "hidden" }), mixedFacts);
invalidV2(inheritedFacts, "custom inherited fields reject");

if (v2Failures.length > 0) throw new AggregateError(v2Failures, "Zi Bai exact payload schema v2 contract is RED");

console.log("ZIBAI_NOTIFICATION_PAYLOAD_OK");
console.log(`ZIBAI_NOTIFICATION_PAYLOAD_BYTES shichen=${shichenWireBytes} daily=${dailyWireBytes}`);
