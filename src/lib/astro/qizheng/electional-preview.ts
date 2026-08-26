import { zoneOffsetMinutes } from "../../birth-timezone";
import { computeAstro } from "../../tianxing/ephemeris";
import { shuAt } from "../../tianxing/xiu28";
import {
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
  QIZHENG_ELECTIONAL_SOURCE_DIGEST,
  QIZHENG_ELECTIONAL_SOURCE_VERSION,
  type QizhengElectionalSourceArtifact,
} from "./electional-source-manifest";

export { QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS, QIZHENG_ELECTIONAL_SOURCE_DIGEST, QIZHENG_ELECTIONAL_SOURCE_VERSION };
export const QIZHENG_ELECTIONAL_CALCULATION_VERSION = "qizheng-electional-preview-v1" as const;

export type QizhengPreviewActivity = "directional_repair" | "earthwork";

export type QizhengElectionalPreviewInput = Readonly<{
  candidateInstant: Date;
  candidateTimezone: string;
  candidateLocation: Readonly<{ lat: number; lng: number }>;
  activity: QizhengPreviewActivity;
  directionDeg: number;
  sourceEvidenceVersion: typeof QIZHENG_ELECTIONAL_SOURCE_VERSION;
}>;

type SkyPoint = Readonly<{
  key: string;
  kind: "physical_body" | "calculated_point";
  longitudeTropicalDeg: number;
  retrograde: boolean;
  mansion: string;
  mansionDeg: number;
  altitudeDeg?: number;
  azimuthDeg?: number;
}>;

