import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";
import { parseSavedDatePayload } from "../src/app/api/mobile/v1/datepick/saved-store.ts";
import {
  applyAuspiciousTimeContext,
  auspiciousQueryRange,
  parseAuspiciousTimeContext,
} from "../src/lib/auspicious-time-context.ts";
import { goalCacheKey, localCivilDay, pickNextAuspicious } from "../src/app/api/mobile/v1/goals/custom/goals-lib.ts";

const require = createRequire(import.meta.url);
const yam = require("./mobile-yam-push-cron.cjs");
const daily = require("./mobile-daily-fortune-push-cron.cjs");
const network = require("./mobile-network-morning-push-cron.cjs");
const personal = require("./mobile-personal-reminders-cron.cjs");

const fallBackInstant = new Date("2026-11-01T04:30:00.000Z");
assert.equal(localCivilDay("America/New_York", fallBackInstant, 0), "2026-11-01");
assert.equal(
  localCivilDay("America/New_York", fallBackInstant, 1),
  "2026-11-02",
  "goal search advances one civil date across a 25-hour fallback day",
);
assert.equal(
  localCivilDay("America/New_York", fallBackInstant, 13),
  "2026-11-14",
  "a 14-day goal window contains 14 distinct user-local dates across DST",
);

const dstPayload = {
  activityType: "出行",
  datetime: {
    start: "2026-11-01T01:30:00-04:00",
    end: "2026-11-01T02:30:00-05:00",
    timezone: "America/New_York",
  },
  pillars: { day: "甲子" },
  summary: "DST travel window",
};
const parsedDst = parseSavedDatePayload(dstPayload);
assert.deepEqual(parsedDst.payload?.datetime, {
  start: "2026-11-01T01:30:00-04:00",
  end: "2026-11-01T02:30:00-05:00",
  timezone: "America/New_York",
  utcOffsetMinutes: -240,
}, "saved-date persistence must retain the source IANA zone and the source start offset");
assert.equal(parseSavedDatePayload({
  ...dstPayload,
  datetime: {
    start: "2026-08-16T08:00:00+07:00",
    end: "2026-08-16T10:00:00+07:00",
    timezone: "Asia/Tokyo",
  },
}).error, "datetime_timezone_offset_mismatch",
"saved-date persistence must reject an IANA zone that contradicts the source timestamp offset");
assert.equal(parseSavedDatePayload({
  ...dstPayload,
  datetime: {
    ...dstPayload.datetime,
    end: "2026-11-01T02:30:00-04:00",
  },
}).error, "datetime_timezone_offset_mismatch",
"saved-date persistence must validate the ending offset across a DST transition too");

const travelledUser = {
  id: "00000000-0000-4000-8000-000000000201",
  user_timezone: "Asia/Tokyo",
  tokens: [{ id: "token-1", locale: "en" }],
};
const dstNotice = personal.buildSavedDateProducer(
  travelledUser,
  { id: "40000000-0000-4000-8000-000000000201", payload: parsedDst.payload },
  new Date("2026-11-01T04:30:00.000Z"),
);
assert.ok(dstNotice, "saved DST instant must be due exactly one elapsed hour before its persisted instant");
assert.match(dstNotice.messages[0].body, /01\/11, 01:30/u,
  "saved-date copy must use the timezone persisted with the saved candidate, not the user's current travel timezone");
assert.equal(dstNotice.payload.date, "2026-11-01");
assert.deepEqual(dstNotice.sourceFacts, {
  timezone: "America/New_York",
  utcOffsetMinutes: -240,
  sourceStart: "2026-11-01T01:30:00-04:00",
  start: "2026-11-01T05:30:00.000Z",
  activityType: "出行",
});

const offsetOnlyNotice = personal.buildSavedDateProducer(
  travelledUser,
  {
    id: "40000000-0000-4000-8000-000000000202",
    payload: {
      activityType: "出行",
      datetime: {
        start: "2026-08-16T08:00:00+05:30",
        end: "2026-08-16T10:00:00+05:30",
        utcOffsetMinutes: 330,
      },
    },
  },
  new Date("2026-08-16T01:30:00.000Z"),
);
assert.ok(offsetOnlyNotice);
assert.match(offsetOnlyNotice.messages[0].body, /16\/08, 08:00/u,
  "legacy/fixed-offset saved dates must keep their persisted offset when the account timezone changes");
