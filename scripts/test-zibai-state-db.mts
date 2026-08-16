import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import {
  ZibaiStateError,
  mutateZibaiInstallation,
  readZibaiInstallation,
} from "../src/lib/mobile-zibai-installation.ts";

const database = `zibai_state_db_${process.pid}`;
const role = `zibai_state_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const userId = "00000000-0000-4000-8000-000000000001";
const installationId = "10000000-0000-4000-8000-000000000001";
const at = new Date("2026-08-16T01:00:00.000Z");
const capturedAt = new Date(at.getTime() - 60_000).toISOString();

function psql(db: string, sql: string): string {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"], { encoding: "utf8", input: sql }).trim();
}

async function rejectsCode(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => error instanceof ZibaiStateError && error.code === code);
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE mobile_push_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE mobile_push_tokens(id uuid PRIMARY KEY,user_id uuid NOT NULL,installation_id uuid NOT NULL,enabled boolean NOT NULL);
    INSERT INTO users VALUES('${userId}');
    INSERT INTO mobile_push_tokens VALUES('20000000-0000-4000-8000-000000000001','${userId}','${installationId}',true);
  `);
  psql(database, readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8"));
  psql(database, `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};`);
  const pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 4 });
  try {
    const empty = await readZibaiInstallation(pool, userId, installationId, at);
    assert.equal(empty.dailyEnabled, false);
    assert.equal(empty.shichenEnabled, false);
    assert.equal(empty.locationFresh, false);

    await rejectsCode(() => mutateZibaiInstallation(pool, userId, { action: "settings", installationId, dailyEnabled: true }, at), "zibai_location_required");
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_installations`)).rows[0].n, 0, "failed first mutation rolls back the provisional row");

    const foreground = await mutateZibaiInstallation(pool, userId, {
      action: "location", installationId, permission: "foreground", latitude: 13.75, longitude: 100.5,
      timezone: "Asia/Bangkok", capturedAt,
    }, at);
    assert.equal(foreground.permission, "foreground");
    assert.equal(foreground.locationFresh, true);
    assert.equal("latitude" in foreground || "longitude" in foreground, false);

    const daily = await mutateZibaiInstallation(pool, userId, {
      action: "settings", installationId, dailyEnabled: true, dailyMinute: 480, quietStart: 21, quietEnd: 8,
    }, at);
    assert.equal(daily.dailyEnabled, true);
    assert.equal(daily.dailyMinute, 480);
    assert.equal(daily.quietStart, 21);
    assert.ok(daily.nextDailyAt);
    await rejectsCode(() => mutateZibaiInstallation(pool, userId, { action: "settings", installationId, shichenEnabled: true }, at), "zibai_background_location_required");

    const background = await mutateZibaiInstallation(pool, userId, {
      action: "location", installationId, permission: "background", latitude: 13.75, longitude: 100.5,
      timezone: "Asia/Bangkok", capturedAt,
    }, at);
    assert.equal(background.permission, "background");
    const enabled = await mutateZibaiInstallation(pool, userId, { action: "settings", installationId, shichenEnabled: true }, at);
    assert.equal(enabled.shichenEnabled, true);
    assert.ok(enabled.nextShichenAt);

    const downgraded = await mutateZibaiInstallation(pool, userId, {
      action: "location", installationId, permission: "foreground", latitude: 13.75, longitude: 100.5,
      timezone: "Asia/Bangkok", capturedAt,
    }, at);
    assert.equal(downgraded.shichenEnabled, false);
    assert.equal(downgraded.nextShichenAt, null);
    assert.equal(downgraded.lastSkipReason, "background_permission_missing");

    const denied = await mutateZibaiInstallation(pool, userId, { action: "location", installationId, permission: "denied" }, at);
    assert.equal(denied.dailyEnabled, true, "permission denial retains the explicit daily toggle but pauses it until location is refreshed");
    assert.equal(denied.shichenEnabled, false);
    assert.equal(denied.locationFresh, false);
    assert.equal(denied.nextDailyAt, null);
    assert.equal(denied.nextShichenAt, null);
    assert.equal(denied.lastSkipReason, "location_permission_denied");
    console.log("ZIBAI_STATE_DB_OK ownership=1 location=1 permissionDowngrade=1");
  } finally { await pool.end(); }
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch { /* guarded cleanup */ }
}
