import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildCivilSkySnapshot,
  nextCivilTwoHourBoundary,
  type AstronomyFactSnapshot,
} from "../src/lib/astro/astronomy-fact-r8";

const bangkokInstant = new Date("2026-09-04T05:00:00.000Z");
const first = buildCivilSkySnapshot({
  instant: bangkokInstant,
  timezone: "Asia/Bangkok",
  observation: { frame: "geocentric", location: null },
});
const second = buildCivilSkySnapshot({
  instant: bangkokInstant,
  timezone: "Asia/Bangkok",
  observation: { frame: "geocentric", location: null },
});

assert.deepEqual(second, first, "the same typed astronomy input is byte-stable");
assert.equal(first.schema, 1);
assert.equal(first.category, "astronomy_fact");
assert.equal(first.mode, "civil_two_hour");
assert.equal(first.modelVersion, "astronomy-engine-2.1.19-tzdb-2026c-geocentric-apparent-v2");
assert.equal(first.localBoundary, "2026-09-04T12:00:00+07:00");
assert.equal(first.boundary.fold, "single");
assert.deepEqual(first.physicalBodies.map((body) => body.key),
  ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
assert.deepEqual(first.points.map((point) => point.definition), [
  "mean_ascending_lunar_node",
  "mean_descending_lunar_node",
  "mean_lunar_apogee",
]);
assert.equal(first.points.some((point) => point.key === "Ziqi"), false, "紫氣 is absent");
assert.equal(first.prediction, false);
assert.equal(first.judgment, null);
assert.doesNotMatch(JSON.stringify(first), /ดี|ร้าย|มงคล|อัปมงคล|auspicious|inauspicious|score|advice|體|用|廟旺|恩用|仇難/iu);

assert.throws(() => buildCivilSkySnapshot({
  instant: new Date("2026-09-04T05:01:00.000Z"),
  timezone: "Asia/Bangkok",
  observation: { frame: "geocentric", location: null },
}), /astronomy_fact_not_boundary/u);
assert.throws(() => buildCivilSkySnapshot({
  instant: bangkokInstant,
  timezone: "Invalid/Zone",
  observation: { frame: "geocentric", location: null },
}), /astronomy_fact_timezone_invalid/u);
assert.throws(() => buildCivilSkySnapshot({
  instant: bangkokInstant,
  timezone: "Asia/Bangkok",
  observation: { frame: "topocentric", location: { lat: 13.7563, lng: 100.5018 } },
}), /astronomy_fact_frame_unavailable/u);

const mercuryStation = buildCivilSkySnapshot({
  instant: new Date("2026-02-26T07:00:00.000Z"),
  timezone: "Asia/Bangkok",
  observation: { frame: "geocentric", location: null },
});
assert.equal(
  mercuryStation.physicalBodies.find((body) => body.key === "Mercury")?.retrograde,
  true,
  "motion is measured around the instant, not over the trailing 24 hours",
);

function next(after: string, timezone: string): string {
  const boundary = nextCivilTwoHourBoundary(timezone, new Date(after));
  assert.ok(boundary, `${timezone} must have a next boundary`);
  return boundary.instant.toISOString();
}

assert.equal(next("2026-03-08T06:59:00.000Z", "America/New_York"), "2026-03-08T08:00:00.000Z",
  "a nonexistent 02:00 boundary is skipped");
assert.equal(next("2026-10-24T23:59:00.000Z", "Europe/Berlin"), "2026-10-25T00:00:00.000Z",
  "a repeated 02:00 boundary selects its earlier offset");
assert.equal(next("2026-10-25T00:30:00.000Z", "Europe/Berlin"), "2026-10-25T03:00:00.000Z",
  "the later repeated 02:00 boundary is not emitted");
assert.equal(next("2026-09-03T18:29:00.000Z", "Asia/Kolkata"), "2026-09-03T18:30:00.000Z");
assert.equal(next("2026-09-03T18:14:00.000Z", "Asia/Kathmandu"), "2026-09-03T18:15:00.000Z");
assert.equal(next("2026-09-04T09:59:00.000Z", "Pacific/Kiritimati"), "2026-09-04T10:00:00.000Z");
assert.equal(next("2026-09-20T01:30:00.000Z", "Africa/Casablanca"), "2026-09-20T02:00:00.000Z",
  "tzdb 2026c applies Morocco permanent UTC from 2026-09-20");
assert.equal(next("2026-11-01T08:30:00.000Z", "America/Edmonton"), "2026-11-01T10:00:00.000Z",
  "tzdb 2026c applies Alberta permanent UTC-06");

const berlinFold = buildCivilSkySnapshot({
  instant: new Date("2026-10-25T00:00:00.000Z"),
  timezone: "Europe/Berlin",
  observation: { frame: "geocentric", location: null },
});
assert.equal(berlinFold.boundary.fold, "earlier");
assert.throws(() => buildCivilSkySnapshot({
  instant: new Date("2026-10-25T01:00:00.000Z"),
  timezone: "Europe/Berlin",
  observation: { frame: "geocentric", location: null },
}), /astronomy_fact_repeated_boundary/u);

function countLocalDate(timezone: string, localDate: string): number {
  let cursor = new Date(`${localDate}T00:00:00.000Z`);
  const seen = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const boundary = nextCivilTwoHourBoundary(timezone, cursor);
    assert.ok(boundary);
    cursor = boundary.instant;
    if (boundary.localDate === localDate) seen.add(boundary.unitId);
    if (boundary.localDate > localDate) break;
  }
  return seen.size;
}

