import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import pg from "pg";
import { buildZibaiSnapshot } from "../src/lib/zibai-science.ts";

const require = createRequire(import.meta.url);
const scheduler = require("./mobile-zibai-push-cron.cjs");
const payloadRuntime = require("../src/lib/notification-payload.cjs");
const versionRuntime = require("../src/lib/zibai-version-runtime.cjs");
const database = `zibai_v3_compat_${process.pid}`;
const role = `zibai_v3_compat_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const userId = "00000000-0000-4000-8000-000000000001";
const installationId = "10000000-0000-4000-8000-000000000001";
const tokenId = "20000000-0000-4000-8000-000000000001";

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql },
  ).trim();
}

assert.equal(versionRuntime.ACTIVE_CALCULATION_VERSION, "zibai-zaoming-true-solar-v2");
assert.deepEqual(versionRuntime.READABLE_CALCULATION_VERSIONS, [
  "zibai-zaoming-true-solar-v2",
  "zibai-zaoming-true-solar-v3",
]);

const at = new Date("2026-08-16T03:07:00.000Z");
const snapshot = buildZibaiSnapshot(at, 100.5018);
assert.equal(snapshot.calculationVersion, "zibai-zaoming-true-solar-v2",
  "compatibility release retains the exact V2 producer semantics");
const row = {
  user_id: userId,
  installation_id: installationId,
  token_id: tokenId,
  device_push_token: "fixture-native-token",
  device_token_type: "fcm",
  expo_push_token: "ExponentPushToken[compatfixture]",
  platform: "android",
  token_locale: "en",
  privacy_preview: true,
  zibai_payload_schema: 2,
  calculation_version: "zibai-zaoming-true-solar-v2",
  zibai_calculation_version: "zibai-zaoming-true-solar-v3",
};
const v2Notice = scheduler.buildZibaiNotice(
  row,
  "zibai_shichen",
  snapshot,
  "30000000-0000-4000-8000-000000000001",
);
assert.equal(v2Notice.payload.calculationVersion, "zibai-zaoming-true-solar-v2");
const v2Facts = scheduler.buildZibaiV2Facts(snapshot, "zibai_shichen");
const v3Facts = {
  ...v2Facts,
  calculationVersion: "zibai-zaoming-true-solar-v3",
  referenceId: v2Facts.referenceId.replace(/v2$/u, "v3"),
};
const storedV3 = payloadRuntime.buildNotificationPayload("zibai", userId, v3Facts);
assert.equal(storedV3.calculationVersion, "zibai-zaoming-true-solar-v3",
  "compatibility readers accept immutable V3 history before activation and after rollback");

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE mobile_push_tokens(
      id uuid PRIMARY KEY,user_id uuid NOT NULL,installation_id uuid NOT NULL,enabled boolean NOT NULL,
      device_push_token text,device_token_type text,expo_push_token text,platform text,locale text
    );
    INSERT INTO users VALUES('${userId}');
  `);
  psql(database, readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8"));
  psql(database, readFileSync("migrations/20260819_mobile_zibai_three_layer.sql", "utf8"));
  psql(database, readFileSync("migrations/20260823_mobile_zibai_v3_compatibility.sql", "utf8"));
  psql(database, `
    INSERT INTO mobile_push_tokens
      (id,user_id,installation_id,enabled,device_push_token,device_token_type,expo_push_token,platform,locale,
       zibai_payload_schema,zibai_calculation_version)
    VALUES('${tokenId}','${userId}','${installationId}',true,'native','fcm','ExponentPushToken[compatfixture]',
      'android','en',2,'zibai-zaoming-true-solar-v3');
    INSERT INTO mobile_zibai_installations(user_id,installation_id,calculation_version)
    VALUES('${userId}','${installationId}','zibai-zaoming-true-solar-v2');
    INSERT INTO mobile_zibai_occurrences
      (user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version,state)
    VALUES('${userId}','${installationId}','prior-v3','shichen','${snapshot.apparentSolarDate}',
      '${snapshot.shichenKey}','zibai-zaoming-true-solar-v3','claimed');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);
  const pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password });
  try {
    assert.equal(await scheduler.admitOccurrence(pool, row, "zibai_shichen", snapshot), null,
      "a retained V3 logical slot suppresses a V2 retry after rollback without raising");
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_occurrences`)).rows[0].n, 1);
  } finally {
    await pool.end();
  }
  console.log("ZIBAI_V3_COMPAT_RELEASE_OK producer=v2 readers=v2,v3 rollbackReplay=suppressed");
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch { /* guarded cleanup */ }
}
