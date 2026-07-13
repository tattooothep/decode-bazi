import { randomUUID } from "node:crypto";

const GOAL_IDS = ["wealth", "career", "love", "health", "family", "travel"];
const IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;
const AI_TIMEOUT_MS = 650_000;

let checks = 0;
let loginCalls = 0;
let bearer = "";
const cleanupIds = new Set();

function pass(label) {
  checks += 1;
  console.log(`PASS ${label}`);
}

function check(condition, label) {
  if (!condition) throw new Error(label);
  pass(label);
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

function cleanBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("BASE_URL must be an absolute HTTP(S) URL");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("BASE_URL must be an HTTP(S) URL without embedded credentials");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function parseRounds() {
  const raw = String(process.env.R515_ROUNDS || "3").trim();
  if (!/^\d+$/.test(raw)) throw new Error("R515_ROUNDS must be an integer from 1 to 3");
  const value = Number(raw);
  if (value < 1 || value > 3) throw new Error("R515_ROUNDS must be an integer from 1 to 3");
  return value;
}

function bangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sameJson(left, right) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, canonical(child)])
      );
    }
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

async function request(path, options = {}) {
  const {
    accept = "application/json",
    auth = true,
    body,
    method = "GET",
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;
  const headers = { Accept: accept };
  if (auth && bearer) headers.Authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(`request transport failed for ${method} ${path.split("?")[0]}`);
  }
  return response;
}

async function jsonRequest(path, options = {}) {
  const response = await request(path, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    // The caller reports only the route label, never a response body.
  }
  return { data, response };
}

function assertOkJson(result, expectedStatus, label) {
  check(result.response.status === expectedStatus, `${label} returns HTTP ${expectedStatus}`);
  check(result.data && result.data.ok === true, `${label} returns {ok:true}`);
  return result.data;
}

function assertUuid(value, label) {
  check(
    typeof value === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    label
  );
}

function parseSse(text) {
  const events = [];
  for (const block of text.replace(/\r\n/g, "\n").split(/\n\n+/)) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    let data = null;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      throw new Error("SSE event data is not valid JSON");
    }
    events.push({ data, event });
  }
  return events;
}

const BASE_URL = cleanBaseUrl(requiredEnv("BASE_URL"));
const TEST_EMAIL = requiredEnv("R515_TEST_EMAIL");
const TEST_PASSWORD = requiredEnv("R515_TEST_PASSWORD");
const PROFILE_ID = requiredEnv("R515_PROFILE_ID").replace(/^hk_/, "");
const ROUNDS = parseRounds();
const RATE_PROBE = String(process.env.R515_RATE_PROBE || "") === "1";

async function verifyBearerGuards() {
  const missingBearerCases = [
    {
      body: { activityType: "開市", dateFrom: "2026-07-13", dateTo: "2026-07-14", peopleIds: [] },
      label: "datepick search",
      method: "POST",
      path: "/api/mobile/v1/datepick",
    },
    {
      body: {},
      label: "saved-date create",
      method: "POST",
      path: "/api/mobile/v1/datepick/save",
    },
    { label: "saved-date list", method: "GET", path: "/api/mobile/v1/datepick/saved" },
    {
      label: "saved-date delete",
      method: "DELETE",
      path: `/api/mobile/v1/datepick/saved/${randomUUID()}`,
    },
    {
      body: { message: "guard", profileId: PROFILE_ID },
      label: "Sifu JSON",
      method: "POST",
      path: "/api/mobile/v1/sifu/chat",
    },
    {
      accept: "text/event-stream",
      body: { message: "guard", profileId: PROFILE_ID },
      label: "Sifu SSE",
      method: "POST",
      path: "/api/mobile/v1/sifu/chat?stream=1",
    },
    {
      label: "Today Goals",
      method: "GET",
      path: `/api/mobile/v1/today/goals?profileId=${encodeURIComponent(PROFILE_ID)}`,
    },
  ];

  for (const testCase of missingBearerCases) {
    const result = await jsonRequest(testCase.path, { ...testCase, auth: false });
    check(result.response.status === 401, `${testCase.label} rejects a missing Bearer token with HTTP 401`);
    check(result.data && result.data.ok === false, `${testCase.label} returns {ok:false} when unauthenticated`);
  }
}