export type QizhengElectionalPreview = Readonly<{
  discipline: "qizheng";
  mode: "electional-preview";
  capability: "preview_only";
  schema: 1;
  calculationVersion: typeof QIZHENG_ELECTIONAL_CALCULATION_VERSION;
  scope: "candidate_local_sky";
  personalization: "none_profile_access_control_only";
  candidate: Readonly<{
    instant: string;
    timezone: string;
    localDateTime: string;
    locationApplied: true;
    activity: QizhengPreviewActivity;
    directionDeg: number;
  }>;
  astronomy: Readonly<{
    modelVersion: "astronomy-engine-modern-sky-v1";
    mansionModel: "ecliptic-of-date-determinative-stars-preview-v1";
    ascendantTropicalDeg: number;
    ascendantMansion: string;
    ascendantMansionDeg: number;
    sevenPhysicalBodies: readonly SkyPoint[];
    calculatedPoints: readonly SkyPoint[];
  }>;
  sourceCoverage: Readonly<{
    sourceEvidenceVersion: typeof QIZHENG_ELECTIONAL_SOURCE_VERSION;
    sourceDigest: typeof QIZHENG_ELECTIONAL_SOURCE_DIGEST;
    status: "incomplete";
    presentVolumes: readonly [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    missingVolumes: readonly [];
    rulesTranscribed: false;
    artifacts: readonly QizhengElectionalSourceArtifact[];
    references: readonly Readonly<{ volume: 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16; pdfSha256: string; pages: string }>[];
  }>;
  decisionSupported: false;
  verdict: null;
  ranking: readonly never[];
  notificationEligible: false;
  missingEvidence: readonly string[];
}>;

const ACTIVITIES = new Set<QizhengPreviewActivity>(["directional_repair", "earthwork"]);

function localDateTime(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const p = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

function validate(input: QizhengElectionalPreviewInput): void {
  if (!(input.candidateInstant instanceof Date) || !Number.isFinite(input.candidateInstant.getTime())) {
    throw new TypeError("qizheng_preview_invalid_instant");
  }
  const timezone = String(input.candidateTimezone || "").trim();
  if (!timezone || (timezone !== "UTC" && !timezone.includes("/"))
    || zoneOffsetMinutes(input.candidateInstant.getTime(), timezone) === null) {
    throw new TypeError("qizheng_preview_invalid_timezone");
  }
  if (!Number.isFinite(input.candidateLocation?.lat) || input.candidateLocation.lat < -90 || input.candidateLocation.lat > 90
    || !Number.isFinite(input.candidateLocation?.lng) || input.candidateLocation.lng < -180 || input.candidateLocation.lng > 180) {
    throw new TypeError("qizheng_preview_invalid_location");
  }
  if (!ACTIVITIES.has(input.activity)) throw new TypeError("qizheng_preview_unsupported_activity");
  if (!Number.isFinite(input.directionDeg) || input.directionDeg < 0 || input.directionDeg >= 360) {
    throw new TypeError("qizheng_preview_invalid_direction");
  }
  if (input.sourceEvidenceVersion !== QIZHENG_ELECTIONAL_SOURCE_VERSION) {
    throw new TypeError("qizheng_preview_invalid_source_version");
  }
}

export function buildQizhengElectionalPreview(input: QizhengElectionalPreviewInput): QizhengElectionalPreview {
  validate(input);
  const sky = computeAstro(input.candidateInstant, input.candidateLocation.lat, input.candidateLocation.lng);
  const point = (star: (typeof sky.stars)[number], kind: SkyPoint["kind"]): SkyPoint => {
    const mansion = shuAt(star.lonTrop, input.candidateInstant);
    return Object.freeze({
      key: star.key,
      kind,
      longitudeTropicalDeg: +star.lonTrop.toFixed(6),
      retrograde: star.retro,
      mansion: mansion.zh,
      mansionDeg: mansion.deg,
      ...(star.altDeg === undefined ? {} : { altitudeDeg: star.altDeg }),
      ...(star.azDeg === undefined ? {} : { azimuthDeg: star.azDeg }),
    });
  };
  const physicalKeys = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
  const sevenPhysicalBodies = sky.stars.filter((star) => physicalKeys.has(star.key)).map((star) => point(star, "physical_body"));
  const calculatedPoints = sky.stars.filter((star) => !physicalKeys.has(star.key)).map((star) => point(star, "calculated_point"));
  const ascendantMansion = shuAt(sky.ascendant, input.candidateInstant);

  return Object.freeze({
    discipline: "qizheng",
    mode: "electional-preview",
    capability: "preview_only",
    schema: 1,
    calculationVersion: QIZHENG_ELECTIONAL_CALCULATION_VERSION,
    scope: "candidate_local_sky",
    personalization: "none_profile_access_control_only",
    candidate: Object.freeze({
      instant: input.candidateInstant.toISOString(),
      timezone: input.candidateTimezone,
      localDateTime: localDateTime(input.candidateInstant, input.candidateTimezone),
      locationApplied: true,
      activity: input.activity,
      directionDeg: input.directionDeg,
    }),
    astronomy: Object.freeze({
      modelVersion: "astronomy-engine-modern-sky-v1",
      mansionModel: "ecliptic-of-date-determinative-stars-preview-v1",
      ascendantTropicalDeg: +sky.ascendant.toFixed(6),
      ascendantMansion: ascendantMansion.zh,
      ascendantMansionDeg: ascendantMansion.deg,
      sevenPhysicalBodies: Object.freeze(sevenPhysicalBodies),
      calculatedPoints: Object.freeze(calculatedPoints),
    }),
    sourceCoverage: Object.freeze({
      sourceEvidenceVersion: QIZHENG_ELECTIONAL_SOURCE_VERSION,
      sourceDigest: QIZHENG_ELECTIONAL_SOURCE_DIGEST,
      status: "incomplete",
      presentVolumes: Object.freeze([7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const),
      missingVolumes: Object.freeze([] as const),
      rulesTranscribed: false,
      artifacts: QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
      references: Object.freeze([
        Object.freeze({ volume: 7 as const, pdfSha256: "f990dc239cac11883b3dcf8544ec9dfdfed0d0285fc04d8b824ef4d3f9a29d03", pages: "13-20" }),
        Object.freeze({ volume: 8 as const, pdfSha256: "f856b2057996d7d9c3d4d63475df94cbafe161703e8960a0b806ba873e77cdf5", pages: "7-12,40,72,90-92" }),
        Object.freeze({ volume: 9 as const, pdfSha256: "be17cbb1263c6bb6f0f4d3dbb7aaf432b89c9c149bf1c8e4f70ff29a2bfab0c3", pages: "7-8,126-160,181-183" }),
        Object.freeze({ volume: 10 as const, pdfSha256: "df6a2ac390baf57ab409bfbd4ee89617b26fd1565cca06df0ca9c4f85a73c1d4", pages: "5-13,46-92" }),
        Object.freeze({ volume: 11 as const, pdfSha256: "bb2558763ccc44a8bdc9b30a3d0f4f2eafd5196699562bfafd63ac6a37475fec", pages: "3-90" }),
        Object.freeze({ volume: 12 as const, pdfSha256: "c95ed759c87004d3b8fa4c80fd7a9957b9debd737573e6f2f17ba61b89ac0388", pages: "15,18-19,35-36,93-94" }),
        Object.freeze({ volume: 13 as const, pdfSha256: "4f5c703065998ec11e83497f64653f737c235de4ea46b531c65cef574cc0906a", pages: "8-13,24-30" }),
        Object.freeze({ volume: 14 as const, pdfSha256: "2a123251bb7e15fb894e811ae438f86a9a77465db5b36be1aac87753d72254cd", pages: "3-10,49,51-52,69-70" }),
        Object.freeze({ volume: 15 as const, pdfSha256: "0d5f085fe66c962b27db76481c8bac76b23cddb12521453645ea9dd375c61d93", pages: "7-12,35,55,69,75,80" }),
        Object.freeze({ volume: 16 as const, pdfSha256: "bf63dc5d3483ee59cbf4dcec24f45a666757d15bad16a26ffce0dfb181fcb3d9", pages: "3,8-12,19-20,54-55,83-85" }),
      ]),
    }),
    decisionSupported: false,
    verdict: null,
    ranking: Object.freeze([]),
    notificationEligible: false,
    missingEvidence: Object.freeze([
      "double_verified_rule_transcription",
      "rule_precedence_truth_table",
      "three_reproducible_goldens",
      "historical_epoch_and_mansion_calibration",
      "modern_time_location_astronomy_contract",
      "activity_and_household_natal_input_contract",
      "calculated_points_not_source_validated_for_verdict",
      "source_attested_hourly_electional_verdict",
    ]),
  });
}
