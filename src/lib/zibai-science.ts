import { SolarTerm, SolarTime } from "tyme4ts";
import {
  computeFlyingLayers,
  type Dir9,
  type FlyingTermReference,
  type PalaceStars,
} from "./fengshui-luxing";
import ruleRuntime from "./zibai-three-layer-runtime.cjs";

export const ZIBAI_CALCULATION_VERSION = "zibai-zaoming-true-solar-v2" as const;
export const ZIBAI_INTERPRETATION_VERSION = "zibai-3layer-rule-v1" as const;

const SHICHEN = ["zi", "chou", "yin", "mao", "chen", "si", "wu", "wei", "shen", "you", "xu", "hai"] as const;
export type ZibaiShichenKey = (typeof SHICHEN)[number];
export type ZibaiElement = "water" | "wood" | "fire" | "earth" | "metal";
export type ZibaiRelation = "generates-palace" | "controls-palace" | "palace-generates-star" | "same-element" | "palace-controls-star";

const DIRECTIONS: Dir9[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"];
const STAR_ELEMENT: Record<number, ZibaiElement> = {
  1: "water", 2: "earth", 3: "wood", 4: "wood", 5: "earth",
  6: "metal", 7: "metal", 8: "earth", 9: "fire",
};

export type ApparentSolarParts = Readonly<{
  year: number; month: number; day: number; hour: number; minute: number; second: number;
}>;

export type ZibaiFocus = Readonly<{
  star: 1 | 2 | 5 | 9;
  element: ZibaiElement;
  dayDirection: Dir9;
  dayRelation: ZibaiRelation;
  shichenDirection: Dir9;
  shichenRelation: ZibaiRelation;
  overlaps: boolean;
}>;

export type ZibaiLayer<T> = Readonly<{
  palaces: Readonly<PalaceStars>;
  startAt: string;
  endAt: string;
  flight: "順" | "逆";
  meta: T;
}>;

export type ZibaiSnapshotV2 = Readonly<{
  snapshotSchema: 2;
  calculationVersion: typeof ZIBAI_CALCULATION_VERSION;
  interpretationVersion: typeof ZIBAI_INTERPRETATION_VERSION;
  month: ZibaiLayer<Readonly<{
    yearBranch: string;
    monthBranch: string;
    jieqiMonth: number;
    startTermCode: string;
    endTermCode: string;
  }>>;
  day: ZibaiLayer<Readonly<{ apparentSolarDate: string; dayPillar: string }>>;
  shichen: ZibaiLayer<Readonly<{ key: ZibaiShichenKey }>>;
}>;

/** Temporary top-level projections retained while v1 producers migrate. */
export type ZibaiSnapshot = Readonly<ZibaiSnapshotV2 & {
  apparentSolarDate: string;
  shichenKey: ZibaiShichenKey;
  startAt: string;
  endAt: string;
  monthPalaces: Readonly<PalaceStars>;
  dayPalaces: Readonly<PalaceStars>;
  shichenPalaces: Readonly<PalaceStars>;
  focus: readonly ZibaiFocus[];
  dayPillar: string;
  dayFlight: "順" | "逆";
  shichenFlight: "順" | "逆";
}>;

const SOLAR_SECTION_CODES = [
  "xiaohan", "lichun", "jingzhe", "qingming", "lixia", "mangzhong",
  "xiaoshu", "liqiu", "bailu", "hanlu", "lidong", "daxue",
] as const;
export type ZibaiSolarSectionCode = (typeof SOLAR_SECTION_CODES)[number];
export type ZibaiSolarTermMonthWindow = Readonly<{
  startAt: string;
  endAt: string;
  startTermCode: ZibaiSolarSectionCode;
  endTermCode: ZibaiSolarSectionCode;
}>;

function validInstant(at: Date): Date {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new TypeError("zibai_invalid_instant");
  return at;
}

function globalTermReferenceAt(at: Date): Readonly<FlyingTermReference> {
  // tyme4ts publishes its term wall fields in Chinese standard time (UTC+8).
  // This projection is global and deliberately has no longitude/time-zone input.
  const termInstant = new Date(validInstant(at).getTime() + 8 * 3_600_000);
  return Object.freeze({
    year: termInstant.getUTCFullYear(), month: termInstant.getUTCMonth() + 1,
    day: termInstant.getUTCDate(), hour: termInstant.getUTCHours(),
    minute: termInstant.getUTCMinutes(), second: termInstant.getUTCSeconds(),
  });
}

function solarTimeFromReference(reference: FlyingTermReference): SolarTime {
  return SolarTime.fromYmdHms(
    reference.year, reference.month, reference.day,
    reference.hour, reference.minute, reference.second,
  );
}

function termUtcIso(term: SolarTerm): string {
  const p = term.getJulianDay().getSolarTime();
  return new Date(Date.UTC(
    p.getYear(), p.getMonth() - 1, p.getDay(), p.getHour() - 8, p.getMinute(), p.getSecond(),
  )).toISOString();
}

function solarTermMonthWindowFromReference(reference: FlyingTermReference): ZibaiSolarTermMonthWindow {
  const currentTerm = solarTimeFromReference(reference).getTerm();
  const startTerm = currentTerm.isJie() ? currentTerm : currentTerm.next(-1);
  const endTerm = startTerm.next(2);
  const startTermCode = SOLAR_SECTION_CODES[(startTerm.getIndex() - 1) / 2];
  const endTermCode = SOLAR_SECTION_CODES[(endTerm.getIndex() - 1) / 2];
  if (!startTermCode || !endTermCode) throw new Error("zibai_solar_boundary_unavailable");
  return Object.freeze({
    startAt: termUtcIso(startTerm), endAt: termUtcIso(endTerm), startTermCode, endTermCode,
  });
}

/** Exact global 節-to-節 month window; independent of longitude and DST. */
export function solarTermMonthWindow(at: Date): ZibaiSolarTermMonthWindow {
  return solarTermMonthWindowFromReference(globalTermReferenceAt(at));
}

function daysInYear(year: number): number {
  return new Date(Date.UTC(year + 1, 0, 1)).getTime() - new Date(Date.UTC(year, 0, 1)).getTime() === 366 * 86_400_000 ? 366 : 365;
}

/** NOAA fractional-year approximation. Error is well below the one-minute product bound. */
export function equationOfTimeMinutes(at: Date): number {
  validInstant(at);
  const start = Date.UTC(at.getUTCFullYear(), 0, 1);
  const day = Math.floor((at.getTime() - start) / 86_400_000) + 1;
  const fractionalHour = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  const gamma = 2 * Math.PI / daysInYear(at.getUTCFullYear()) * (day - 1 + (fractionalHour - 12) / 24);
  return 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
}

function validLongitude(longitude: number): number {
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new TypeError("zibai_invalid_longitude");
  return longitude;
}

/** A Date whose UTC fields are the local true-apparent-solar wall fields. */
export function apparentSolarInstant(at: Date, longitude: number): Date {
  const lon = validLongitude(longitude);
  const offsetMs = (lon * 4 + equationOfTimeMinutes(at)) * 60_000;
  return new Date(at.getTime() + offsetMs);
}

export function apparentSolarParts(at: Date, longitude: number): ApparentSolarParts {
  const solar = apparentSolarInstant(at, longitude);
  return Object.freeze({
    year: solar.getUTCFullYear(), month: solar.getUTCMonth() + 1, day: solar.getUTCDate(),
    hour: solar.getUTCHours(), minute: solar.getUTCMinutes(), second: solar.getUTCSeconds(),
  });
}

function dateKeyFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function solarDayKey(at: Date, longitude: number): string {
  const solar = apparentSolarInstant(at, longitude);
  const effective = solar.getUTCHours() >= 23 ? solar.getTime() + 86_400_000 : solar.getTime();
  return dateKeyFromMs(effective);
}

function solveUtcForApparentMs(targetApparentMs: number, longitude: number): Date {
  validLongitude(longitude);
  let guess = targetApparentMs - longitude * 4 * 60_000;
  for (let i = 0; i < 8; i += 1) {
    const projected = apparentSolarInstant(new Date(guess), longitude).getTime();
    guess += targetApparentMs - projected;
  }
  const result = new Date(Math.round(guess));
  if (!Number.isFinite(result.getTime())) throw new Error("zibai_solar_boundary_unavailable");
  return result;
}

function currentShichenIndex(solarHour: number): number {
  return Math.floor((solarHour + 1) / 2) % 12;
}

function shichenStartApparentMs(solar: Date): number {
  const hour = solar.getUTCHours();
  if (hour === 0) return Date.UTC(solar.getUTCFullYear(), solar.getUTCMonth(), solar.getUTCDate() - 1, 23);
  const boundaryHour = hour % 2 === 0 ? hour - 1 : hour;
  return Date.UTC(solar.getUTCFullYear(), solar.getUTCMonth(), solar.getUTCDate(), boundaryHour);
}

export function shichenAt(at: Date, longitude: number): Readonly<{ key: ZibaiShichenKey; start: Date; end: Date }> {
  const solar = apparentSolarInstant(at, longitude);
  const key = SHICHEN[currentShichenIndex(solar.getUTCHours())];
  const startTarget = shichenStartApparentMs(solar);
  return Object.freeze({
    key,
    start: solveUtcForApparentMs(startTarget, longitude),
    end: solveUtcForApparentMs(startTarget + 2 * 3_600_000, longitude),
  });
}

export function nextShichenBoundary(at: Date, longitude: number): Date {
  const current = shichenAt(at, longitude);
  if (current.end.getTime() <= at.getTime()) throw new Error("zibai_solar_boundary_unavailable");
  return current.end;
}

export function solarDayWindow(at: Date, longitude: number): Readonly<{ start: Date; end: Date }> {
  const solar = apparentSolarInstant(at, longitude);
  const effectiveDay = solar.getUTCHours() >= 23
    ? Date.UTC(solar.getUTCFullYear(), solar.getUTCMonth(), solar.getUTCDate() + 1)
    : Date.UTC(solar.getUTCFullYear(), solar.getUTCMonth(), solar.getUTCDate());
  const startTarget = effectiveDay - 3_600_000; // 23:00 apparent solar on the preceding civil date
  return Object.freeze({
    start: solveUtcForApparentMs(startTarget, longitude),
    end: solveUtcForApparentMs(startTarget + 24 * 3_600_000, longitude),
  });
}

function exactPermutation(map: PalaceStars): Readonly<PalaceStars> {
  const values = DIRECTIONS.map((direction) => map[direction]);
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 9)
    || new Set(values).size !== 9) throw new Error("zibai_invalid_star_permutation");
  return Object.freeze({ ...map });
}

