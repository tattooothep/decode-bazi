import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  prepareAstronomyFcmR8, classifyAstronomyFcmR8, submitAstronomyFcmR8Once,
} from "../src/lib/mobile-astronomy-fcm-r8";

// Injected transport only. No credentials, network, database or live devices.
const now = Date.parse("2026-09-06T12:00:00Z");
const projectId = "hourkey-fixture";
const audience = "a".repeat(32);
const payload = {
  v: 1, kind: "astronomy_fact", notificationId: "00000000-0000-4000-8000-000000000001",
  occurrenceId: "00000000-0000-4000-8000-000000000002", audience,
  mode: "civil_two_hour", url: "/astronomy-facts/detail",
};
const input = { projectId, locale: "th", payload, expectedAudience: audience,
  scheduledFor: now, expiresAt: now + 7_200_000, preparedAt: now };
const token = "fake-token-not-a-device";
let checks = 0;
function check(value: unknown, description: string) { assert.ok(value, description); checks += 1; }
function reject(fn: () => unknown) { assert.throws(fn, /r8_fcm_/); checks += 1; }
function response(status: number, statusName: string, code?: string, retryAfter?: string) {
  return { status, body: JSON.stringify({ error: { code: status, status: statusName,
    message: "not retained", ...(code ? { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: code }] } : {}),
  } }), retryAfter };
}
const acceptedResponse = { status: 200, body: JSON.stringify({ name: `projects/${projectId}/messages/0:123%abc` }) };
const prepared = prepareAstronomyFcmR8(input);
check(prepared.message.android.notification.channel_id === "hourkey-astronomy-facts-v1", "separate Android channel");
check(prepared.message.data.categoryId === "hourkey_astronomy_fact", "Expo category bridge");
assert.deepEqual(JSON.parse(prepared.message.data.body), payload); checks += 1;
check(Object.isFrozen(prepared) && Object.isFrozen(prepared.message.android.notification), "prepared request deeply frozen");
check(prepared.message.android.ttl === "7185s", "original deadline minus bounded preparation/transport allowance");
check(!JSON.stringify(prepared).includes(token) && /^[a-f0-9]{64}$/u.test(prepared.payloadDigest), "no target credentials in prepared digest object");
check(prepareAstronomyFcmR8(input).payloadDigest === prepared.payloadDigest, "deterministic preparation");
check(prepareAstronomyFcmR8({ ...input, locale: "en" }).payloadDigest !== prepared.payloadDigest, "copy bound to attempt digest");
for (const locale of ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]) {
  const p = prepareAstronomyFcmR8({ ...input, locale });
  check(p.message.notification.title.length > 5 && p.message.notification.body.length > 10, `explicit ${locale} fixed privacy copy`);
}
check(prepareAstronomyFcmR8({ ...input, locale: "zh" }).message.notification.body !== prepareAstronomyFcmR8({ ...input, locale: "cn" }).message.notification.body, "Traditional and Simplified Chinese distinct");
for (const patch of [
  { locale: "fr" }, { locale: "toString" }, { projectId: "../other" }, { expectedAudience: "b".repeat(32) },
  { preparedAt: now - 1 }, { expiresAt: now + 15_000 }, { expiresAt: Number.NaN },
  { payload: { ...payload, kind: "qizheng" } }, { payload: { ...payload, v: "1" } },
  { payload: { ...payload, accountId: "secret" } }, { payload: { ...payload, url: "/today" } },
]) reject(() => prepareAstronomyFcmR8({ ...input, ...patch }));
let getterCalled = false;
const getterPayload = { ...payload };
Object.defineProperty(getterPayload, "audience", { enumerable: true, get() { getterCalled = true; return audience; } });
reject(() => prepareAstronomyFcmR8({ ...input, payload: getterPayload }));
check(!getterCalled, "strict payload parser never executes getters");

