import { createHash } from "node:crypto";
import payloadRuntime from "./notification-payload.cjs";

/**
 * R8 astronomy FCM adapter — provider submission only, never delivery proof.
 *
 * Deliberately isolated from the legacy senders: no environment reads, no
 * credential loading, no hidden retry or auth refresh, one injected transport
 * call per prepared attempt. Unknown or ambiguous provider results are final
 * for the attempt (possibly accepted — resending risks duplicates), so they
 * are never retryable here; only an authoritative rejection may schedule a
 * retry, and never past the occurrence's original expiry.
 */

const ASTRONOMY_CHANNEL_ID = "hourkey-astronomy-facts-v1";
const ASTRONOMY_CATEGORY_ID = "hourkey_astronomy_fact";
const PREPARATION_FRESHNESS_MS = 5_000;
const TRANSPORT_ALLOWANCE_MS = 10_000;
const MINIMUM_RETRY_DELAY_MS = 60_000;
const MAX_ANDROID_TTL_SECONDS = 2_419_200; // FCM Android caps ttl at 4 weeks.
const MAX_CLASSIFIED_BODY_BYTES = 16_384;
const PROJECT_ID_RE = /^[a-z][a-z0-9-]{3,29}$/u;

// Fixed privacy copy: same strings the installed app ships in
// src/i18n/scienceNotificationsR8.ts. No personal data on the lockscreen and
// no prediction wording — astronomy facts only.
const FIXED_COPY: Readonly<Record<string, Readonly<{ title: string; body: string }>>> = Object.freeze({
  th: Object.freeze({ title: "ตำแหน่งดาวบนท้องฟ้าทุก 2 ชั่วโมง", body: "ข้อมูลท้องฟ้า ไม่ใช่คำพยากรณ์ ไม่จัดอันดับดี–ร้าย" }),
  en: Object.freeze({ title: "Sky positions every two hours", body: "Sky information, not a prediction or a good/bad ranking." }),
  zh: Object.freeze({ title: "每兩小時天體位置", body: "這是天象資料，不是預測，也不作吉凶排名。" }),
  cn: Object.freeze({ title: "每两小时天体位置", body: "这是天象信息，不是预测，也不作吉凶排名。" }),
  vi: Object.freeze({ title: "Vị trí thiên thể mỗi hai giờ", body: "Đây là dữ liệu bầu trời, không phải dự đoán hay xếp hạng tốt–xấu." }),
  ja: Object.freeze({ title: "2時間ごとの天体位置", body: "天文情報であり、予測や吉凶評価ではありません。" }),
  ru: Object.freeze({ title: "Положения светил каждые два часа", body: "Это сведения о небе, а не прогноз и не оценка добра или зла." }),
  ko: Object.freeze({ title: "2시간마다 보는 천체 위치", body: "하늘 정보이며 예측이나 길흉 순위가 아닙니다." }),
  es: Object.freeze({ title: "Posiciones celestes cada dos horas", body: "Es información del cielo, no una predicción ni una clasificación favorable/desfavorable." }),
});

const HTTP_STATUS_NAMES: Readonly<Record<number, string>> = Object.freeze({
  400: "INVALID_ARGUMENT",
  401: "UNAUTHENTICATED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  429: "RESOURCE_EXHAUSTED",
  503: "UNAVAILABLE",
});
const FCM_ERROR_DETAIL_TYPE = "type.googleapis.com/google.firebase.fcm.v1.FcmError";

export type AstronomyFcmPrepareInput = Readonly<{
  projectId: string;
  locale: string;
  payload: unknown;
  expectedAudience: string;
  scheduledFor: number;
  preparedAt: number;
  expiresAt: number;
}>;

export type AstronomyFcmPrepared = Readonly<{
  lane: "astronomy_fact:civil_two_hour:v1";
  projectId: string;
  locale: string;
  scheduledFor: number;
  preparedAt: number;
  expiresAt: number;
  payloadDigest: string;
  message: Readonly<{
    notification: Readonly<{ title: string; body: string }>;
    android: Readonly<{ ttl: string; notification: Readonly<{ channel_id: string }> }>;
    data: Readonly<{ categoryId: string; body: string }>;
  }>;
}>;

export type AstronomyFcmOutcome = Readonly<{
  outcome: "accepted" | "not_accepted" | "unknown";
  retryable: boolean;
  retryNotBefore: number | null;
  tokenDisposition: "unchanged" | "unregistered";
  providerMessageName: string | null;
}>;

export type AstronomyFcmTransportRequest = Readonly<{
  projectId: string;
  deadlineAt: number;
  body: string;
}>;

export type AstronomyFcmTransportResponse = Readonly<{
  status: number;
  body: string;
  retryAfter?: string;
}>;

// Prepared attempts are authenticated by identity, not by shape: only objects
// created by prepareAstronomyFcmR8 in this process may be submitted, once.
const authenticPrepared = new WeakSet<object>();
const submittedPrepared = new WeakSet<object>();