assert.equal(offsetOnlyNotice.sourceFacts.timezone, null);
assert.equal(offsetOnlyNotice.sourceFacts.utcOffsetMinutes, 330);

const requestInstant = new Date("2026-08-15T23:00:00.000Z");
const timeContextResult = parseAuspiciousTimeContext({
  timezone: "America/Los_Angeles",
  instant: requestInstant.toISOString(),
});
assert.ok(timeContextResult.context);
assert.deepEqual(auspiciousQueryRange("2026-08-15", "2026-08-15", timeContextResult.context), {
  dateFrom: "2026-08-14",
  dateTo: "2026-08-16",
}, "a user-local day must query the adjacent Bangkok cache days needed around a UTC boundary");

const rawCandidates = [
  {
    id: "too-early-local-day",
    datetime: { start: "2026-08-15 00:30:00+00", end: "2026-08-15 02:30:00+00", timezone: "Asia/Bangkok" },
    calendar: { gregorianDate: "2026-08-15" },
    scoring: { finalScore: 90 },
  },
  {
    id: "profile-bound-window",
    datetime: { start: "2026-08-16 00:30:00+00", end: "2026-08-16 02:30:00+00", timezone: "Asia/Bangkok" },
    calendar: { gregorianDate: "2026-08-16" },
    scoring: { finalScore: 72, profileId: "30000000-0000-4000-8000-000000000102" },
    modules: { ba_zi: { status: "ready", score: { normalized: 72 } } },
  },
];
const localCandidates = applyAuspiciousTimeContext(
  rawCandidates,
  "2026-08-15",
  "2026-08-15",
  timeContextResult.context,
);
assert.equal(localCandidates.length, 1, "route adapter must filter by the requested user-local calendar day and instant");
assert.equal(localCandidates[0].id, "profile-bound-window");
assert.deepEqual(localCandidates[0].datetime, {
  start: "2026-08-15T17:30:00-07:00",
  end: "2026-08-15T19:30:00-07:00",
  timezone: "America/Los_Angeles",
  utcOffsetMinutes: -420,
});
assert.equal(localCandidates[0].calendar.gregorianDate, "2026-08-15");
assert.equal(localCandidates[0].modules.ba_zi.status, "ready", "timezone projection must retain profile-scored engine evidence");
assert.deepEqual(pickNextAuspicious(localCandidates, requestInstant.valueOf()), {
  date: "2026-08-15",
  dayLabel: "ส. 15 ส.ค.",
  hourRange: "17:30-19:30",
  score: 72,
}, "the real goal response adapter must consume the route's user-local candidate window");
assert.notEqual(
  goalCacheKey("launch", "profile-1", "2026-08-15", "America/Los_Angeles", requestInstant),
  goalCacheKey("launch", "profile-1", "2026-08-15", "Asia/Tokyo", requestInstant),
  "goal science cache must not reuse a candidate window after the user changes timezone",
);
assert.notEqual(
  goalCacheKey("launch", "profile-1", "2026-08-15", "America/Los_Angeles", requestInstant),
  goalCacheKey("launch", "profile-1", "2026-08-15", "America/Los_Angeles", new Date(requestInstant.valueOf() + 15 * 60_000)),
  "goal science cache must advance with the scheduler instant so a past window is not replayed",
);

const webContext = parseAuspiciousTimeContext({});
assert.ok(webContext.context && webContext.context.enabled === false);
assert.equal(applyAuspiciousTimeContext(rawCandidates, "2026-08-15", "2026-08-16", webContext.context), rawCandidates,
  "web requests without a time context must retain their existing candidate objects byte-for-byte");
assert.equal(parseAuspiciousTimeContext({ timezone: "Mars/Olympus", instant: requestInstant.toISOString() }).error,
  "timezone_invalid");