async function loginOnce() {
  loginCalls += 1;
  const result = await jsonRequest("/api/mobile/v1/session", {
    auth: false,
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    method: "POST",
  });
  const data = assertOkJson(result, 200, "single mobile login");
  check(data.token_type === "Bearer", "login returns Bearer token type");
  check(typeof data.access_token === "string" && data.access_token.length >= 32, "login returns a non-empty access token");
  check(Number.isFinite(Number(data.user?.hour_balance)), "login returns a numeric hour balance");
  bearer = data.access_token;
  check(loginCalls === 1, "live suite performs exactly one login");
}

async function loadOwnedProfiles() {
  const result = await jsonRequest("/api/mobile/v1/profiles");
  const data = assertOkJson(result, 200, "owned profile list");
  check(Array.isArray(data.profiles), "owned profile list returns an array");
  check(data.count === data.profiles.length, "owned profile count matches the returned array");
  const ids = data.profiles.map((profile) => String(profile?.id || ""));
  check(ids.length > 0 && ids.length <= 10, "test account has between one and ten owned profiles");
  check(new Set(ids).size === ids.length, "owned profile list contains no duplicate ids");
  ids.forEach((id, index) => assertUuid(id, `owned profile ${index + 1} has a UUID`));
  check(ids.includes(PROFILE_ID), "R515_PROFILE_ID belongs to the designated test account");
  return ids;
}

async function verifyDatepick(ownedProfileIds) {
  const today = bangkokDate();
  const dateFrom = addUtcDays(today, 1);
  const dateTo = addUtcDays(today, 3);
  const peopleIds = ownedProfileIds.map((id, index) => index % 2 ? id : `hk_${id}`);

  for (let round = 1; round <= ROUNDS; round += 1) {
    const foreignProfileId = randomUUID();
    const denied = await jsonRequest("/api/mobile/v1/datepick", {
      body: {
        activityType: "開市",
        dateFrom,
        dateTo,
        limit: 3,
        peopleIds: [...peopleIds, foreignProfileId],
      },
      method: "POST",
    });
    check(denied.response.status === 403, `datepick round ${round} rejects a profile outside account ownership`);
    check(denied.data?.ok === false, `datepick ownership rejection round ${round} returns {ok:false}`);

    const allProfilesResult = await jsonRequest("/api/mobile/v1/datepick", {
      body: {
        activityType: "開市",
        dateFrom,
        dateTo,
        limit: 3,
        peopleIds,
        profileId: ownedProfileIds[0],
      },
      method: "POST",
    });
    let allowedCount = ownedProfileIds.length;
    if (allProfilesResult.response.status === 403 && allProfilesResult.data?.code === "datepick_people_limit") {
      check(allProfilesResult.data?.ok === false, `datepick all-profile round ${round} preserves {ok:false} at the plan boundary`);
      check(
        Number(allProfilesResult.data?.requested) === ownedProfileIds.length,
        `datepick all-profile round ${round} forwards every owned profile to the established entitlement gate`
      );
      allowedCount = Math.max(1, Math.min(ownedProfileIds.length, Number(allProfilesResult.data?.max) || 1));
    } else {
      const allProfilesData = assertOkJson(allProfilesResult, 200, `datepick all-profile round ${round}`);
      check(
        Array.isArray(allProfilesData.people_ids)
          && allProfilesData.people_ids.length === ownedProfileIds.length
          && ownedProfileIds.every((id) => allProfilesData.people_ids.includes(id)),
        `datepick all-profile round ${round} returns every owned profile when the plan allows it`
      );
    }

    const allowedIds = ownedProfileIds.slice(0, allowedCount);
    const result = await jsonRequest("/api/mobile/v1/datepick", {
      body: {
        activityType: "開市",
        dateFrom,
        dateTo,
        limit: 3,
        peopleIds: allowedIds.map((id, index) => index % 2 ? id : `hk_${id}`),
        profileId: allowedIds[0],
      },
      method: "POST",
    });
    const data = assertOkJson(result, 200, `datepick plan-allowed round ${round}`);
    check(data.source === "/api/auspicious", `datepick round ${round} delegates to the established engine`);
    check(Array.isArray(data.people_ids), `datepick round ${round} returns people_ids`);
    check(
      data.people_ids.length === allowedIds.length
        && new Set(data.people_ids).size === allowedIds.length
        && allowedIds.every((id) => data.people_ids.includes(id)),
      `datepick round ${round} includes every plan-allowed profile exactly once after deduplication`
    );
  }
}

