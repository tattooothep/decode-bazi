#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildZiweiHourlyNotificationFacts,
} from "../src/lib/astro/ziwei/hourly-preview";
import { ZIWEI_HOURLY_LINEAGE_MANIFEST } from "../src/lib/astro/ziwei/hourly-lineage";
import { resolveCanonicalZiweiHourlyContext } from "../src/lib/astro/ziwei/context-resolver";

const require = createRequire(import.meta.url);
const sourceContract = require("../src/lib/ziwei-hourly-source-contract.cjs");
const { Pool } = require("pg");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");
const payloadRuntime = require("../src/lib/ziwei-hourly-notification.cjs");
const { writeSchedulerHeartbeat } = require("../src/lib/notification-scheduler-heartbeat.cjs");

const manifestDigest = createHash("sha256")
  .update(canonicalStringify(ZIWEI_HOURLY_LINEAGE_MANIFEST))
  .digest("hex");
export const SOURCE_DIGEST: string = sourceContract.SOURCE_DIGEST;
if (manifestDigest !== SOURCE_DIGEST) throw new Error("ziwei_hourly_source_contract_drift");
const SEND_GRACE_MS = 10 * 60_000;
const PROVIDER_QUEUE_MS = 5 * 60_000;
const BATCH = 500;
const MAX_PER_RUN = 10_000;
const WORKERS = 8;
const ZIWEI_NOTIFICATION_LOCALES = Object.freeze(["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]);

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }> };
type SchedulerRow = Record<string, any>;

function loadEnv(): void {
  if (process.env.NODE_ENV === "production") return;
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/gu, "");
  }
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyRuntimeSourceManifest(): boolean {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  return ZIWEI_HOURLY_LINEAGE_MANIFEST.calculationRuntime.sources.every((source) => {
    try {
      const actual = createHash("sha256").update(readFileSync(join(repositoryRoot, source.path))).digest("hex");
      return actual === source.sha256;
    } catch {
      return false;
    }
  });
}

function localMinute(timezone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return (value("hour") % 24) * 60 + value("minute");
  } catch { return null; }
}

function inQuietHours(minute: number | null, startHour: number, endHour: number): boolean {
  if (!Number.isInteger(minute)) return true;
  const start = startHour * 60;
  const end = endHour * 60;
  if (start === end) return false;
  return start < end ? minute! >= start && minute! < end : minute! >= start || minute! < end;
}

export function occurrenceKey(row: SchedulerRow, snapshot: any): string {
  const canonical = canonicalStringify({
    accountId: String(row.user_id),
    installationId: String(row.installation_id),
    profileId: String(row.profile_id),
    ownerGeneration: Number(row.owner_generation),
    lineage: snapshot?.facts?.lineage,
    windowKey: snapshot?.facts?.reference?.windowKey,
  });
  return `ziwei|${createHash("sha256").update(canonical).digest("hex")}`;
}

export function admissionDecision(row: SchedulerRow, snapshot: any, value: Date):
  { allow: true; sendDeadline: string } | { allow: false; reason: string } {
  const at = value instanceof Date ? value : new Date(value);
  const start = new Date(snapshot?.facts?.reference?.validFrom);
  const end = new Date(snapshot?.facts?.reference?.validUntil);
  if (!Number.isFinite(at.valueOf()) || !Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf())
    || !payloadRuntime.realizedShichenWindow(snapshot?.facts?.reference)) {
    return { allow: false, reason: "snapshot_window_invalid" };
  }
  if (inQuietHours(localMinute(row.reference_timezone, at), Number(row.quiet_start), Number(row.quiet_end))) {
    return { allow: false, reason: "quiet_hours" };
  }
  if (at < start) return { allow: false, reason: "occurrence_not_started" };
  const sendDeadline = new Date(start.valueOf() + SEND_GRACE_MS);
  if (at >= sendDeadline) return { allow: false, reason: "late_occurrence" };
  if (end.valueOf() <= at.valueOf() + PROVIDER_QUEUE_MS) return { allow: false, reason: "provider_safety_window" };
  return { allow: true, sendDeadline: sendDeadline.toISOString() };
}

export function retryAfterSnapshotFailure(at: Date, error: unknown): Date {
  const code = error instanceof Error ? error.message : String(error || "");
  const delayMs = /ziwei_hourly_(?:timezone_transition_unsupported|ambiguous_reference_boundary)/u.test(code)
    ? 60 * 60_000
    : 2 * 60 * 60_000;
  return new Date(at.valueOf() + delayMs);
}