const routeRole = `notification_route_science_${process.pid}`;
const routePassword = crypto.randomBytes(20).toString("hex");
let routeDbImported = false;
try {
  psql("postgres", `DROP ROLE IF EXISTS ${routeRole}; CREATE ROLE ${routeRole} LOGIN PASSWORD '${routePassword}';`);
  psql("decode_db", `GRANT USAGE ON SCHEMA public TO ${routeRole}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${routeRole};`);
  process.env.PGHOST = "127.0.0.1";
  process.env.PGPORT = "5433";
  process.env.PGDATABASE = "decode_db";
  process.env.PGUSER = routeRole;
  process.env.PGPASSWORD = routePassword;
  const { NextRequest } = await import("next/server.js");
  const auspiciousRoute = await import("../src/app/api/auspicious/route.ts");
  routeDbImported = true;
  const routeResponse = await auspiciousRoute.POST(new NextRequest("http://localhost/api/auspicious", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${process.pid % 200 + 1}` },
  body: JSON.stringify({
    activityType: "開市",
    activeModules: ["ze_ri"],
    dateFrom: "2026-08-15",
    dateTo: "2026-08-15",
    timezone: "America/Los_Angeles",
    instant: requestInstant.toISOString(),
    options: { limit: 10, scanLimit: 100 },
  }),
  }));
  assert.equal(routeResponse.status, 200, "real /api/auspicious route must accept a valid notification time context");
  const routeBody = await routeResponse.json();
  assert.ok(Array.isArray(routeBody.candidates) && routeBody.candidates.length > 0,
    "real /api/auspicious route must return engine candidates for the local-day integration fixture");
  assert.ok(routeBody.candidates.every((candidate: any) =>
    candidate.datetime?.timezone === "America/Los_Angeles"
    && candidate.datetime?.utcOffsetMinutes === -420
    && candidate.calendar?.gregorianDate === "2026-08-15"
    && Date.parse(candidate.datetime.start) >= requestInstant.valueOf()),
  "real route candidates must consume timezone+instant and expose user-local windows across the UTC boundary");
  assert.deepEqual(routeBody.meta?.timeContext, {
    timezone: "America/Los_Angeles",
    instant: requestInstant.toISOString(),
    candidateDates: "user_local",
  });

  const invalidRouteResponse = await auspiciousRoute.POST(new NextRequest("http://localhost/api/auspicious", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${process.pid % 200 + 1}` },
  body: JSON.stringify({
    activityType: "開市", activeModules: ["ze_ri"], dateFrom: "2026-08-15", dateTo: "2026-08-15",
    timezone: "Mars/Olympus", instant: requestInstant.toISOString(),
  }),
  }));
  assert.equal(invalidRouteResponse.status, 400, "real /api/auspicious route must fail closed on an invalid supplied timezone");
} finally {
  if (routeDbImported) {
    const { pool: routeDbPool } = await import("../src/lib/db.ts");
    await routeDbPool.end().catch(() => null);
  }
  psql("decode_db", `DROP OWNED BY ${routeRole};`);
  psql("postgres", `DROP OWNED BY ${routeRole}; DROP ROLE IF EXISTS ${routeRole};`);
}

const database = `notification_science_final_${process.pid}`;
const role = `notification_science_final_role_${process.pid}`;
const password = crypto.randomBytes(20).toString("hex");