async function listSavedDates(label) {
  const result = await jsonRequest("/api/mobile/v1/datepick/saved?limit=100");
  const data = assertOkJson(result, 200, label);
  check(Array.isArray(data.saved_dates), `${label} returns saved_dates array`);
  check(data.count === data.saved_dates.length, `${label} returns a matching count`);
  return data.saved_dates;
}

async function verifySavedDates() {
  const baselineRows = await listSavedDates("saved-date baseline");
  const baselineIds = baselineRows.map((row) => String(row?.id || ""));
  const baselineIdsVisibleAfterOneInsert = baselineIds.slice(0, 99);
  const date = addUtcDays(bangkokDate(), 2);

  for (let round = 1; round <= ROUNDS; round += 1) {
    const marker = `r515-live-${Date.now()}-${randomUUID()}-${round}`;
    const created = await jsonRequest("/api/mobile/v1/datepick/save", {
      body: {
        activityType: "開市",
        candidateId: marker,
        datetime: {
          end: `${date}T10:00:00+07:00`,
          start: `${date}T09:00:00+07:00`,
        },
        pillars: { day: "甲子", hour: "己巳", month: "乙丑", year: "丙寅" },
        summary: marker,
      },
      method: "POST",
    });
    const createdData = assertOkJson(created, 201, `saved-date create round ${round}`);
    const id = createdData.saved_date?.id;
    assertUuid(id, `saved-date create round ${round} returns a UUID`);
    cleanupIds.add(id);
    check(createdData.saved_date.candidateId === marker, `saved-date round ${round} preserves its candidate id`);

    const listed = await listSavedDates(`saved-date list round ${round}`);
    check(listed.some((row) => row?.id === id && row?.candidateId === marker), `saved-date list round ${round} contains the new row`);
    check(
      baselineIdsVisibleAfterOneInsert.every((baselineId) => listed.some((row) => row?.id === baselineId)),
      `saved-date list round ${round} preserves every pre-existing row still inside the 100-row page`
    );

    const deleted = await jsonRequest(`/api/mobile/v1/datepick/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
    const deletedData = assertOkJson(deleted, 200, `saved-date delete round ${round}`);
    check(deletedData.deleted === true && deletedData.id === id, `saved-date delete round ${round} deletes only the requested row`);
    cleanupIds.delete(id);

    const afterDelete = await listSavedDates(`saved-date post-delete list round ${round}`);
    check(!afterDelete.some((row) => row?.id === id), `saved-date round ${round} is absent after deletion`);
    check(baselineIds.every((baselineId) => afterDelete.some((row) => row?.id === baselineId)), `saved-date cleanup round ${round} leaves pre-existing rows untouched`);
  }
}

async function hourBalance(label) {
  const result = await jsonRequest("/api/mobile/v1/me");
  const data = assertOkJson(result, 200, label);
  const balance = Number(data.user?.hour_balance);
  check(Number.isFinite(balance), `${label} returns numeric hour_balance`);
  return balance;
}

async function verifyImageRejections() {
  const initialBalance = await hourBalance("hour balance before image rejection tests");
  const cases = [
    {
      body: { image_base64: "AA==", message: "image policy probe", profileId: PROFILE_ID },
      error: "image_attachments_not_supported",
      label: "tiny inline image",
      status: 422,
    },
    {
      body: { image_url: "http://127.0.0.1:1/r515-image-must-not-fetch", message: "image policy probe", profileId: PROFILE_ID },
      error: "image_attachments_not_supported",
      label: "URL image",
      status: 422,
    },
    {
      body: {
        image_base64: "A".repeat(Math.ceil(((IMAGE_LIMIT_BYTES + 1) * 4) / 3) + 4),
        message: "image policy probe",
        profileId: PROFILE_ID,
      },
      error: "image_attachment_too_large",
      label: "oversized inline image",
      status: 413,
    },
  ];

  for (const testCase of cases) {
    const result = await jsonRequest("/api/mobile/v1/sifu/chat", { body: testCase.body, method: "POST" });
    check(result.response.status === testCase.status, `${testCase.label} is rejected before AI with HTTP ${testCase.status}`);
    check(result.data?.ok === false && result.data?.error === testCase.error, `${testCase.label} returns the public rejection contract`);
    const balance = await hourBalance(`hour balance after ${testCase.label} rejection`);
    check(balance === initialBalance, `${testCase.label} rejection does not change hour_balance`);
  }
}

const SIFU_MESSAGE = "กรุณาสรุปภาพรวมดวงนี้แบบสั้น กระชับ และไม่เกิน 3 ข้อ";

function sifuPayload() {
  return {
    history: [],
    lang: "th",
    message: SIFU_MESSAGE,
    profileId: PROFILE_ID,
  };
}

async function verifyJsonSifu() {
  for (let round = 1; round <= ROUNDS; round += 1) {
    const result = await jsonRequest("/api/mobile/v1/sifu/chat", {
      body: sifuPayload(),
      method: "POST",
      timeoutMs: AI_TIMEOUT_MS,
    });
    const data = assertOkJson(result, 200, `JSON Sifu round ${round}`);
    check(typeof data.reply === "string" && data.reply.trim().length > 0, `JSON Sifu round ${round} returns a non-empty answer without printing it`);
    check(data.source === "/api/sifu", `JSON Sifu round ${round} delegates to the established Sifu route`);
    check(!("model" in data) && !("provider" in data) && !("provider_model" in data), `JSON Sifu round ${round} hides provider internals`);
  }
}

async function verifySseSifu() {
  for (let round = 1; round <= ROUNDS; round += 1) {
    const response = await request("/api/mobile/v1/sifu/chat?stream=1", {
      accept: "text/event-stream",
      body: sifuPayload(),
      method: "POST",
      timeoutMs: AI_TIMEOUT_MS,
    });
    check(response.status === 200, `SSE Sifu round ${round} returns HTTP 200`);
    check((response.headers.get("content-type") || "").toLowerCase().startsWith("text/event-stream"), `SSE Sifu round ${round} returns text/event-stream`);
    check((response.headers.get("cache-control") || "").toLowerCase().includes("no-cache"), `SSE Sifu round ${round} disables caching`);
    const accelBuffering = response.headers.get("x-accel-buffering");
    check(
      accelBuffering === null || accelBuffering.toLowerCase() === "no",
      `SSE Sifu round ${round} does not advertise proxy buffering`
    );

    let streamText = "";
    try {
      streamText = await response.text();
    } catch {
      throw new Error(`SSE Sifu round ${round} stream read failed`);
    }
    const events = parseSse(streamText);
    const types = events.map((event) => event.event);
    const metaIndex = types.indexOf("meta");
    const firstIndex = types.indexOf("first");
    const chunkIndexes = types.map((event, index) => event === "chunk" ? index : -1).filter((index) => index >= 0);
    const doneIndex = types.lastIndexOf("done");
    check(!types.includes("error"), `SSE Sifu round ${round} completes without an error event`);
    check(metaIndex === 0, `SSE Sifu round ${round} starts with meta`);
    check(firstIndex > metaIndex, `SSE Sifu round ${round} emits first after meta`);
    check(chunkIndexes.length > 0 && chunkIndexes.every((index) => index > firstIndex), `SSE Sifu round ${round} emits answer chunks after first`);
    check(doneIndex > chunkIndexes.at(-1) && doneIndex === events.length - 1, `SSE Sifu round ${round} ends with done after all chunks`);
    check(
      chunkIndexes.map((index) => events[index].data?.text).filter((text) => typeof text === "string").join("").trim().length > 0,
      `SSE Sifu round ${round} carries a non-empty answer without printing it`
    );
    check(Number(events[doneIndex]?.data?.chars) > 0, `SSE Sifu round ${round} done event reports positive answer length`);
  }
}

async function verifyTodayGoals() {
  const date = bangkokDate();
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);

  for (let round = 1; round <= ROUNDS; round += 1) {
    const calendarResult = await jsonRequest(
      `/api/mobile/v1/calendar?year=${year}&month=${month}&profileId=${encodeURIComponent(PROFILE_ID)}`
    );
    const calendar = assertOkJson(calendarResult, 200, `mobile Calendar comparison round ${round}`);
    const day = Array.isArray(calendar.days) ? calendar.days.find((item) => item?.date === date) : null;
    check(!!day, `mobile Calendar round ${round} contains the Bangkok current date`);

    const goalsResult = await jsonRequest(
      `/api/mobile/v1/today/goals?profileId=${encodeURIComponent(PROFILE_ID)}`
    );
    const goals = assertOkJson(goalsResult, 200, `Today Goals default-date round ${round}`);
    check(goals.date === date, `Today Goals round ${round} defaults to the Bangkok date`);
    check(goals.profile?.id === PROFILE_ID && calendar.profile?.id === PROFILE_ID, `Today Goals round ${round} and Calendar use the designated profile`);
    check(
      goals.complete === true
        && Array.isArray(goals.locked_goals)
        && goals.locked_goals.length === 0
        && Object.keys(goals.goals || {}).sort().join(",") === [...GOAL_IDS].sort().join(","),
      `Today Goals round ${round} returns all six goals for the eligible account`
    );
    check(GOAL_IDS.every((id) => Number.isFinite(goals.goals[id])), `Today Goals round ${round} returns numeric scores for all six goals`);
    check(sameJson(goals.goals, day.goals), `Today Goals round ${round} exactly matches mobile Calendar goals`);
    check(sameJson(goals.intent_status, day.intentStatus || {}), `Today Goals round ${round} exactly matches mobile Calendar intentStatus`);
    check(goals.source === "/api/calendar", `Today Goals round ${round} declares Calendar as its source`);
    check(
      ["all", "technical"].includes(goals.entitlement?.goals) && calendar.entitlement?.intents === "all",
      `Today Goals round ${round} confirms eligible Today and Calendar entitlements`
    );
  }
}

async function runOptionalRateProbe() {
  if (!RATE_PROBE) {
    console.log("SKIP optional invalid-input rate probe (set R515_RATE_PROBE=1 to enable)");
    return;
  }

  let sawInvalid = false;
  let sawRateLimit = false;
  for (let attempt = 1; attempt <= 16; attempt += 1) {
    const result = await jsonRequest("/api/mobile/v1/sifu/chat", {
      body: { message: "", profileId: PROFILE_ID },
      method: "POST",
    });
    if (result.response.status === 400) {
      sawInvalid = true;
      check(result.data?.ok === false, `rate probe invalid request ${attempt} preserves {ok:false}`);
      continue;
    }
    if (result.response.status === 429) {
      sawRateLimit = true;
      check(result.data?.ok === false, "rate probe limit response preserves {ok:false}");
      check(Number(result.response.headers.get("retry-after")) >= 1, "rate probe returns Retry-After");
      break;
    }
    throw new Error("rate probe returned an unexpected status");
  }
  check(sawInvalid, "optional rate probe exercised invalid input before throttling");
  check(sawRateLimit, "optional invalid-input rate probe reaches HTTP 429");
}

async function cleanup() {
  if (!bearer) return;
  if (cleanupIds.size === 0) {
    pass("cleanup confirms no test-created saved-date rows remain");
    return;
  }
  let failed = 0;
  for (const id of [...cleanupIds]) {
    try {
      const result = await jsonRequest(`/api/mobile/v1/datepick/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (result.response.status === 200 || result.response.status === 404) cleanupIds.delete(id);
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  if (failed) throw new Error(`cleanup failed for ${failed} test-created saved-date row(s)`);
  pass("cleanup removed every test-created saved-date row");
}

async function main() {
  await verifyBearerGuards();
  await loginOnce();
  const ownedProfileIds = await loadOwnedProfiles();
  await verifyDatepick(ownedProfileIds);
  await verifySavedDates();
  await verifyImageRejections();
  await verifyJsonSifu();
  await verifySseSifu();
  await verifyTodayGoals();
  await runOptionalRateProbe();
  check(loginCalls === 1, "suite finished with exactly one login request");
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error instanceof Error ? error : new Error("unknown live-suite failure");
}

try {
  await cleanup();
} catch (error) {
  if (!failure) failure = error instanceof Error ? error : new Error("unknown cleanup failure");
}

if (failure) {
  console.error(`FAIL ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`mobile R515 live integration passed: ${checks}/${checks}`);
}
