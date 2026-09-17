import { findMountain24, isNearMountainBoundary, normalizeDeg, signedAngleDelta } from "@/lib/luopan/mountains";

export type NorthReference = "magnetic" | "true" | "manual" | "map_true";

export type LuopanMeasurementInput = {
  headingDeg: number;
  northReference: NorthReference;
  method: "sensor" | "manual" | "map";
  accuracyClass?: number | null;
  accuracyDeg?: number | null;
  sampleCount?: number | null;
  circularStdDeg?: number | null;
  repeatSpreadDeg?: number | null;
  maxTiltDeg?: number | null;
};

export type MeasurementGate = {
  pass: boolean;
  reasons: string[];
  headingDeg: number;
  facingMountain: ReturnType<typeof findMountain24>;
  sittingMountain: ReturnType<typeof findMountain24>;
  boundaryDistanceDeg: number;
  uncertaintyDeg: number;
  nearBoundary: boolean;
  boundary_warning: boolean;
};

function finite(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function distanceToMountainBoundary(deg: number): number {
  const heading = normalizeDeg(deg);
  const mountain = findMountain24(heading);
  return Math.min(
    Math.abs(signedAngleDelta(heading, mountain.startDeg)),
    Math.abs(signedAngleDelta(heading, mountain.endDeg))
  );
}

export const SENSOR_MAX_TILT_DEG = 25;
export const SENSOR_MAX_CIRCULAR_STD_DEG = 6;
export const SENSOR_MAX_REPEAT_SPREAD_DEG = 6;

export function evaluateMobileLuopanMeasurement(input: LuopanMeasurementInput): MeasurementGate {
  const headingDeg = normalizeDeg(finite(input.headingDeg, 0));
  const accuracyDeg = Math.max(0, finite(input.accuracyDeg, 0));
  const circularStdDeg = Math.max(0, finite(input.circularStdDeg, 999));
  const repeatSpreadDeg = Math.max(0, finite(input.repeatSpreadDeg, 999));
  const maxTiltDeg = Math.max(0, finite(input.maxTiltDeg, 999));
  const sampleCount = Math.max(0, Math.trunc(finite(input.sampleCount, 0)));
  const accuracyClass = Math.trunc(finite(input.accuracyClass, 0));
  const uncertaintyDeg = input.method === "sensor"
    ? Math.max(1, accuracyDeg || circularStdDeg || 1)
    : Math.max(1, accuracyDeg || 1);
  const boundaryDistanceDeg = distanceToMountainBoundary(headingDeg);
  const nearBoundary = isNearMountainBoundary(headingDeg, uncertaintyDeg);
  const reasons: string[] = [];

  // 18 ก.ย. 2569: ผ่อนด่านเซนเซอร์ให้เข็มทิศมือถือจริงผ่านได้ (ก่อนหน้า 10°/3°/3° → เจ้านายวัด 10/10 ตก
  // ทุกครั้งด้วยเหตุ phone_not_level) · ยังคงต้องราบพอ (≤25°) นิ่งพอ (≤6°) และ 3 รอบตรงกัน (≤6°)
  if (input.method === "sensor") {
    if (sampleCount < 20) reasons.push("insufficient_samples");
    if (accuracyClass <= 0 && accuracyDeg <= 0) reasons.push("heading_accuracy_unavailable");
    if (circularStdDeg > SENSOR_MAX_CIRCULAR_STD_DEG) reasons.push("heading_not_stable");
    if (repeatSpreadDeg > SENSOR_MAX_REPEAT_SPREAD_DEG) reasons.push("repeat_readings_disagree");
    if (maxTiltDeg > SENSOR_MAX_TILT_DEG) reasons.push("phone_not_level");
  }
  if (input.northReference === "true" && accuracyClass <= 0 && accuracyDeg <= 0) {
    reasons.push("true_north_unavailable");
  }
  // คาบเส้นภูเขา (ทุกวิธีวัด ตั้งแต่ 18 ก.ย. 2569): เตือน ไม่ตก — ผังออกได้ พร้อมธง boundary_warning/nearBoundary
  // ให้หน้าแสดงคำเตือน "ทิศคาบเส้น 2 ภูเขา" · ก่อนหน้า sensor ตกทันที ทำให้เข็มจริงใช้ไม่ได้บ่อย
  const boundaryWarning = nearBoundary;

  return {
    pass: reasons.length === 0,
    reasons,
    headingDeg,
    facingMountain: findMountain24(headingDeg),
    sittingMountain: findMountain24(normalizeDeg(headingDeg + 180)),
    boundaryDistanceDeg,
    uncertaintyDeg,
    nearBoundary,
    boundary_warning: boundaryWarning,
  };
}