for (const [timezone, localDate] of [
  ["Asia/Bangkok", "2026-09-04"],
  ["America/New_York", "2026-03-08"],
  ["Europe/Berlin", "2026-10-25"],
  ["Pacific/Apia", "2026-09-04"],
] as const) {
  assert.ok(countLocalDate(timezone, localDate) <= 12, `${timezone} emits at most 12 units per local day`);
}

function canonicalDigest(snapshot: AstronomyFactSnapshot): string {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
const digest = canonicalDigest(first);
assert.match(digest, /^[0-9a-f]{64}$/u);
assert.equal(canonicalDigest(second), digest);

const jplGolden = JSON.parse(readFileSync(
  new URL("./fixtures/astronomy-fact-r8-jpl-horizons-goldens.json", import.meta.url),
  "utf8",
)) as {
  source: { endpoint: string; observer: string; ephemerisType: string; quantity: number };
  instant: string;
  timezone: string;
  toleranceDeg: number;
  bodies: Array<{
    key: string;
    command: string;
    longitudeDeg: number;
    latitudeDeg: number;
  }>;
};
assert.equal(jplGolden.source.endpoint, "https://ssd.jpl.nasa.gov/api/horizons.api");
assert.equal(jplGolden.source.observer, "500@399");
assert.equal(jplGolden.source.ephemerisType, "OBSERVER");
assert.equal(jplGolden.source.quantity, 31);
const goldenSnapshot = buildCivilSkySnapshot({
  instant: new Date(jplGolden.instant),
  timezone: jplGolden.timezone,
  observation: { frame: "geocentric", location: null },
});
for (const expected of jplGolden.bodies) {
  const actual = goldenSnapshot.physicalBodies.find((body) => body.key === expected.key);
  assert.ok(actual, `missing ${expected.key} from the seven physical bodies`);
  assert.ok(Math.abs(actual.longitudeTropicalDeg - expected.longitudeDeg) <= jplGolden.toleranceDeg,
    `${expected.key} longitude must match JPL Horizons target ${expected.command}`);
  assert.ok(Math.abs(actual.eclipticLatitudeDeg - expected.latitudeDeg) <= jplGolden.toleranceDeg,
    `${expected.key} latitude must match JPL Horizons target ${expected.command}`);
}

console.log(`ASTRONOMY_FACT_R8_OK digest=${digest}`);