export function buildZiweiNotice(
  row: SchedulerRow,
  snapshot: any,
  occurrenceId: string,
  sendDeadline: string,
  backendCommit: string,
): any {
  if (!payloadRuntime.verifyZiweiHourlyNotificationSnapshot(snapshot)) throw new TypeError("ziwei_hourly_snapshot_invalid");
  if (snapshot.accountId !== row.user_id || snapshot.profile.id !== row.profile_id) {
    throw new TypeError("ziwei_hourly_owner_binding_invalid");
  }
  if (!/^[0-9a-f]{40}$/u.test(backendCommit)) throw new TypeError("ziwei_hourly_backend_commit_invalid");
  const payload = payloadRuntime.buildZiweiHourlyProviderData(snapshot);
  const historyCopies = delivery.localizedHistoryCopies(
    (locale: string) => payloadRuntime.buildZiweiHourlyCopy(locale, snapshot),
    ZIWEI_NOTIFICATION_LOCALES,
  );
  const requestedLocale = String(row.account_locale || "").trim().toLowerCase();
  const locale = ZIWEI_NOTIFICATION_LOCALES.includes(requestedLocale) ? requestedLocale : "en";
  const providerCopy = payloadRuntime.buildZiweiHourlyCopy(locale, snapshot);
  return Object.freeze({
    userId: row.user_id,
    key: occurrenceKey(row, snapshot),
    kind: "ziwei",
    ziweiOccurrenceId: occurrenceId,
    ...historyCopies.th,
    historyCopies,
    payload,
    sourceFacts: Object.freeze({
      accountId: row.user_id,
      profileId: row.profile_id,
      lineage: snapshot.facts.lineage,
      calculationVersion: snapshot.facts.calculationVersion,
      windowKey: snapshot.facts.reference.windowKey,
      snapshotDigest: snapshot.snapshotDigest,
      sourceDigest: SOURCE_DIGEST,
      backendCommit,
      eventEndAt: snapshot.facts.reference.validUntil,
      sendDeadline,
      ownerGeneration: Number(row.owner_generation),
    }),
    messages: Object.freeze([Object.freeze({
      tokenId: row.token_id,
      deviceToken: row.device_push_token,
      deviceTokenType: row.device_token_type,
      expoToken: row.expo_push_token,
      platform: row.platform,
      locale,
      category: "ziwei",
      ...providerCopy,
      url: "/ziwei/hourly",
      data: payload,
    })]),
  });
}

async function claimDue(db: Db, at: Date, limit: number): Promise<SchedulerRow[]> {
  const bounded = Math.max(1, Math.min(10_000, Number(limit) || BATCH));
  return (await db.query(
    "SELECT * FROM claim_mobile_ziwei_hourly_installations($1::timestamptz,$2::integer)",
    [at.toISOString(), bounded],
  )).rows;
}

async function loadClaimContext(db: Db, claim: SchedulerRow): Promise<SchedulerRow | null> {
  const result = await db.query(
    `SELECT i.*,t.id AS token_id,t.device_push_token,t.device_token_type,t.expo_push_token,t.platform,
            t.locale AS token_locale,t.ziwei_payload_schema,np.paused_until,
            CASE
              WHEN lower(COALESCE(NULLIF(btrim(to_jsonb(u)->>'locale'),''),NULLIF(btrim(np.locale),''),'th'))
                IN ('th','en','zh','cn','vi','ja','ru','ko','es')
              THEN lower(COALESCE(NULLIF(btrim(to_jsonb(u)->>'locale'),''),NULLIF(btrim(np.locale),''),'th'))
              ELSE 'th'
            END AS account_locale,
            p.name,p.nickname,
            to_char(p.birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_wall,
            p.birth_tz,p.birth_tz_source,p.birth_tz_confirmed_at,p.birth_lat,p.birth_lng,p.gender
       FROM mobile_ziwei_hourly_installations i
       JOIN mobile_notification_prefs np ON np.user_id=i.user_id
         AND np.ziwei_hourly_enabled=true AND np.ziwei_profile_id=i.profile_id
       JOIN mobile_push_tokens t ON t.user_id=i.user_id AND t.installation_id=i.installation_id
         AND t.enabled=true AND t.ziwei_payload_schema=2
       JOIN users u ON u.id=i.user_id AND u.deleted_at IS NULL AND u.is_active=true
       JOIN profiles p ON p.id=i.profile_id AND p.created_by_user_id=i.user_id
         AND p.birth_time_known=true AND COALESCE(p.is_archived,false)=false
         AND NULLIF(btrim(p.birth_tz),'') IS NOT NULL
         AND hourkey_birth_timezone_valid(p.birth_tz)
         AND hourkey_ziwei_birth_wall_eligible(p.birth_datetime,p.birth_tz)
         AND p.birth_tz_source IN ('user_confirmed_iana','user_confirmed_exact_offset','verified_import')
         AND p.birth_tz_confirmed_at IS NOT NULL
         AND p.gender IN ('M','F')
         AND (p.relationship_type IS NULL OR btrim(p.relationship_type)='')
      WHERE i.user_id=$1 AND i.installation_id=$2 AND i.lease_token=$3 AND i.enabled=true
      ORDER BY (t.id=i.installation_id) DESC,t.last_registered_at DESC NULLS LAST,t.updated_at DESC,t.id DESC
      LIMIT 1`,
    [claim.user_id, claim.installation_id, claim.lease_token],
  );
  return result.rows[0] || null;
}