function psql(db: string, sql: string) {
  execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

let pool: pg.Pool | null = null;
try {
  psql("postgres", `
    DROP DATABASE IF EXISTS ${database} WITH (FORCE);
    DROP ROLE IF EXISTS ${role};
    CREATE ROLE ${role} LOGIN PASSWORD '${password}';
    CREATE DATABASE ${database};
  `);
  psql(database, `
    CREATE TABLE users(
      id uuid PRIMARY KEY,email text,current_org_id uuid,session_version int,timezone text,deleted_at timestamptz
    );
    CREATE TABLE profiles(
      id uuid PRIMARY KEY,org_id uuid NOT NULL,created_by_user_id uuid,is_archived boolean,
      relationship_type text,created_at timestamptz
    );
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY,user_id uuid,device_push_token text,device_token_type text,expo_push_token text,
      platform text,locale text,enabled boolean,timezone text
    );
    CREATE TABLE mobile_notification_prefs(
      user_id uuid PRIMARY KEY,security_enabled boolean,yam_enabled boolean,auspicious_enabled boolean,
      daily_enabled boolean,daily_slot text,qimen_enabled boolean,shrine_enabled boolean,goal_enabled boolean,
      saved_date_enabled boolean,service_enabled boolean,yam_min_quality text,yam_lead_minutes int,
      qimen_latitude numeric,qimen_longitude numeric,qimen_location_updated_at timestamptz,
      quiet_start int,quiet_end int,max_per_day int,paused_until timestamptz,timezone text
    );
    CREATE TABLE mobile_push_log(user_id uuid,delivery_status text,sent_at timestamptz,accepted_at timestamptz,updated_at timestamptz);

    INSERT INTO users VALUES
      ('00000000-0000-4000-8000-000000000101','scoped@example.test','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'Asia/Bangkok',NULL),
      ('00000000-0000-4000-8000-000000000102','null-org@example.test',NULL,0,'Asia/Bangkok',NULL),
      ('00000000-0000-4000-8000-000000000103','network-ineligible@example.test','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'Asia/Bangkok',NULL),
      ('00000000-0000-4000-8000-000000000104','network-eligible@example.test','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'Asia/Bangkok',NULL);

    INSERT INTO profiles VALUES
      ('30000000-0000-4000-8000-000000000101','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','00000000-0000-4000-8000-000000000101',false,NULL,'2020-01-01'),
      ('30000000-0000-4000-8000-000000000102','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000101',false,NULL,'2021-01-01'),
      ('30000000-0000-4000-8000-000000000103','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000102',false,NULL,'2020-01-01'),
      ('30000000-0000-4000-8000-000000000104','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000103',false,NULL,'2020-01-01'),
      ('30000000-0000-4000-8000-000000000105','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000103',false,'family','2020-01-02'),
      ('30000000-0000-4000-8000-000000000106','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','00000000-0000-4000-8000-000000000103',false,'family','2020-01-03'),
      ('30000000-0000-4000-8000-000000000107','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000104',false,NULL,'2020-01-01'),
      ('30000000-0000-4000-8000-000000000108','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000104',false,'family','2020-01-02'),
      ('30000000-0000-4000-8000-000000000109','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000104',false,'family','2020-01-03');

    INSERT INTO mobile_push_tokens
    SELECT gen_random_uuid(),id,NULL,NULL,'ExponentPushToken[' || id::text || ']','ios','en',true,'Asia/Bangkok' FROM users;
    INSERT INTO mobile_notification_prefs
    SELECT id,true,true,true,true,'morning',false,false,false,false,true,'best',60,NULL,NULL,NULL,0,0,10,NULL,'Asia/Bangkok' FROM users;

    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role};
  `);

  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 2 });

  const yamRows = await yam.loadYamUsers(pool);
  const yamByUser = new Map(yamRows.map((row: any) => [row.id, row]));
  assert.equal(yamByUser.get("00000000-0000-4000-8000-000000000101")?.profile_id, "30000000-0000-4000-8000-000000000102",
    "Yam must choose a profile from the creator's current organization");
  assert.equal(yamByUser.get("00000000-0000-4000-8000-000000000102")?.profile_id, null,
    "Yam must choose no profile when current_org_id is NULL");

  assert.equal(typeof daily.loadDailyUsers, "function", "daily scheduler must expose its production user query for integration coverage");
  const dailyRows = await daily.loadDailyUsers(pool);
  const dailyByUser = new Map(dailyRows.map((row: any) => [row.id, row]));
  assert.equal(dailyByUser.get("00000000-0000-4000-8000-000000000101")?.profile_id, "30000000-0000-4000-8000-000000000102",
    "daily must choose a profile from the creator's current organization");
  assert.equal(dailyByUser.get("00000000-0000-4000-8000-000000000102")?.profile_id, null,
    "daily must choose no profile when current_org_id is NULL");

  const networkRows = await network.loadUsers(pool);
  assert.deepEqual(networkRows.map((row: any) => row.id).sort(), ["00000000-0000-4000-8000-000000000104"],
    "network eligibility must count three profiles inside the creator's current organization only");
} finally {
  await pool?.end().catch(() => null);
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`);
}

console.log("NOTIFICATION_SCIENCE_FINAL_BLOCKERS_OK scope=organization");