function fail(code: string): never {
  throw new Error(`r8_fcm_${code}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function frozenOutcome(partial: Partial<AstronomyFcmOutcome> & Pick<AstronomyFcmOutcome, "outcome">): AstronomyFcmOutcome {
  return Object.freeze({
    retryable: false,
    retryNotBefore: null,
    tokenDisposition: "unchanged",
    providerMessageName: null,
    ...partial,
  });
}

function unknownOutcome(): AstronomyFcmOutcome {
  return frozenOutcome({ outcome: "unknown" });
}

export function prepareAstronomyFcmR8(input: AstronomyFcmPrepareInput): AstronomyFcmPrepared {
  if (!input || typeof input !== "object") fail("input_invalid");
  const { projectId, locale, expectedAudience, scheduledFor, preparedAt, expiresAt } = input;
  if (typeof projectId !== "string" || !PROJECT_ID_RE.test(projectId)) fail("project_invalid");
  if (typeof locale !== "string" || !Object.prototype.hasOwnProperty.call(FIXED_COPY, locale)) fail("locale_unsupported");
  if (!Number.isSafeInteger(scheduledFor) || !Number.isSafeInteger(preparedAt) || !Number.isSafeInteger(expiresAt)) fail("times_invalid");
  if (preparedAt < scheduledFor) fail("prepared_before_schedule");
  const payload = payloadRuntime.parseR8ScienceProviderPayload(input.payload, expectedAudience);
  if (!payload) fail("payload_invalid");

  // TTL comes from the occurrence's original deadline, never now+2h. The
  // preparation freshness and transport windows are subtracted so the provider
  // cannot be asked to display past the original expiry.
  const budgetMs = expiresAt - preparedAt - PREPARATION_FRESHNESS_MS - TRANSPORT_ALLOWANCE_MS;
  const ttlSeconds = Math.floor(budgetMs / 1_000);
  if (ttlSeconds <= 0) fail("ttl_exhausted");
  if (ttlSeconds > MAX_ANDROID_TTL_SECONDS) fail("ttl_too_long");

  const copy = FIXED_COPY[locale];
  const message = {
    notification: { title: copy.title, body: copy.body },
    android: { ttl: `${ttlSeconds}s`, notification: { channel_id: ASTRONOMY_CHANNEL_ID } },
    data: { categoryId: ASTRONOMY_CATEGORY_ID, body: JSON.stringify(payload) },
  };
  const payloadDigest = createHash("sha256")
    .update(JSON.stringify({ lane: "astronomy_fact:civil_two_hour:v1", projectId, locale, scheduledFor, preparedAt, expiresAt, message }))
    .digest("hex");
  const prepared = deepFreeze({
    lane: "astronomy_fact:civil_two_hour:v1" as const,
    projectId, locale, scheduledFor, preparedAt, expiresAt, payloadDigest, message,
  });
  authenticPrepared.add(prepared);
  return prepared;
}

function parseRetryAfterDelay(retryAfter: unknown, now: number): number | null {
  if (typeof retryAfter === "number") {
    return Number.isSafeInteger(retryAfter) && retryAfter >= 0 ? retryAfter * 1_000 : null;
  }
  if (typeof retryAfter !== "string") return null;
  if (/^\d{1,9}$/u.test(retryAfter)) return Number(retryAfter) * 1_000;
  const asDate = Date.parse(retryAfter);
  if (!Number.isFinite(asDate)) return null;
  // A parseable date in the past is an explicit "retry now" — the 60s floor
  // below still applies, so it can never produce an early retry.
  return Math.max(0, asDate - now);
}

/**
 * Capture a plain data-only copy of the transport response without invoking
 * accessors, so a hostile or broken transport cannot throw past the submit
 * boundary (the attempt is already spent) or smuggle text into an exception.
 */
function sanitizeTransportResponse(value: unknown): AstronomyFcmTransportResponse | null {
  if (!value || typeof value !== "object") return null;
  const captured: Record<string, unknown> = {};
  try {
    for (const key of ["status", "body", "retryAfter"]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined) continue;
      if (!("value" in descriptor)) return null;
      captured[key] = descriptor.value;
    }
  } catch {
    return null;
  }
  if (!Number.isSafeInteger(captured.status) || typeof captured.body !== "string") return null;
  return captured.retryAfter === undefined
    ? { status: captured.status as number, body: captured.body }
    : { status: captured.status as number, body: captured.body, retryAfter: captured.retryAfter as string };
}

function readFcmErrorCode(error: Record<string, unknown>): string | null {
  const details = error.details;
  if (!Array.isArray(details)) return null;
  for (const item of details) {
    if (item && typeof item === "object" && (item as Record<string, unknown>)["@type"] === FCM_ERROR_DETAIL_TYPE) {
      const code = (item as Record<string, unknown>).errorCode;
      return typeof code === "string" ? code : null;
    }
  }
  return null;
}

export function classifyAstronomyFcmR8(
  response: AstronomyFcmTransportResponse,
  projectId: string,
  now: number,
  expiresAt: number,
): AstronomyFcmOutcome {
  if (!response || typeof response !== "object") return unknownOutcome();
  const { status, body } = response;
  if (!Number.isSafeInteger(status) || typeof body !== "string") return unknownOutcome();
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(expiresAt)) return unknownOutcome();
  if (typeof projectId !== "string" || !PROJECT_ID_RE.test(projectId)) return unknownOutcome();
  if (Buffer.byteLength(body, "utf8") > MAX_CLASSIFIED_BODY_BYTES) return unknownOutcome();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return unknownOutcome();
  }
  if (!parsed || typeof parsed !== "object") return unknownOutcome();
  const record = parsed as Record<string, unknown>;

  if (status === 200) {
    // Acceptance means the provider queued the message — nothing more. It is
    // never evidence the phone displayed anything, so no `delivered` field
    // exists on any outcome of this classifier.
    const name = record.name;
    if ("error" in record || typeof name !== "string") return unknownOutcome();
    const expectedPrefix = `projects/${projectId}/messages/`;
    if (!name.startsWith(expectedPrefix) || name.length <= expectedPrefix.length || name.length > 256) return unknownOutcome();
    return frozenOutcome({ outcome: "accepted", providerMessageName: name });
  }

  const canonicalName = HTTP_STATUS_NAMES[status];
  if (!canonicalName) return unknownOutcome();
  const error = record.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return unknownOutcome();
  const errorRecord = error as Record<string, unknown>;
  if (errorRecord.code !== status || errorRecord.status !== canonicalName) return unknownOutcome();
  const fcmErrorCode = readFcmErrorCode(errorRecord);

  if (status === 404) {
    // Registration is only dropped on the structured UNREGISTERED signal.
    // A bare 404 or a substring match is not authoritative token evidence.
    if (fcmErrorCode !== "UNREGISTERED") return unknownOutcome();
    return frozenOutcome({ outcome: "not_accepted", tokenDisposition: "unregistered" });
  }
  if (status === 400 || status === 401 || status === 403) {
    return frozenOutcome({ outcome: "not_accepted" });
  }

  // 429 / 503: authoritative rejection, the only retryable class. Delay honors
  // Retry-After with a 60s floor; an unparseable Retry-After never produces an
  // earlier retry than the header intended, so it disables the retry instead.
  let delayMs = MINIMUM_RETRY_DELAY_MS;
  if (response.retryAfter !== undefined) {
    const parsedDelay = parseRetryAfterDelay(response.retryAfter, now);
    if (parsedDelay === null) return frozenOutcome({ outcome: "not_accepted" });
    delayMs = Math.max(MINIMUM_RETRY_DELAY_MS, parsedDelay);
  }
  const retryNotBefore = now + delayMs;
  if (retryNotBefore >= expiresAt) return frozenOutcome({ outcome: "not_accepted" });
  return frozenOutcome({ outcome: "not_accepted", retryable: true, retryNotBefore });
}

export async function submitAstronomyFcmR8Once(
  prepared: AstronomyFcmPrepared,
  deviceToken: string,
  clock: () => number,
  transport: (request: AstronomyFcmTransportRequest) => Promise<AstronomyFcmTransportResponse>,
): Promise<AstronomyFcmOutcome> {
  if (!prepared || typeof prepared !== "object" || !authenticPrepared.has(prepared)) fail("prepared_invalid");
  if (submittedPrepared.has(prepared)) fail("prepared_reused");
  if (typeof deviceToken !== "string" || deviceToken === "") fail("token_invalid");
  if (typeof transport !== "function" || typeof clock !== "function") fail("transport_invalid");
  const at = clock();
  if (!Number.isSafeInteger(at)) fail("clock_invalid");
  if (at < prepared.preparedAt) fail("clock_before_preparation");
  if (at > prepared.preparedAt + PREPARATION_FRESHNESS_MS) fail("preparation_stale");
  if (at >= prepared.expiresAt) fail("occurrence_expired");

  // Marked before the call: after the transport is invoked the provider may
  // have the message no matter what we hear back, so this attempt is spent.
  submittedPrepared.add(prepared);
  const request: AstronomyFcmTransportRequest = Object.freeze({
    projectId: prepared.projectId,
    deadlineAt: at + TRANSPORT_ALLOWANCE_MS,
    body: JSON.stringify({
      validate_only: false,
      message: {
        token: deviceToken,
        notification: prepared.message.notification,
        android: prepared.message.android,
        data: prepared.message.data,
      },
    }),
  });
  let response: AstronomyFcmTransportResponse | null;
  try {
    response = sanitizeTransportResponse(await transport(request));
  } catch {
    // Transport failure text may contain provider internals or identifiers —
    // it is dropped entirely; the attempt is unknown and never resent.
    return unknownOutcome();
  }
  if (response === null) return unknownOutcome();
  // Retry timing is anchored to when the response actually settled, not the
  // pre-transport clock — a slow transport must not shrink the backoff.
  let settledAt = at;
  try {
    const observed = clock();
    if (Number.isSafeInteger(observed) && observed >= at) settledAt = observed;
  } catch {
    // Keep the pre-transport anchor; classification below stays conservative.
  }
  return classifyAstronomyFcmR8(response, prepared.projectId, settledAt, prepared.expiresAt);
}