function buildSnapshot(row: SchedulerRow, at: Date): any {
  const gender = row.gender === "M" || row.gender === "F" ? row.gender : null;
  if (!row.birth_wall || !row.birth_tz || !gender) {
    throw new TypeError("ziwei_hourly_profile_inputs_unavailable");
  }
  const canonicalContext = resolveCanonicalZiweiHourlyContext({
    mode: "strict",
    birthWallClock: row.birth_wall,
    birthTimezone: row.birth_tz,
    birthTimezoneSource: "profile",
    referenceInstant: at,
    referenceTimezone: row.reference_timezone,
  });
  if (canonicalContext.status !== "resolved"
    || canonicalContext.birthFingerprint !== row.birth_context_fingerprint) {
    throw new TypeError("ziwei_hourly_birth_context_mismatch");
  }
  const birthInstant = new Date(canonicalContext.birth.instant);
  const latitude = Number(row.birth_lat);
  const longitude = Number(row.birth_lng);
  const birthLocation = row.birth_lat != null && row.birth_lng != null
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { lat: latitude, lng: longitude }
    : null;
  const facts = buildZiweiHourlyNotificationFacts({
    birthInstant,
    birthTimezone: row.birth_tz,
    birthLocation,
    gender,
    referenceInstant: at,
    referenceTimezone: row.reference_timezone,
  });
  return payloadRuntime.buildZiweiHourlyNotificationSnapshot({
    accountId: row.user_id,
    profile: { id: row.profile_id, name: row.nickname || row.name || "", isSelf: true },
    facts,
  });
}

async function admitOccurrence(db: Db, row: SchedulerRow, snapshot: any, sendDeadline: string): Promise<any | null> {
  const key = occurrenceKey(row, snapshot);
  const reference = snapshot.facts.reference;
  const inserted = await db.query(
    `INSERT INTO mobile_ziwei_hourly_occurrences
       (user_id,installation_id,profile_id,owner_generation,occurrence_key,lineage,calculation_version,
        window_valid_from,window_valid_until,send_deadline,snapshot,snapshot_digest,state)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'claimed')
     ON CONFLICT DO NOTHING RETURNING id,snapshot,send_deadline,owner_generation`,
    [row.user_id, row.installation_id, row.profile_id, Number(row.owner_generation), key, snapshot.facts.lineage,
      snapshot.facts.calculationVersion, reference.validFrom, reference.validUntil, sendDeadline,
      JSON.stringify(snapshot), snapshot.snapshotDigest],
  );
  let persisted = inserted.rows[0] || null;
  if (!persisted) {
    persisted = (await db.query(
      `SELECT id,state,push_log_id,snapshot,send_deadline,owner_generation FROM mobile_ziwei_hourly_occurrences
        WHERE user_id=$1 AND installation_id=$2 AND profile_id=$3 AND owner_generation=$5 AND window_valid_from=$4`,
      [row.user_id, row.installation_id, row.profile_id, reference.validFrom, Number(row.owner_generation)],
    )).rows[0] || null;
    if (persisted?.state !== "claimed" || persisted.push_log_id !== null) return null;
  }
  if (Number(persisted.owner_generation) !== Number(row.owner_generation)
    || !payloadRuntime.verifyZiweiHourlyNotificationSnapshot(persisted.snapshot)
    || payloadRuntime.buildZiweiHourlyProviderData(persisted.snapshot).ziweiHourlyV2
      !== payloadRuntime.buildZiweiHourlyProviderData(snapshot).ziweiHourlyV2) return null;
  return Object.freeze({
    id: persisted.id,
    snapshot: persisted.snapshot,
    sendDeadline: new Date(persisted.send_deadline).toISOString(),
  });
}