const classify = (r: Parameters<typeof classifyAstronomyFcmR8>[0]) => classifyAstronomyFcmR8(r, projectId, now, input.expiresAt);
const accepted = classify(acceptedResponse);
check(accepted.outcome === "accepted" && !accepted.retryable && accepted.providerMessageName !== null, "provider acceptance only, not phone delivery");
check(!("delivered" in accepted), "classifier cannot claim device delivery");
const gone = classify(response(404, "NOT_FOUND", "UNREGISTERED"));
check(gone.outcome === "not_accepted" && gone.tokenDisposition === "unregistered" && !gone.retryable, "structured unregistered evidence");
for (const r of [response(400, "INVALID_ARGUMENT", "INVALID_ARGUMENT"), response(403, "PERMISSION_DENIED", "SENDER_ID_MISMATCH"), response(401, "UNAUTHENTICATED")]) {
  const out = classify(r);
  check(out.outcome === "not_accepted" && !out.retryable && out.tokenDisposition === "unchanged", "permanent rejection never blindly deletes registration");
}
for (const [r, delay] of [
  [response(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED"), 60_000],
  [response(503, "UNAVAILABLE", "UNAVAILABLE", "120"), 120_000],
  [response(503, "UNAVAILABLE", "UNAVAILABLE", new Date(now + 180_000).toUTCString()), 180_000],
] as const) {
  const out = classify(r);
  check(out.outcome === "not_accepted" && out.retryable && out.retryNotBefore === now + delay, "definite rejection respects minimum backoff and Retry-After");
}
check(!classifyAstronomyFcmR8(response(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED"), projectId, now, now + 60_000).retryable, "no retry at original expiry");
check(!classify(response(503, "UNAVAILABLE", "UNAVAILABLE", "nonsense")).retryable, "invalid Retry-After cannot cause an early retry");
for (const r of [
  { status: 200, body: "{}" }, { status: 200, body: "not-json" }, { status: 201, body: acceptedResponse.body },
  { status: 200, body: JSON.stringify({ name: "projects/another-project/messages/a" }) },
  { status: 200, body: JSON.stringify({ name: `projects/${projectId}/messages/a`, error: {} }) },
  response(500, "INTERNAL", "INTERNAL"), response(408, "DEADLINE_EXCEEDED"),
  { status: 404, body: "UNREGISTERED" }, response(404, "NOT_FOUND"), response(429, "UNAVAILABLE", "QUOTA_EXCEEDED"),
  { status: 503, body: "x".repeat(16_385) },
]) {
  const out = classify(r);
  check(out.outcome === "unknown" && !out.retryable && out.tokenDisposition === "unchanged", "ambiguous/mismatched results never permit a second submission");
}

let calls = 0;
const sent = await submitAstronomyFcmR8Once(prepared, token, () => now, async request => {
  calls += 1;
  const body = JSON.parse(request.body);
  check(body.message.token === token && body.validate_only === false, "exact single-device HTTP v1 envelope");
  check(request.projectId === projectId && request.deadlineAt === now + 10_000, "fixed route and bounded transport deadline");
  assert.deepEqual(body.message.data, prepared.message.data); checks += 1;
  return acceptedResponse;
});
check(calls === 1 && sent.outcome === "accepted", "exactly one injected transport call");
await assert.rejects(() => submitAstronomyFcmR8Once(prepared, token, () => now, async () => { calls += 1; return acceptedResponse; }), /r8_fcm_prepared_reused/); checks += 1;
check(calls === 1, "same prepared attempt cannot be submitted twice in-process");
for (const at of [now - 1, now + 5_001, input.expiresAt]) {
  await assert.rejects(() => submitAstronomyFcmR8Once(prepareAstronomyFcmR8(input), token, () => at, async () => { calls += 1; return acceptedResponse; }), /r8_fcm_/); checks += 1;
}
await assert.rejects(() => submitAstronomyFcmR8Once({ ...prepared }, token, () => now, async () => { calls += 1; return acceptedResponse; }), /r8_fcm_prepared_invalid/); checks += 1;
check(calls === 1, "stale, expired and forged preparation make no transport call");
const unknown = await submitAstronomyFcmR8Once(prepareAstronomyFcmR8(input), token, () => now, async () => { calls += 1; throw new Error("secret provider response"); });
check(unknown.outcome === "unknown" && !unknown.retryable && !JSON.stringify(unknown).includes("secret"), "transport exceptions have no retry or private error text");
const auth = await submitAstronomyFcmR8Once(prepareAstronomyFcmR8(input), token, () => now, async () => { calls += 1; return response(401, "UNAUTHENTICATED"); });
check(auth.outcome === "not_accepted" && calls === 3, "no hidden credential refresh or retry");
// Independent-review additions (6 ก.ย.): hostile transport responses must not
// escape the submit boundary after the attempt is spent, and Retry-After edge
// shapes must never produce an early retry or a lost authoritative retry.
const hostile = await submitAstronomyFcmR8Once(prepareAstronomyFcmR8(input), token, () => now, async () => {
  calls += 1;
  const trap: Record<string, unknown> = { body: acceptedResponse.body };
  Object.defineProperty(trap, "status", { enumerable: true, get() { throw new Error("secret token text"); } });
  return trap as never;
});
check(hostile.outcome === "unknown" && !hostile.retryable && !JSON.stringify(hostile).includes("secret"), "throwing response getters stay inside the spent attempt");
const pastDate = classify(response(503, "UNAVAILABLE", "UNAVAILABLE", new Date(now - 60_000).toUTCString()));
check(pastDate.retryable && pastDate.retryNotBefore === now + 60_000, "past-date Retry-After floors to the 60s minimum instead of dropping the retry");
const numericRetry = classifyAstronomyFcmR8({ ...response(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED"), retryAfter: 120 as never }, projectId, now, input.expiresAt);
check(numericRetry.retryable && numericRetry.retryNotBefore === now + 120_000, "numeric Retry-After seconds honored with floor");
const longName = classify({ status: 200, body: JSON.stringify({ name: `projects/${projectId}/messages/${"x".repeat(300)}` }) });
check(longName.outcome === "unknown", "unbounded provider message name never becomes acceptance evidence");
await assert.rejects(() => submitAstronomyFcmR8Once(prepareAstronomyFcmR8(input), token, () => Number.NaN as never, async () => acceptedResponse), /r8_fcm_clock_invalid/); checks += 1;
const lateClock = (() => { let first = true; return () => { if (first) { first = false; return now; } return now + 300_000; }; })();
const slow = await submitAstronomyFcmR8Once(prepareAstronomyFcmR8(input), token, lateClock, async () => response(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED", "60"));
check(!slow.retryable || (slow.retryNotBefore !== null && slow.retryNotBefore >= now + 300_000 + 60_000), "slow transport cannot shrink the backoff window");
const source = readFileSync("src/lib/mobile-astronomy-fcm-r8.ts", "utf8");
assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|readFile|fcm-direct|push-send|setTimeout/u); checks += 1;
console.log(`PASS astronomy FCM R8: ${checks} checks (injected transport only; no live send).`);
