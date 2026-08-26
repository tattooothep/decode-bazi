import assert from "node:assert/strict";
import {
  exactObjectKeys, guardSciencePreviewRequest, MAX_PREVIEW_BODY_BYTES, readBoundedJson,
  sciencePreviewEnabledForUser, strictIanaTimezone, strictRfc3339Instant,
} from "../src/lib/mobile-science-preview-route";
import {
  resolveUnambiguousBirthWallClock,
  resolveUnambiguousIanaWallClock,
} from "../src/lib/astro/ziwei/hourly-preview";

const oldEnabled = process.env.TEST_PREVIEW_ENABLED;
const oldUsers = process.env.TEST_PREVIEW_USERS;
try {
  delete process.env.TEST_PREVIEW_ENABLED;
  delete process.env.TEST_PREVIEW_USERS;
  assert.equal(sciencePreviewEnabledForUser("TEST_PREVIEW_ENABLED", "TEST_PREVIEW_USERS", "u1"), false);
  process.env.TEST_PREVIEW_ENABLED = "1";
  process.env.TEST_PREVIEW_USERS = "u2,u1";
  assert.equal(sciencePreviewEnabledForUser("TEST_PREVIEW_ENABLED", "TEST_PREVIEW_USERS", "u1"), true);
  assert.equal(sciencePreviewEnabledForUser("TEST_PREVIEW_ENABLED", "TEST_PREVIEW_USERS", "u3"), false);
} finally {
  if (oldEnabled === undefined) delete process.env.TEST_PREVIEW_ENABLED; else process.env.TEST_PREVIEW_ENABLED = oldEnabled;
  if (oldUsers === undefined) delete process.env.TEST_PREVIEW_USERS; else process.env.TEST_PREVIEW_USERS = oldUsers;
}

assert.equal(strictRfc3339Instant("2026-08-26T12:00:00Z")?.toISOString(), "2026-08-26T12:00:00.000Z");
assert.equal(strictRfc3339Instant("2026-08-26T12:00:00"), null);
assert.equal(strictRfc3339Instant("2026-02-31T12:00:00Z"), null);
assert.equal(strictIanaTimezone("Asia/Bangkok", new Date("2026-08-26T12:00:00Z")), "Asia/Bangkok");
assert.equal(strictIanaTimezone("US/Eastern", new Date("2026-08-26T12:00:00Z")), "America/New_York");
assert.equal(strictIanaTimezone("+07:00", new Date("2026-08-26T12:00:00Z")), null);
assert.equal(exactObjectKeys({ schema: 1, profileId: "x" }, ["schema", "profileId"]), true);
assert.equal(exactObjectKeys({ schema: 1, profileId: "x", extra: true }, ["schema", "profileId"]), false);
assert.equal(exactObjectKeys({ schema: 1 }, ["schema", "profileId"]), false);

const parsed = await readBoundedJson(new Request("https://hourkey.invalid", { method: "POST", body: JSON.stringify({ ok: true }) }));
assert.equal(parsed.ok, true);
await assert.rejects(() => readBoundedJson(new Request("https://hourkey.invalid", { method: "POST", body: "x".repeat(MAX_PREVIEW_BODY_BYTES + 1) })), /preview_body_too_large/);

assert.equal(resolveUnambiguousIanaWallClock("2026-08-26T12:00:00", "Asia/Bangkok").toISOString(), "2026-08-26T05:00:00.000Z");
assert.equal(resolveUnambiguousBirthWallClock("2026-08-26T12:00:00", "+08:00").toISOString(), "2026-08-26T04:00:00.000Z");
assert.equal(resolveUnambiguousBirthWallClock("2026-08-26T12:00:00", "-05:30").toISOString(), "2026-08-26T17:30:00.000Z");
assert.throws(() => resolveUnambiguousIanaWallClock("2026-03-08T02:30:00", "America/New_York"), /ambiguous_birth_wall_clock/);
assert.throws(() => resolveUnambiguousIanaWallClock("2026-11-01T01:30:00", "America/New_York"), /ambiguous_birth_wall_clock/);
assert.throws(() => resolveUnambiguousBirthWallClock("2026-03-08T02:30:00", "America/New_York"), /ambiguous_birth_wall_clock/);

const calls = { auth: 0, rate: 0, flag: 0 };
const config = {
  rateKeyPrefix: "science-test", rateMax: 2, rateWindowMs: 60_000,
  enabledKey: "TEST_PREVIEW_ENABLED", allowlistKey: "TEST_PREVIEW_USERS",
};
const makeDeps = (session: { userId: string; orgId: string | null } | null, enabled = true) => ({
  getSession: async () => { calls.auth += 1; return session; },
  rateLimit: async () => { calls.rate += 1; return { ok: true as const }; },
  clientIp: () => "127.0.0.1",
  enabledForUser: () => { calls.flag += 1; return enabled; },
});

Object.assign(calls, { auth: 0, rate: 0, flag: 0 });
assert.deepEqual(await guardSciencePreviewRequest(new Request("https://hourkey.invalid"), config, makeDeps(null)), {
  ok: false, status: 401, error: "not_logged_in",
});
assert.deepEqual(calls, { auth: 1, rate: 0, flag: 0 });

Object.assign(calls, { auth: 0, rate: 0, flag: 0 });
assert.deepEqual(await guardSciencePreviewRequest(
  new Request("https://hourkey.invalid"), config, makeDeps({ userId: "u1", orgId: "o1" }, false),
), { ok: false, status: 503, error: "preview_unavailable" });
assert.deepEqual(calls, { auth: 1, rate: 1, flag: 1 });

Object.assign(calls, { auth: 0, rate: 0, flag: 0 });
const allowed = await guardSciencePreviewRequest(
  new Request("https://hourkey.invalid"), config, makeDeps({ userId: "u1", orgId: "o1" }),
);
assert.equal(allowed.ok, true);
assert.deepEqual(calls, { auth: 1, rate: 1, flag: 1 });

console.log("PASS mobile science preview helpers — guards, exact schema keys, RFC3339, IANA/fixed offset, DST gap/fold");