async function finishClaim(db: Db, row: SchedulerRow, at: Date, next: Date, reason: string | null): Promise<void> {
  await db.query(
    `UPDATE mobile_ziwei_hourly_installations SET next_due_at=$4,last_skip_reason=$5,
       lease_token=NULL,lease_expires_at=NULL,updated_at=$6
      WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3`,
    [row.user_id, row.installation_id, row.lease_token, next.toISOString(), reason, at.toISOString()],
  );
}

async function skipOccurrence(db: Db, occurrenceId: string, reason: string, at: Date): Promise<void> {
  await db.query(
    `UPDATE mobile_ziwei_hourly_occurrences SET state='skipped',skip_reason=$2,updated_at=$3
      WHERE id=$1 AND state='claimed' AND push_log_id IS NULL`,
    [occurrenceId, reason, at.toISOString()],
  );
}

async function processClaim(db: Db, claim: SchedulerRow, at: Date, dependencies: Record<string, any>): Promise<any> {
  dependencies.signal?.throwIfAborted();
  const row = await loadClaimContext(db, claim);
  if (!row) {
    await db.query(
      `UPDATE mobile_ziwei_hourly_installations
          SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
              last_skip_reason='owner_or_capability_invalid',
              owner_generation=owner_generation+1,updated_at=$4
        WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3`,
      [claim.user_id, claim.installation_id, claim.lease_token, at.toISOString()],
    );
    return { reserved: 0, skipped: 1, reason: "owner_or_capability_invalid" };
  }
  let snapshot;
  try { snapshot = (dependencies.buildSnapshot || buildSnapshot)(row, at); }
  catch (error) {
    const next = retryAfterSnapshotFailure(at, error);
    await finishClaim(db, row, at, next, "profile_or_boundary_unsupported");
    return { reserved: 0, skipped: 1, reason: "profile_or_boundary_unsupported" };
  }
  const next = new Date(snapshot.facts.reference.validUntil);
  if (!Number.isFinite(next.valueOf()) || next <= at) throw new Error("ziwei_hourly_next_due_unavailable");
  if (row.paused_until && new Date(row.paused_until) > at) {
    await finishClaim(db, row, at, next, "paused");
    return { reserved: 0, skipped: 1, reason: "paused" };
  }
  const admission = admissionDecision(row, snapshot, at);
  if (!admission.allow) {
    await finishClaim(db, row, at, next, admission.reason);
    return { reserved: 0, skipped: 1, reason: admission.reason };
  }
  const admit = dependencies.admitOccurrence || admitOccurrence;
  const admitted = await admit(db, row, snapshot, admission.sendDeadline);
  if (!admitted) {
    await finishClaim(db, row, at, next, "duplicate");
    return { reserved: 0, skipped: 1, reason: "duplicate" };
  }
  const persistedAdmission = admissionDecision(row, admitted.snapshot, at);
  if (!persistedAdmission.allow || persistedAdmission.sendDeadline !== admitted.sendDeadline) {
    const reason = persistedAdmission.allow ? "persisted_deadline_mismatch" : persistedAdmission.reason;
    await skipOccurrence(db, admitted.id, reason, at);
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }
  const notice = buildZiweiNotice(row, admitted.snapshot, admitted.id, admitted.sendDeadline, dependencies.backendCommit);
  const result = await (dependencies.deliver || delivery.deliver)(db, notice, { defer: true });
  const reserved = result?.status === "pending" ? 1 : 0;
  const reason = reserved ? null : result?.status === "duplicate" ? "duplicate" : "delivery_reservation_failed";
  if (!reserved) await skipOccurrence(db, admitted.id, reason, at);
  await finishClaim(db, row, at, next, reason);
  return { reserved, skipped: reserved ? 0 : 1, reason };
}

