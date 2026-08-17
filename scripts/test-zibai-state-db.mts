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
    assert.equal(foreground.locationExpiresAt, new Date(Date.parse(capturedAt) + 7 * 24 * 3_600_000).toISOString(),
      "a fresh authorized location grants one seven-day lease");

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

    const overdueDaily = new Date(at.getTime() - 120_000).toISOString();
    const overdueShichen = new Date(at.getTime() - 60_000).toISOString();
    await pool.query(`UPDATE mobile_zibai_installations SET next_daily_at=$3,next_shichen_at=$4 WHERE user_id=$1 AND installation_id=$2`,
      [userId, installationId, overdueDaily, overdueShichen]);
    const backgroundTick = await mutateZibaiInstallation(pool, userId, {
      action: "background_location", installationId, latitude: 13.76, longitude: 100.51,
      timezone: "Asia/Bangkok", capturedAt,
    }, at);
    assert.equal(backgroundTick.nextDailyAt, overdueDaily, "location refresh before a claim must preserve an already-due daily occurrence");
    assert.equal(backgroundTick.nextShichenAt, overdueShichen, "location refresh after claim must preserve its already-due shichen occurrence");
    const claimedLease = "30000000-0000-4000-8000-000000000001";
    await pool.query(`UPDATE mobile_zibai_installations SET lease_token=$3,lease_expires_at=$4,next_daily_at=$5,next_shichen_at=$6
      WHERE user_id=$1 AND installation_id=$2`, [userId, installationId, claimedLease,
      new Date(at.getTime() + 5 * 60_000).toISOString(), overdueDaily, overdueShichen]);
    const afterClaimRefresh = await mutateZibaiInstallation(pool, userId, {
      action: "background_location", installationId, latitude: 13.77, longitude: 100.52,
      timezone: "Asia/Bangkok", capturedAt,
    }, at);
    assert.equal(afterClaimRefresh.nextDailyAt, overdueDaily);
    assert.equal(afterClaimRefresh.nextShichenAt, overdueShichen,
      "a refresh after scheduler claim cannot advance the occurrence before loadClaimContext");
    assert.equal((await pool.query(`SELECT lease_token::text FROM mobile_zibai_installations WHERE user_id=$1 AND installation_id=$2`,
      [userId, installationId])).rows[0].lease_token, claimedLease, "location refresh preserves the scheduler fence");
    await pool.query(`UPDATE mobile_zibai_installations SET lease_token=NULL,lease_expires_at=NULL WHERE user_id=$1 AND installation_id=$2`,
      [userId, installationId]);

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

    await pool.query(`UPDATE mobile_zibai_installations SET daily_enabled=true,shichen_enabled=true,location_permission='background',
      latitude=13.75,longitude=100.5,location_timezone='Asia/Bangkok',location_captured_at=$3,location_expires_at=$4,
      next_daily_at=$5,next_shichen_at=$6 WHERE user_id=$1 AND installation_id=$2`,
      [userId, installationId, new Date(at.getTime() - 4 * 3_600_000).toISOString(), new Date(at.getTime() + 20 * 3_600_000).toISOString(), at.toISOString(), at.toISOString()]);
    const dailyOff = await mutateZibaiInstallation(pool, userId, { action: "settings", installationId, dailyEnabled: false }, at);
    assert.equal(dailyOff.dailyEnabled, false, "opt-out must never require a fresh location");
    assert.equal(dailyOff.shichenEnabled, true, "the independent shichen switch is preserved");

    await pool.query(`UPDATE mobile_zibai_installations SET daily_enabled=true,shichen_enabled=true,next_daily_at=$3,next_shichen_at=$3 WHERE user_id=$1 AND installation_id=$2`,
      [userId, installationId, at.toISOString()]);
    const shichenOff = await mutateZibaiInstallation(pool, userId, { action: "settings", installationId, shichenEnabled: false }, at);
    assert.equal(shichenOff.shichenEnabled, false, "shichen opt-out must never require location permission");
    assert.equal(shichenOff.dailyEnabled, true, "the independent daily switch is preserved");

    await assert.rejects(() => mutateZibaiInstallation(pool, userId, {
      action: "background_location", installationId, latitude: 13.75, longitude: 100.5,
      timezone: "Asia/Bangkok", capturedAt,
    }, at), (error: unknown) => error instanceof ZibaiStateError && error.code === "zibai_shichen_disabled",
    "disable between mobile preflight and background POST must reject coordinate storage");
    console.log("ZIBAI_STATE_DB_OK ownership=1 location=1 permissionDowngrade=1");
  } finally { await pool.end(); }
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`); } catch { /* guarded cleanup */ }
}