function directionOf(map: PalaceStars, star: number): Dir9 {
  const found = DIRECTIONS.find((direction) => map[direction] === star);
  if (!found) throw new Error("zibai_focus_star_missing");
  return found;
}

export function starPalaceRelation(star: number, direction: Dir9): ZibaiRelation {
  return ruleRuntime.starPalaceRelation(star, direction);
}

export function buildZibaiSnapshot(at: Date, longitude: number): ZibaiSnapshot {
  const p = apparentSolarParts(at, longitude);
  const termReference = globalTermReferenceAt(at);
  const monthWindow = solarTermMonthWindowFromReference(termReference);
  const layer = computeFlyingLayers(
    p.year, p.month, p.day, p.hour, p.minute, p.second, "zaoming", undefined,
    termReference,
  );
  const monthPalaces = exactPermutation(layer.month_stars.palaces);
  const dayPalaces = exactPermutation(layer.day_stars.palaces);
  const shichenPalaces = exactPermutation(layer.hour_stars.palaces);
  const dayWindow = solarDayWindow(at, longitude);
  const shichen = shichenAt(at, longitude);
  const apparentSolarDate = solarDayKey(at, longitude);
  const month = Object.freeze({
    palaces: monthPalaces,
    startAt: monthWindow.startAt,
    endAt: monthWindow.endAt,
    flight: layer.month_stars.direction,
    meta: Object.freeze({
      yearBranch: layer.month_stars.year_branch,
      monthBranch: layer.month_stars.month_branch,
      jieqiMonth: layer.month_stars.jieqi_month,
      startTermCode: monthWindow.startTermCode,
      endTermCode: monthWindow.endTermCode,
    }),
  });
  const day = Object.freeze({
    palaces: dayPalaces,
    startAt: dayWindow.start.toISOString(),
    endAt: dayWindow.end.toISOString(),
    flight: layer.day_stars.direction,
    meta: Object.freeze({ apparentSolarDate, dayPillar: layer.day_stars.day_pillar }),
  });
  const shichenLayer = Object.freeze({
    palaces: shichenPalaces,
    startAt: shichen.start.toISOString(),
    endAt: shichen.end.toISOString(),
    flight: layer.hour_stars.direction,
    meta: Object.freeze({ key: shichen.key }),
  });
  const focus = Object.freeze(([1, 2, 5, 9] as const).map((star) => {
    const dayDirection = directionOf(dayPalaces as PalaceStars, star);
    const shichenDirection = directionOf(shichenPalaces as PalaceStars, star);
    return Object.freeze({
      star, element: STAR_ELEMENT[star], dayDirection,
      dayRelation: starPalaceRelation(star, dayDirection), shichenDirection,
      shichenRelation: starPalaceRelation(star, shichenDirection), overlaps: dayDirection === shichenDirection,
    });
  }));
  return Object.freeze({
    snapshotSchema: 2,
    calculationVersion: ZIBAI_CALCULATION_VERSION,
    interpretationVersion: ZIBAI_INTERPRETATION_VERSION,
    month,
    day,
    shichen: shichenLayer,
    apparentSolarDate, shichenKey: shichen.key,
    startAt: shichenLayer.startAt, endAt: shichenLayer.endAt,
    monthPalaces, dayPalaces, shichenPalaces, focus, dayPillar: layer.day_stars.day_pillar,
    dayFlight: layer.day_stars.direction, shichenFlight: layer.hour_stars.direction,
  });
}