async function releaseClaims(db: Db, claims: SchedulerRow[], at: Date): Promise<void> {
  if (claims.length === 0) return;
  await db.query(
    `WITH claimed AS (
       SELECT * FROM unnest($1::uuid[],$2::uuid[],$3::uuid[])
         AS item(user_id,installation_id,lease_token)
     ) UPDATE mobile_ziwei_hourly_installations i
          SET lease_token=NULL,lease_expires_at=NULL,updated_at=$4
         FROM claimed c WHERE i.user_id=c.user_id AND i.installation_id=c.installation_id
           AND i.lease_token=c.lease_token`,
    [claims.map((row) => row.user_id), claims.map((row) => row.installation_id),
      claims.map((row) => row.lease_token), at.toISOString()],
  );
}

async function forEachBounded(items: SchedulerRow[], concurrency: number, handler: (item: SchedulerRow) => Promise<void>): Promise<void> {
  let cursor = 0;
  let firstFailure: unknown;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (cursor < items.length && firstFailure === undefined) {
      const index = cursor++;
      try { await handler(items[index]); } catch (error) { firstFailure ??= error; }
    }
  }));
  if (firstFailure !== undefined) throw firstFailure;
}

export async function runScheduler(db: Db, signal: AbortSignal, at = new Date(), dependencies: Record<string, any> = {}): Promise<any> {
  signal.throwIfAborted();
  const sourceManifestReady = dependencies.sourceManifestReady ?? verifyRuntimeSourceManifest();
  const producerResult = await db.query(
    "SELECT producer_enabled,source_digest,backend_commit FROM mobile_ziwei_hourly_producer_state WHERE singleton=true",
  );
  const producer = producerResult.rows[0];
  const runtimeProducerEnabled = dependencies.runtimeProducerEnabled
    ?? process.env.ZIWEI_HOURLY_PRODUCER_ENABLED === "1";
  const runtimeCommit = dependencies.backendCommit ?? process.env.HOURKEY_RELEASE_COMMIT ?? "";
  if (sourceManifestReady !== true || runtimeProducerEnabled !== true || producer?.producer_enabled !== true
    || producer?.source_digest !== SOURCE_DIGEST || !/^[0-9a-f]{40}$/u.test(runtimeCommit)
    || producer?.backend_commit !== runtimeCommit) {
    return { disabled: true, due: 0, reserved: 0, skipped: 0 };
  }
  const batch = Math.max(1, Math.min(1_000, Number(dependencies.batchLimit) || BATCH));
  const maximum = Math.max(1, Math.min(10_000, Number(dependencies.maxPerRun) || MAX_PER_RUN));
  const workers = Math.max(1, Math.min(20, Number(dependencies.workerCount) || WORKERS));
  const report = { disabled: false, due: 0, reserved: 0, skipped: 0 };
  while (report.due < maximum) {
    signal.throwIfAborted();
    const claims = await claimDue(db, at, Math.min(batch, maximum - report.due));
    if (claims.length === 0) break;
    report.due += claims.length;
    try {
      await forEachBounded(claims, workers, async (claim) => {
        const result = await (dependencies.processClaim || processClaim)(db, claim, at, {
          ...dependencies, backendCommit: runtimeCommit, signal,
        });
        report.reserved += result.reserved;
        report.skipped += result.skipped;
      });
    } finally { await releaseClaims(db, claims, at); }
    if (claims.length < batch) break;
  }
  return report;
}

async function main(): Promise<void> {
  loadEnv();
  const db = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db",
    user: process.env.PGUSER || "decode_user",
    password: process.env.PGPASSWORD,
    max: WORKERS + 4,
  });
  try {
    const leased = await delivery.withSchedulerRunLease(
      db,
      "ziwei-hourly",
      (signal: AbortSignal) => runScheduler(db, signal),
      { timeoutMs: 50_000 },
    );
    if (!leased.acquired) return;
    const report = leased.result;
    console.log(`[mobile-ziwei-hourly-push] disabled=${report.disabled} due=${report.due} reserved=${report.reserved} skipped=${report.skipped}`);
    await writeSchedulerHeartbeat("ziwei-hourly");
  } finally { await db.end(); }
}

export function isDirectExecution(moduleUrl: string, invokedPath: string | undefined): boolean {
  if (!invokedPath) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(invokedPath);
  } catch {
    return moduleUrl === pathToFileURL(invokedPath).href;
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch(() => {
    console.error("[mobile-ziwei-hourly-push] error_code=scheduler_failed");
    process.exit(1);
  });
}
