#!/usr/bin/env node
"use strict";

const {
  closeSync, constants, accessSync, existsSync, fstatSync, lstatSync, openSync,
  readFileSync, readlinkSync, readSync, readdirSync, realpathSync, statSync,
} = require("node:fs");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const pg = require("pg");
const {
  inspectInstalledEnvironment, readInstalledEnvironment,
} = require("./derive-hourkey-notification-env.cjs");

function canAccess(access, target, mode) {
  try { access(target, mode); return true; } catch { return false; }
}

function rootExists(lookupUser) {
  try { return lookupUser("root") === true; } catch { return false; }
}

function defaultServiceUserAccess(name, target, mode) {
  const flag = mode === constants.X_OK ? "-x" : mode === constants.W_OK ? "-w" : "-r";
  try {
    execFileSync("runuser", ["-u", name, "--", "/usr/bin/test", flag, target], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasStateDirectoryContract(readUnit, releaseRoot = "/root/releases/current") {
  try {
    const source = readUnit(join(releaseRoot,"ops/tmpfiles.d/hourkey-notification.conf"), "utf8");
    return /^d \/var\/lib\/hourkey-notification 0750 hourkey-notify hourkey-notify -$/m.test(source)
      && /^d \/var\/lib\/hourkey-notification\/schedulers 0750 hourkey-notify hourkey-notify -$/m.test(source);
  } catch {
    return false;
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const R8_RUNTIME_FILES = Object.freeze([
  "migrations/20260904_mobile_science_notifications_r8.rollback.sql",
  "migrations/20260904_mobile_science_notifications_r8.sql",
  "scripts/mobile-astronomy-fact-shadow-cron.mts",
  "scripts/lib/notification-r8-soak.mts",
  "scripts/notification-health.cjs",
  "scripts/notification-observability-preflight.cjs",
  "src/app/api/account/delete/route.ts",
  "src/app/api/mobile/v1/account/delete/route.ts",
  "src/app/api/mobile/v1/astronomy-facts/[occurrenceId]/route.ts",
  "src/app/api/mobile/v1/astronomy-facts/route.ts",
  "src/app/api/mobile/v1/notifications/route.ts",
  "src/app/api/mobile/v1/push/route.ts",
  "src/app/api/mobile/v1/qizheng/notification-detail/[occurrenceId]/route.ts",
  "src/lib/astro/astronomy-fact-r8.ts",
  "src/lib/astro/astronomy-fact-model-attestation.ts",
  "src/lib/astro/notification-r8-contract.ts",
  "src/lib/astro/qizheng/electional-source-manifest.ts",
  "src/lib/mobile-push-registration-readiness.cjs",
  "src/lib/mobile-science-notification-detail-r8.ts",
  "src/lib/mobile-science-shadow-r8.ts",
  "src/lib/notification-payload.cjs",
]);

const R8_EXCLUSIVE_ARTIFACTS = Object.freeze([
  "migrations/20260904_mobile_science_notifications_r8.rollback.sql",
  "migrations/20260904_mobile_science_notifications_r8.sql",
  "scripts/mobile-astronomy-fact-shadow-cron.mts",
  "scripts/lib/notification-r8-soak.mts",
  "src/app/api/mobile/v1/astronomy-facts/[occurrenceId]/route.ts",
  "src/app/api/mobile/v1/astronomy-facts/route.ts",
  "src/app/api/mobile/v1/qizheng/notification-detail/[occurrenceId]/route.ts",
  "src/lib/astro/astronomy-fact-r8.ts",
  "src/lib/astro/astronomy-fact-model-attestation.ts",
  "src/lib/astro/notification-r8-contract.ts",
  "src/lib/astro/qizheng/electional-source-manifest.ts",
  "src/lib/mobile-science-notification-detail-r8.ts",
  "src/lib/mobile-science-shadow-r8.ts",
]);

// This is the only tracked file allowed to differ from applicationCommit: it is
// populated with the five post-build review signatures after that immutable
// application commit has been built. Every other tracked blob must be present
// in the installed release and match the application commit byte-for-byte.
const R8_POST_APPLICATION_EVIDENCE_FILE = "docs/notification-science/qizheng-r8-release-evidence.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function computeRuntimeDigest(root, files = R8_RUNTIME_FILES) {
  const records = files.map((path) => `${path}\0${sha256(readFileSync(join(root,path)))}\n`).join("");
  return sha256(records);
}

function computeBuildArtifactDigest(root) {
  const artifactRoot = join(root,".next");
  if (lstatSync(artifactRoot).isSymbolicLink() || realpathSync(artifactRoot) !== artifactRoot) {
    throw new Error("build artifact root must be canonical");
  }
  const buildId = readFileSync(join(artifactRoot,"BUILD_ID"),"utf8").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(buildId)) throw new Error("invalid Next build ID");
  const buildIdBytes = Buffer.from(buildId);
  const normalizedBuildId = Buffer.from("<BUILD_ID>");
  const normalizeBytes = (value) => {
    const chunks = [];
    let offset = 0;
    let found;
    while ((found = value.indexOf(buildIdBytes,offset)) >= 0) {
      chunks.push(value.subarray(offset,found),normalizedBuildId);
      offset = found + buildIdBytes.length;
    }
    chunks.push(value.subarray(offset));
    return Buffer.concat(chunks);
  };
  const records = [];
  const visit = (directory,prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory,name);
      const relativePath = prefix ? join(prefix,name) : name;
      if (relativePath === "trace" || relativePath === "trace-build") continue;
      const normalizedPath = relativePath.replaceAll(buildId,"<BUILD_ID>");
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) {
        const target = readlinkSync(path);
        const match = /^\.\.\/\.\.\/node_modules\/(pg|sharp)$/u.exec(target);
        if (!match) throw new Error("unexpected build artifact symlink");
        const resolved = realpathSync(path);
        const expected = realpathSync(join(root,"node_modules",match[1]));
        if (resolved !== expected || !statSync(resolved).isDirectory()) {
          throw new Error("build artifact dependency link escaped its pinned package");
        }
        records.push(`${normalizedPath}\0link\0${target.replaceAll(buildId,"<BUILD_ID>")}\n`);
        visit(resolved,relativePath);
      } else if (stats.isDirectory()) visit(path,relativePath);
      else if (stats.isFile()) records.push(`${normalizedPath}\0file\0${sha256(normalizeBytes(readFileSync(path)))}\n`);
      else throw new Error("unsupported build artifact entry");
    }
  };
  visit(artifactRoot);
  return sha256(records.join(""));
}

function resolveCommitTree(root, commit, sourceRepository) {
  const repositories = [root,sourceRepository,"/root/decode-app"].filter(Boolean);
  for (const repository of repositories) {
    try {
      return execFileSync("git", ["-C",repository,"rev-parse",`${commit}^{tree}`], {
        encoding: "utf8", stdio: ["ignore","pipe","ignore"],
      }).trim();
    } catch {}
  }
  return null;
}

function computeInstalledSourceDigest(root, commit, sourceRepository) {
  const repositories = [root,sourceRepository,"/root/decode-app"].filter(Boolean);
  for (const repository of repositories) {
    try {
      const raw = execFileSync("git", ["-C",repository,"ls-tree","-r","-z",commit], {
        encoding: "buffer", stdio: ["ignore","pipe","ignore"],
      });
      const entries = Buffer.from(raw).toString("utf8").split("\0").filter(Boolean).map((record) => {
        const match = /^(100644|100755) blob [0-9a-f]{40}\t(.+)$/u.exec(record);
        if (!match) throw new Error("unsupported tracked source entry");
        return { mode: match[1], path: match[2] };
      }).filter(({ path }) => path !== R8_POST_APPLICATION_EVIDENCE_FILE)
        .sort((left,right) => Buffer.compare(Buffer.from(left.path),Buffer.from(right.path)));
      const expected = new Set(entries.map(({ path }) => path));
      const generatedTopLevel = new Set([".git",".next","node_modules",".release-commit","tsconfig.tsbuildinfo"]);
      const visit = (directory, relativeRoot = "") => {
        for (const name of readdirSync(directory).sort((left,right) => Buffer.compare(Buffer.from(left),Buffer.from(right)))) {
          const relativePath = relativeRoot ? join(relativeRoot,name) : name;
          if (!relativeRoot && generatedTopLevel.has(name)) continue;
          if (relativePath === R8_POST_APPLICATION_EVIDENCE_FILE) continue;
          const target = join(directory,name);
          const stats = lstatSync(target);
          if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
            throw new Error("installed source contains an unsupported entry");
          }
          if (stats.isDirectory()) visit(target,relativePath);
          else if (!expected.has(relativePath)) throw new Error("installed source contains an unexpected file");
        }
      };
      visit(root);
      const hashRegularFile = (target) => {
        const before = lstatSync(target,{ bigint: true });
        if (!before.isFile() || before.isSymbolicLink()) throw new Error("installed source entry is not regular");
        const noFollow = constants.O_NOFOLLOW || 0;
        const fd = openSync(target,constants.O_RDONLY | noFollow);
        try {
          const opened = fstatSync(fd,{ bigint: true });
          if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
            throw new Error("installed source entry changed before hashing");
          }
          const digest = createHash("sha256");
          const buffer = Buffer.allocUnsafe(1024 * 1024);
          let offset = 0;
          while (offset < Number(opened.size)) {
            const count = readSync(fd,buffer,0,Math.min(buffer.length,Number(opened.size) - offset),offset);
            if (count <= 0) throw new Error("installed source entry ended while hashing");
            digest.update(buffer.subarray(0,count));
            offset += count;
          }
          const after = fstatSync(fd,{ bigint: true });
          const visible = lstatSync(target,{ bigint: true });
          if (opened.dev !== after.dev || opened.ino !== after.ino || opened.size !== after.size
              || after.dev !== visible.dev || after.ino !== visible.ino || after.size !== visible.size) {
            throw new Error("installed source entry changed while hashing");
          }
          return digest.digest("hex");
        } finally { closeSync(fd); }
      };
      const records = entries.map(({ mode,path }) => {
        const target = join(root,path);
        const stats = lstatSync(target);
        const executable = (stats.mode & 0o111) !== 0;
        if ((mode === "100755") !== executable) throw new Error("installed source mode mismatch");
        return `${mode}\0${path}\0${hashRegularFile(target)}\n`;
      }).join("");
      return sha256(records);
    } catch {}
  }
  return null;
}

function computeR8SchemaDefinitionDigest(rows) {
  const normalized = [...rows].map((row) => ({
    kind: String(row.kind || ""), name: String(row.name || ""), definition: String(row.definition || ""),
  })).sort((left,right) => `${left.kind}\0${left.name}`.localeCompare(`${right.kind}\0${right.name}`));
  return sha256(canonicalJson(normalized));
}

function readR8Bundle(target, read = readFileSync) {
  try {
    const evidence = JSON.parse(read(target,"utf8"));
    return evidence && typeof evidence.bundle === "object" ? evidence.bundle : null;
  } catch { return null; }
}

function inspectR8HardOffEvidence(target, options = {}) {
  const read = options.readFile || readFileSync;
  const requireSignatures = options.requireSignatures !== false;
  try {
    const evidence = JSON.parse(read(target, "utf8"));
    const bundleDigest = createHash("sha256").update(canonicalJson(evidence.bundle)).digest("hex");
    const signatures = Array.isArray(evidence.signatures) ? evidence.signatures : [];
    const signatureIds = new Set(signatures.map((signature) => signature?.reviewerId));
    const requiredDimensions = new Set([
      "science_source_integrity",
      "mobile_lifecycle_locale_privacy",
      "backend_migration_delivery",
      "scale_observability_rollback",
      "red_team_cross_science",
    ]);
    const signatureDimensions = new Set(signatures.map((signature) => signature?.dimension));
    const signaturesValid = signatures.length === 5 && signatureIds.size === 5
      && signatureDimensions.size === requiredDimensions.size
      && signatures.every((signature) => signature?.verdict === "PASS"
        && requiredDimensions.has(signature?.dimension)
        && signature?.bundleDigest === bundleDigest
        && signature?.backendCommit === evidence.bundle?.backend?.applicationCommit
        && signature?.mobileCommit === evidence.bundle?.mobile?.applicationCommit
        && Array.isArray(signature?.findings?.critical)
        && signature.findings.critical.length === 0
        && Array.isArray(signature?.findings?.important)
        && signature.findings.important.length === 0
        && Array.isArray(signature?.findings?.minor)
        && Array.isArray(signature?.testEvidence)
        && signature.testEvidence.length > 0
        && typeof signature?.reviewedAt === "string"
        && Number.isFinite(new Date(signature.reviewedAt).valueOf()));
    const hardOff = evidence?.bundle?.releaseMode === "hard_off"
      && evidence?.bundle?.science?.astronomyFact?.providerSendEnabled === false
      && evidence?.bundle?.science?.qizheng?.providerSendEnabled === false
      && evidence?.bundle?.science?.qizheng?.payloadSchema === 0
      && evidence?.bundle?.science?.qizheng?.sourceStatus === "pending_double_verification"
      && evidence?.bundle?.providerAttempts === 0;
    const ok = evidence?.schema === 1 && evidence?.bundleDigest === bundleDigest
      && hardOff && (!requireSignatures || signaturesValid);
    return { ok, bundleDigestValid: evidence?.bundleDigest === bundleDigest, hardOff,
      signaturesValid: requireSignatures ? signaturesValid : signatures.length === 0 || signaturesValid };
  } catch {
    return { ok: false, bundleDigestValid: false, hardOff: false, signaturesValid: false };
  }
}

function emptyR8DatabaseProof() {
  return {
    r8MigrationApplied: false, r8SchemaComplete: false, r8ProducerRowsExact: false,
    r8SchemaDefinitionDigestMatches: false,
    r8SchemaDefinitionDigest: null,
    r8SourceDigestsMatch: false, r8HardOff: false, r8RuntimeTablesReadOnly: false,
    r8PublicMutationDenied: false, r8ScopedFunctionsExecutable: false,
    r8ScopedFunctionsHardened: false,
  };
}

function emptyDatabaseProof(r8Required = false) {
  const proof = {
    databaseConnected: false, exactRuntimeRole: false, producerReadOnly: false,
    ziweiParentUpdate: false, ziweiAttemptUpdate: false, ziweiParentDeleteGuarded: false,
    ziweiOccurrenceDeleteDenied: false, ziweiInstallationDeleteDenied: false,
    ziweiUserDeleteDenied: false, ziweiProfileDeleteDenied: false,
    ziweiPurgeExecutable: false, ziweiPurgeHardened: false,
    ziweiIntegrityTriggers: false,
  };
  return r8Required ? { ...proof, ...emptyR8DatabaseProof() } : proof;
}

async function inspectDatabaseAccess(options = {}) {
  const r8Required = options.r8Required === true;
  const environment = options.environment || readInstalledEnvironment();
  if (!environment || environment.PGUSER !== "hourkey_app") return emptyDatabaseProof(r8Required);
  let client;
  try {
    if (options.connect) client = await options.connect(environment);
    else {
      client = new pg.Client({
        host: environment.PGHOST, port: Number(environment.PGPORT),
        database: environment.PGDATABASE, user: environment.PGUSER,
        password: environment.PGPASSWORD,
      });
      await client.connect();
    }
    const result = await client.query(
      `SELECT current_user='hourkey_app' AND session_user='hourkey_app' AS exact_runtime_role,
              has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','SELECT')
                AND NOT has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','UPDATE')
                AND NOT has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','INSERT')
                AND NOT has_table_privilege(current_user,'mobile_ziwei_hourly_producer_state','DELETE') AS producer_read_only,
              has_table_privilege(current_user,'mobile_push_log','UPDATE') AS ziwei_parent_update,
              has_table_privilege(current_user,'mobile_push_attempts','UPDATE') AS ziwei_attempt_update,
              has_table_privilege(current_user,'mobile_push_log','DELETE')
                AND EXISTS(
                  SELECT 1 FROM pg_catalog.pg_trigger t
                  JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
                  JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
                   WHERE c.oid='mobile_push_log'::regclass
                     AND t.tgname='mobile_ziwei_push_parent_integrity'
                     AND t.tgenabled='O' AND NOT t.tgisinternal
                     AND (t.tgtype::integer & 8)=8
                     AND position('mobile_ziwei_hourly_occurrences' IN p.prosrc)>0
                     AND position('interval ''180 days''' IN p.prosrc)>0
                ) AS ziwei_parent_delete_guarded,
              NOT has_table_privilege(current_user,'mobile_ziwei_hourly_occurrences','DELETE')
                AS ziwei_occurrence_delete_denied,
              NOT has_table_privilege(current_user,'mobile_ziwei_hourly_installations','DELETE')
                AS ziwei_installation_delete_denied,
              NOT has_table_privilege(current_user,'public.users','DELETE')
                AS ziwei_user_delete_denied,
              NOT has_table_privilege(current_user,'public.profiles','DELETE')
                AS ziwei_profile_delete_denied,
              EXISTS(
                SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid=pg_catalog.to_regprocedure(
                   'public.purge_mobile_ziwei_hourly_occurrences(integer,integer)'
                 ) AND has_function_privilege(current_user,p.oid,'EXECUTE')
              ) AS ziwei_purge_executable,
              EXISTS(
                SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid=pg_catalog.to_regprocedure(
                   'public.purge_mobile_ziwei_hourly_occurrences(integer,integer)'
                 )
                   AND p.prosecdef=true
                   AND pg_catalog.pg_get_userbyid(p.proowner)<>current_user
                   AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
                   AND NOT EXISTS(
                     SELECT 1
                       FROM pg_catalog.aclexplode(
                         COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))
                       ) acl
                      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
                   )
              ) AS ziwei_purge_hardened,
              (SELECT count(*)=4 FROM pg_catalog.pg_trigger t
                JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
               WHERE t.tgenabled='O' AND NOT t.tgisinternal AND (
                 (c.oid='mobile_ziwei_hourly_producer_state'::regclass
                   AND t.tgname='mobile_ziwei_hourly_producer_mutation_gate')
                 OR (c.oid='mobile_push_log'::regclass
                   AND t.tgname='mobile_ziwei_push_parent_integrity')
                 OR (c.oid='mobile_push_attempts'::regclass
                   AND t.tgname='mobile_ziwei_push_attempt_integrity')
                 OR (c.oid='mobile_ziwei_hourly_occurrences'::regclass
                   AND t.tgname='mobile_ziwei_hourly_occurrence_immutable')
               )) AS ziwei_integrity_triggers`,
    );
    const row = result.rows[0] || {};
    const legacyProof = {
      databaseConnected: true,
      exactRuntimeRole: row.exact_runtime_role === true,
      producerReadOnly: row.producer_read_only === true,
      ziweiParentUpdate: row.ziwei_parent_update === true,
      ziweiAttemptUpdate: row.ziwei_attempt_update === true,
      ziweiParentDeleteGuarded: row.ziwei_parent_delete_guarded === true,
      ziweiOccurrenceDeleteDenied: row.ziwei_occurrence_delete_denied === true,
      ziweiInstallationDeleteDenied: row.ziwei_installation_delete_denied === true,
      ziweiUserDeleteDenied: row.ziwei_user_delete_denied === true,
      ziweiProfileDeleteDenied: row.ziwei_profile_delete_denied === true,
      ziweiPurgeExecutable: row.ziwei_purge_executable === true,
      ziweiPurgeHardened: row.ziwei_purge_hardened === true,
      ziweiIntegrityTriggers: row.ziwei_integrity_triggers === true,
    };
    if (!r8Required) return legacyProof;

    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tableNames = [
      "mobile_science_notification_producer_state",
      "mobile_science_notification_subscriptions",
      "mobile_science_notification_shadow_cohort",
      "mobile_science_notification_chains",
      "mobile_science_notification_endpoints",
      "mobile_science_notification_occurrences",
    ];
    const relations = await client.query(
      `SELECT name,pg_catalog.to_regclass('public.'||name)::text AS relation
         FROM unnest($1::text[]) AS names(name)`,
      [tableNames],
    );
    const r8MigrationApplied = relations.rows.length === tableNames.length
      && relations.rows.every((entry) => typeof entry.relation === "string");
    if (!r8MigrationApplied) {
      await client.query("COMMIT");
      return { ...legacyProof, ...emptyR8DatabaseProof() };
    }
    const r8Result = await client.query(
      `WITH required_columns(table_name,column_name) AS (VALUES
          ('mobile_science_notification_producer_state','source_digest'),
          ('mobile_science_notification_producer_state','provider_send_enabled'),
          ('mobile_science_notification_producer_state','last_shadow_run_at'),
          ('mobile_science_notification_subscriptions','consent_generation'),
          ('mobile_science_notification_subscriptions','profile_revision'),
          ('mobile_science_notification_shadow_cohort','approved_at'),
          ('mobile_science_notification_chains','primary_token_id'),
          ('mobile_science_notification_chains','lifecycle_state'),
          ('mobile_science_notification_chains','target_revision'),
          ('mobile_science_notification_endpoints','audience_binding'),
          ('mobile_science_notification_endpoints','primary_endpoint'),
          ('mobile_science_notification_occurrences','identity_hash'),
          ('mobile_science_notification_occurrences','result_revision_hash'),
          ('mobile_science_notification_occurrences','snapshot_digest')
        ), runtime_tables(name) AS (VALUES
          ('mobile_science_notification_producer_state'),
          ('mobile_science_notification_subscriptions'),
          ('mobile_science_notification_shadow_cohort'),
          ('mobile_science_notification_chains'),
          ('mobile_science_notification_endpoints'),
          ('mobile_science_notification_occurrences')
        ), scoped_functions(signature) AS (VALUES
          ('hourkey_r8_remove_transferred_bindings(uuid,uuid,text,text)'),
          ('hourkey_r8_rebind_primary_token(uuid,uuid,uuid,text)'),
          ('hourkey_r8_revoke_delivery_scope(uuid,uuid)'),
          ('hourkey_r8_record_astronomy_shadow_occurrence(uuid,text,bytea,bytea,bytea,bigint,text,text,jsonb,text,timestamp with time zone,timestamp with time zone,text)'),
          ('hourkey_r8_mark_astronomy_shadow_run(timestamp with time zone,integer,text)')
        )
       SELECT
        (SELECT count(*)=(SELECT count(*) FROM required_columns)
           FROM required_columns required
           JOIN information_schema.columns actual USING(table_name,column_name)
          WHERE actual.table_schema='public')
        AND pg_catalog.to_regclass('public.ux_mobile_push_tokens_astronomy_fact_audience') IS NOT NULL
        AND pg_catalog.to_regclass('public.ux_mobile_science_notification_primary_endpoint') IS NOT NULL
        AND pg_catalog.to_regclass('public.ix_mobile_science_notification_occurrence_chain_created') IS NOT NULL
        AND pg_catalog.to_regclass('public.ix_mobile_science_notification_occurrence_scheduled') IS NOT NULL
        AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid='mobile_science_notification_chains'::regclass
          AND t.tgname='mobile_science_notification_chain_owner' AND t.tgenabled='O' AND NOT t.tgisinternal)
        AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid='mobile_science_notification_occurrences'::regclass
          AND t.tgname='mobile_science_notification_occurrence_immutable' AND t.tgenabled='O' AND NOT t.tgisinternal)
          AS r8_schema_complete,
        (SELECT count(*)=5 FROM mobile_science_notification_producer_state)
        AND (SELECT count(*)=5 FROM mobile_science_notification_producer_state
          WHERE (science_id='astronomy_fact' AND submode='civil_two_hour' AND schema_version=1)
             OR (science_id='qizheng' AND schema_version=0
                 AND submode IN ('electional_window','rule_event','solar_month','annual_limit')))
          AS r8_producer_rows_exact,
        EXISTS(SELECT 1 FROM mobile_science_notification_producer_state
          WHERE science_id='astronomy_fact' AND submode='civil_two_hour' AND schema_version=1
            AND source_digest=$1 AND evidence_complete=true)
        AND (SELECT count(*)=4 FROM mobile_science_notification_producer_state
          WHERE science_id='qizheng' AND schema_version=0 AND source_digest=$2
            AND evidence_complete=false
            AND submode IN ('electional_window','rule_event','solar_month','annual_limit'))
          AS r8_source_digests_match,
        NOT EXISTS(SELECT 1 FROM mobile_science_notification_producer_state WHERE provider_send_enabled)
        AND NOT EXISTS(SELECT 1 FROM mobile_science_notification_subscriptions WHERE enabled)
        AND NOT EXISTS(SELECT 1 FROM mobile_science_notification_chains WHERE active)
        AND NOT EXISTS(SELECT 1 FROM mobile_science_notification_producer_state
          WHERE science_id='qizheng' AND (schema_version<>0 OR evidence_complete OR provider_send_enabled))
        AND NOT EXISTS(SELECT 1 FROM mobile_push_tokens WHERE qizheng_payload_schema<>0)
          AS r8_hard_off,
        (SELECT bool_and(
          has_table_privilege(current_user,'public.'||name,'SELECT')
          AND NOT has_table_privilege(current_user,'public.'||name,'INSERT')
          AND NOT has_table_privilege(current_user,'public.'||name,'UPDATE')
          AND NOT has_table_privilege(current_user,'public.'||name,'DELETE')
          AND NOT has_table_privilege(current_user,'public.'||name,'TRUNCATE')
          AND NOT has_table_privilege(current_user,'public.'||name,'REFERENCES')
          AND NOT has_table_privilege(current_user,'public.'||name,'TRIGGER')) FROM runtime_tables)
          AS r8_runtime_tables_read_only,
        NOT EXISTS(
          SELECT 1 FROM runtime_tables r
          JOIN pg_catalog.pg_class c ON c.oid=('public.'||r.name)::regclass
          CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
          AS r8_public_mutation_denied,
        (SELECT count(*)=5 FROM scoped_functions f
          JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(f.signature)
          WHERE has_function_privilege(current_user,p.oid,'EXECUTE'))
          AS r8_scoped_functions_executable,
        (SELECT count(*)=5 FROM scoped_functions f
          JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(f.signature)
          WHERE p.prosecdef=true AND pg_catalog.pg_get_userbyid(p.proowner)<>current_user
            AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
            AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
          AS r8_scoped_functions_hardened`,
      [String(options.expectedModelDigest || ""),String(options.expectedSourceDigest || "")],
    );
    const r8 = r8Result.rows[0] || {};
    const schemaDefinitions = await client.query(
      `SELECT 'column'::text AS kind,
              c.table_name||'.'||c.column_name AS name,
              concat_ws('|',c.data_type,c.udt_schema,c.udt_name,c.is_nullable,
                COALESCE(c.column_default,''),COALESCE(c.character_maximum_length::text,''),
                COALESCE(c.numeric_precision::text,''),COALESCE(c.numeric_scale::text,''),
                COALESCE(c.datetime_precision::text,''),COALESCE(c.collation_schema,''),
                COALESCE(c.collation_name,''),c.is_identity,COALESCE(c.identity_generation,''),
                COALESCE(c.identity_start,''),COALESCE(c.identity_increment,''),
                COALESCE(c.identity_maximum,''),COALESCE(c.identity_minimum,''),
                COALESCE(c.identity_cycle,''),c.is_generated,COALESCE(c.generation_expression,'')) AS definition
         FROM information_schema.columns c
        WHERE c.table_schema='public' AND (
          c.table_name IN ('mobile_science_notification_producer_state','mobile_science_notification_subscriptions',
            'mobile_science_notification_shadow_cohort','mobile_science_notification_chains',
            'mobile_science_notification_endpoints','mobile_science_notification_occurrences')
          OR (c.table_name='mobile_push_tokens' AND c.column_name IN
            ('astronomy_fact_payload_schema','astronomy_fact_audience_binding','qizheng_payload_schema')))
       UNION ALL
       SELECT 'constraint',cl.relname||'.'||co.conname,
              co.contype::text||'|'||co.condeferrable::text||'|'||co.condeferred::text||'|'||
                co.convalidated::text||'|'||pg_catalog.pg_get_constraintdef(co.oid,true)
         FROM pg_catalog.pg_constraint co JOIN pg_catalog.pg_class cl ON cl.oid=co.conrelid
         JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
        WHERE ns.nspname='public' AND cl.relname IN ('mobile_science_notification_producer_state','mobile_science_notification_subscriptions',
          'mobile_science_notification_shadow_cohort','mobile_science_notification_chains',
          'mobile_science_notification_endpoints','mobile_science_notification_occurrences','mobile_push_tokens')
          AND (cl.relname<>'mobile_push_tokens' OR co.conname LIKE '%astronomy_fact%' OR co.conname LIKE '%qizheng%')
       UNION ALL
       SELECT 'index',cl.relname||'.'||idx.relname,
              i.indisunique::text||'|'||i.indisprimary::text||'|'||i.indisvalid::text||'|'||
                i.indisready::text||'|'||i.indislive::text||'|'||pg_catalog.pg_get_indexdef(idx.oid)
         FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class cl ON cl.oid=i.indrelid
         JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
         JOIN pg_catalog.pg_namespace table_ns ON table_ns.oid=cl.relnamespace
         JOIN pg_catalog.pg_namespace index_ns ON index_ns.oid=idx.relnamespace
        WHERE table_ns.nspname='public' AND index_ns.nspname='public' AND (cl.relname IN ('mobile_science_notification_producer_state','mobile_science_notification_subscriptions',
          'mobile_science_notification_shadow_cohort','mobile_science_notification_chains',
          'mobile_science_notification_endpoints','mobile_science_notification_occurrences')
          OR idx.relname IN ('ux_mobile_push_tokens_astronomy_fact_audience','ux_mobile_push_tokens_r8_id_audience'))
       UNION ALL
       SELECT 'trigger',cl.relname||'.'||t.tgname,t.tgenabled::text||'|'||pg_catalog.pg_get_triggerdef(t.oid,true)
         FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class cl ON cl.oid=t.tgrelid
         JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
        WHERE ns.nspname='public' AND NOT t.tgisinternal AND cl.relname IN
          ('mobile_science_notification_chains','mobile_science_notification_occurrences')
       UNION ALL
       SELECT 'function',p.oid::regprocedure::text,
              p.prosecdef::text||'|'||p.provolatile::text||'|'||p.proisstrict::text||'|'||p.proleakproof::text||'|'||
                p.proparallel::text||'|'||pg_catalog.pg_get_userbyid(p.proowner)||'|'||
                COALESCE(array_to_string(p.proconfig,','),'')||'|'||pg_catalog.pg_get_functiondef(p.oid)
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname IN ('hourkey_r8_remove_transferred_bindings','hourkey_r8_rebind_primary_token',
          'hourkey_r8_revoke_delivery_scope','hourkey_r8_record_astronomy_shadow_occurrence',
          'hourkey_r8_mark_astronomy_shadow_run','enforce_mobile_science_notification_chain_owner',
          'enforce_mobile_science_notification_occurrence_immutable')
        ORDER BY kind,name`,
    );
    const schemaDefinitionDigest = computeR8SchemaDefinitionDigest(schemaDefinitions.rows);
    const schemaDefinitionDigestMatches = /^[0-9a-f]{64}$/u.test(String(options.expectedSchemaDigest || ""))
      && schemaDefinitionDigest === options.expectedSchemaDigest;
    const proof = {
      ...legacyProof,
      r8MigrationApplied: true,
      r8SchemaComplete: r8.r8_schema_complete === true && schemaDefinitionDigestMatches,
      r8SchemaDefinitionDigestMatches: schemaDefinitionDigestMatches,
      r8SchemaDefinitionDigest: schemaDefinitionDigest,
      r8ProducerRowsExact: r8.r8_producer_rows_exact === true,
      r8SourceDigestsMatch: r8.r8_source_digests_match === true,
      r8HardOff: r8.r8_hard_off === true,
      r8RuntimeTablesReadOnly: r8.r8_runtime_tables_read_only === true,
      r8PublicMutationDenied: r8.r8_public_mutation_denied === true,
      r8ScopedFunctionsExecutable: r8.r8_scoped_functions_executable === true,
      r8ScopedFunctionsHardened: r8.r8_scoped_functions_hardened === true,
    };
    await client.query("COMMIT");
    return proof;
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof options.onError === "function") options.onError(error);
    return emptyDatabaseProof(r8Required);
  } finally {
    if (client?.end) await client.end().catch(() => undefined);
  }
}

function inspect(options = {}) {
  const env = options.env || process.env;
  const access = options.access || accessSync;
  const releaseRoot = options.releaseRoot || join(__dirname,"..");
  const pathExists = options.pathExists || existsSync;
  const uid = options.uid || (() => process.getuid?.());
  const lookupUser = options.lookupUser || ((name) => {
    try { execFileSync("getent", ["passwd", name], { stdio: "ignore" }); return true; } catch { return false; }
  });
  const serviceUserAccess = options.serviceUserAccess || defaultServiceUserAccess;
  const readUnit = options.readUnit || readFileSync;
  const runtimeRoot = uid() === 0 && rootExists(lookupUser);
  const nodeExecutable = canAccess(access, "/usr/bin/node", constants.X_OK);
  const releasePaths = [
    "scripts/notification-health.cjs",
    "scripts/notification-retry-receipt-runner.cjs",
    "src/lib/notification-scheduler-heartbeat.cjs",
    "scripts/mobile-yam-push-cron.cjs",
    "scripts/mobile-daily-fortune-push-cron.cjs",
    "scripts/mobile-auspicious-push-cron.cjs",
    "scripts/mobile-personal-reminders-cron.cjs",
    "scripts/mobile-monthly-report-push-cron.cjs",
    "scripts/mobile-network-morning-push-cron.cjs",
    "scripts/mobile-zibai-push-cron.cjs",
    "scripts/mobile-qimen-push-cron.cjs",
    "scripts/mobile-ziwei-hourly-push-cron.mts",
    "scripts/derive-hourkey-notification-env.cjs",
    "ops/tmpfiles.d/hourkey-notification.conf",
    "ops/systemd/hourkey-mobile-qimen-push.service",
    "ops/systemd/hourkey-mobile-ziwei-hourly-push.service",
  ].map((path) => join(releaseRoot,path));
  const releaseReadable = releasePaths.every((target) => canAccess(access, target, constants.R_OK));
  const environmentReadable = canAccess(access, "/etc/hourkey/hourkey.env", constants.R_OK);
  const notificationEnvironmentReadable = canAccess(access, "/etc/hourkey/hourkey-notification.env", constants.R_OK);
  const notificationEnvironmentContract = options.notificationEnvironmentContract || inspectInstalledEnvironment;
  const notificationEnvironmentValid = notificationEnvironmentReadable
    && (() => { try { return notificationEnvironmentContract("/etc/hourkey/hourkey-notification.env") === true; } catch { return false; } })();
  const credentialReadable = canAccess(access, "/etc/hourkey/credentials/fcm-service-account.json", constants.R_OK);
  const stateReady = canAccess(access, "/var/lib/hourkey-notification", constants.W_OK);
  const stateCreatable = !stateReady && runtimeRoot
    && canAccess(access, "/var/lib", constants.W_OK) && hasStateDirectoryContract(readUnit,releaseRoot);
  const ziweiServiceUser = rootExists((name) => name === "root" ? true : lookupUser(name))
    && (() => { try { return lookupUser("hourkey-notify") === true; } catch { return false; } })();
  const ziweiServicePaths = [
    ["/usr/bin/env", constants.X_OK],
    ["/usr/bin/node", constants.X_OK],
    [releaseRoot, constants.X_OK],
    [join(releaseRoot,"scripts/mobile-ziwei-hourly-push-cron.mts"), constants.R_OK],
    [join(releaseRoot,"scripts/notification-retry-receipt-runner.cjs"), constants.R_OK],
    [join(releaseRoot,"scripts/notification-health.cjs"), constants.R_OK],
    ["/etc/hourkey/credentials/fcm-service-account.json", constants.R_OK],
    ["/var/lib/hourkey-notification", constants.W_OK],
    ["/var/log/hourkey", constants.W_OK],
  ];
  const ziweiEnvironmentReadable = ziweiServiceUser && (() => {
    try { return serviceUserAccess("hourkey-notify", "/etc/hourkey/hourkey-notification.env", constants.R_OK) === true; }
    catch { return false; }
  })();
  const retryHeartbeatAccess = ziweiServiceUser && (() => {
    try {
      return serviceUserAccess("hourkey-notify", "/var/lib/hourkey-notification", constants.X_OK) === true
        && serviceUserAccess("hourkey-notify", "/var/lib/hourkey-notification", constants.W_OK) === true;
    } catch { return false; }
  })();
  const schedulerHeartbeatDirectory = "/var/lib/hourkey-notification/schedulers";
  const schedulerHeartbeatAccess = ziweiServiceUser && (() => {
    try {
      return serviceUserAccess("hourkey-notify", schedulerHeartbeatDirectory, constants.X_OK) === true
        && serviceUserAccess("hourkey-notify", schedulerHeartbeatDirectory, constants.W_OK) === true;
    } catch { return false; }
  })();
  const ziweiServiceAccess = ziweiEnvironmentReadable && retryHeartbeatAccess
    && schedulerHeartbeatAccess && ziweiServicePaths.every(([target, mode]) => {
    try { return serviceUserAccess("hourkey-notify", target, mode) === true; } catch { return false; }
  });
  const bundledR8EvidencePath = join(releaseRoot,"docs/notification-science/qizheng-r8-release-evidence.json");
  const r8MigrationArtifactPresent = pathExists(join(releaseRoot,"migrations/20260904_mobile_science_notifications_r8.sql"));
  const r8Required = [
    r8MigrationArtifactPresent,
    pathExists(bundledR8EvidencePath),
    ...R8_EXCLUSIVE_ARTIFACTS.map((path) => pathExists(join(releaseRoot,path))),
  ].some(Boolean);
  const r8EvidencePath = r8Required
    ? (options.r8EvidencePath || bundledR8EvidencePath)
    : (options.r8EvidencePath || env.HOURKEY_R8_HARD_OFF_MANIFEST);
  const r8Evidence = r8EvidencePath
    ? inspectR8HardOffEvidence(r8EvidencePath, options.r8EvidenceOptions)
    : null;
  let r8Release = null;
  if (r8Required) {
    const read = options.readFile || readFileSync;
    const bundle = r8Evidence?.ok === true ? readR8Bundle(r8EvidencePath,read) : null;
    let releaseCommit = null;
    try { releaseCommit = String(read(join(releaseRoot,".release-commit"),"utf8")).trim(); } catch {}
    const expectedCommit = bundle?.backend?.applicationCommit;
    const expectedTree = bundle?.backend?.applicationTree;
    const resolveTree = options.resolveCommitTree || resolveCommitTree;
    const runtimeDigest = options.computeRuntimeDigest || computeRuntimeDigest;
    const buildDigest = options.computeBuildArtifactDigest || computeBuildArtifactDigest;
    const installedSourceDigest = options.computeInstalledSourceDigest || computeInstalledSourceDigest;
    let resolvedTree = null;
    let installedRuntimeDigest = null;
    let installedBuildDigest = null;
    let installedSource = null;
    try { if (expectedCommit) resolvedTree = resolveTree(releaseRoot,expectedCommit,options.sourceRepository); } catch {}
    try { installedRuntimeDigest = runtimeDigest(releaseRoot,R8_RUNTIME_FILES); } catch {}
    try { installedBuildDigest = buildDigest(releaseRoot); } catch {}
    try { if (expectedCommit) installedSource = installedSourceDigest(releaseRoot,expectedCommit,options.sourceRepository); } catch {}
    r8Release = {
      r8MigrationArtifactPresent,
      r8EvidenceValid: r8Evidence?.ok === true,
      r8RolloutOrderDeclared: bundle?.activationBoundary?.requiredProductionRolloutOrder === "migration_then_application",
      r8ReleaseCommitMatches: typeof expectedCommit === "string" && releaseCommit === expectedCommit,
      r8ReleaseTreeMatches: typeof expectedTree === "string" && resolvedTree === expectedTree,
      r8InstalledSourceMatches: typeof bundle?.backend?.sourceDigest === "string"
        && installedSource === bundle.backend.sourceDigest,
      r8RuntimeDigestMatches: typeof bundle?.backend?.runtimeDigest === "string"
        && installedRuntimeDigest === bundle.backend.runtimeDigest,
      r8BuildArtifactDigestMatches: typeof bundle?.backend?.buildArtifactDigest === "string"
        && installedBuildDigest === bundle.backend.buildArtifactDigest,
    };
  }
  const baseOk = runtimeRoot && nodeExecutable && releaseReadable && environmentReadable
      && notificationEnvironmentReadable && notificationEnvironmentValid && credentialReadable
      && (stateReady || stateCreatable) && ziweiServiceUser && ziweiEnvironmentReadable && ziweiServiceAccess;
  const r8ReleaseOk = !r8Required || Object.values(r8Release).every((value) => value === true);
  let r8Phase;
  let r8Reasons;
  if (r8Required) {
    if (!r8Release.r8EvidenceValid || !r8Release.r8RolloutOrderDeclared) {
      r8Phase = "evidence_invalid";
      r8Reasons = ["r8_evidence_invalid"];
    } else if (!r8ReleaseOk) {
      r8Phase = "release_mismatch";
      r8Reasons = [
        ...(!r8Release.r8MigrationArtifactPresent ? ["r8_migration_artifact_missing"] : []),
        ...(!r8Release.r8ReleaseCommitMatches ? ["r8_release_commit_mismatch"] : []),
        ...(!r8Release.r8ReleaseTreeMatches ? ["r8_release_tree_mismatch"] : []),
        ...(!r8Release.r8InstalledSourceMatches ? ["r8_installed_source_mismatch"] : []),
        ...(!r8Release.r8RuntimeDigestMatches ? ["r8_runtime_digest_mismatch"] : []),
        ...(!r8Release.r8BuildArtifactDigestMatches ? ["r8_build_artifact_digest_mismatch"] : []),
      ];
    } else {
      r8Phase = "migration_required";
      r8Reasons = ["r8_migration_not_applied_before_application"];
    }
  }
  return {
    ok: baseOk && (!r8Evidence || r8Evidence.ok) && r8ReleaseOk,
    runtimeRoot, nodeExecutable, releaseReadable, environmentReadable, notificationEnvironmentReadable,
    notificationEnvironmentValid, credentialReadable, stateReady, stateCreatable,
    ziweiServiceUser, ziweiEnvironmentReadable, retryHeartbeatAccess,
    schedulerHeartbeatAccess, ziweiServiceAccess,
    ...(r8Evidence ? { r8Evidence } : {}),
    ...(r8Required ? { r8Required, ...r8Release, r8Phase, r8Reasons } : {}),
  };
}

async function runPreflight(options = {}) {
  const filesystem = inspect(options);
  const r8Required = filesystem.r8Required === true;
  const releaseRoot = options.releaseRoot || join(__dirname,"..");
  const evidencePath = options.r8EvidencePath
    || join(releaseRoot,"docs/notification-science/qizheng-r8-release-evidence.json");
  const bundle = r8Required && filesystem.r8EvidenceValid
    ? readR8Bundle(evidencePath,options.readFile || readFileSync) : null;
  const database = await inspectDatabaseAccess({
    ...(options.database || {}), r8Required,
    expectedModelDigest: bundle?.science?.modelDigest,
    expectedSourceDigest: bundle?.science?.sourceDigest,
    expectedSchemaDigest: bundle?.science?.databaseSchemaDigest,
  });
  const legacyDatabaseOk = database.databaseConnected && database.exactRuntimeRole
    && database.producerReadOnly && database.ziweiParentUpdate && database.ziweiAttemptUpdate
    && database.ziweiParentDeleteGuarded
    && database.ziweiOccurrenceDeleteDenied && database.ziweiInstallationDeleteDenied
    && database.ziweiUserDeleteDenied && database.ziweiProfileDeleteDenied
    && database.ziweiPurgeExecutable && database.ziweiPurgeHardened
    && database.ziweiIntegrityTriggers;
  const r8DatabaseOk = !r8Required || (
    database.r8MigrationApplied && database.r8SchemaComplete && database.r8ProducerRowsExact
    && database.r8SourceDigestsMatch && database.r8HardOff && database.r8RuntimeTablesReadOnly
    && database.r8PublicMutationDenied && database.r8ScopedFunctionsExecutable
    && database.r8ScopedFunctionsHardened
  );
  let r8Phase = filesystem.r8Phase;
  let r8Reasons = filesystem.r8Reasons;
  if (r8Required && filesystem.r8EvidenceValid && filesystem.r8RolloutOrderDeclared
      && filesystem.r8MigrationArtifactPresent && filesystem.r8ReleaseCommitMatches
      && filesystem.r8ReleaseTreeMatches && filesystem.r8InstalledSourceMatches
      && filesystem.r8RuntimeDigestMatches && filesystem.r8BuildArtifactDigestMatches) {
    if (!database.r8MigrationApplied) {
      r8Phase = "migration_required";
      r8Reasons = ["r8_migration_not_applied_before_application"];
    } else if (!r8DatabaseOk) {
      r8Phase = "database_invalid";
      r8Reasons = [
        ...(!database.r8SchemaComplete || !database.r8ProducerRowsExact ? ["r8_schema_incomplete"] : []),
        ...(!database.r8SourceDigestsMatch ? ["r8_source_digest_mismatch"] : []),
        ...(!database.r8HardOff ? ["r8_hard_off_violation"] : []),
        ...(!database.r8RuntimeTablesReadOnly || !database.r8PublicMutationDenied
          || !database.r8ScopedFunctionsExecutable || !database.r8ScopedFunctionsHardened
          ? ["r8_least_privilege_violation"] : []),
      ];
    } else {
      r8Phase = "application_ready";
      r8Reasons = [];
    }
  }
  return {
    ...filesystem, ...database,
    ...(r8Required ? { r8Phase, r8Reasons } : {}),
    ok: filesystem.ok && legacyDatabaseOk && r8DatabaseOk,
  };
}

if (require.main === module) {
  runPreflight().then((report) => {
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 1;
  }).catch(() => {
    console.log(JSON.stringify({ ...inspect(), ...emptyDatabaseProof(), ok: false }));
    process.exitCode = 1;
  });
}

module.exports = {
  computeBuildArtifactDigest,
  computeInstalledSourceDigest,
  computeR8SchemaDefinitionDigest,
  computeRuntimeDigest,
  emptyDatabaseProof,
  hasStateDirectoryContract,
  inspect,
  inspectDatabaseAccess,
  inspectR8HardOffEvidence,
  readR8Bundle,
  resolveCommitTree,
  R8_EXCLUSIVE_ARTIFACTS,
  R8_POST_APPLICATION_EVIDENCE_FILE,
  R8_RUNTIME_FILES,
  runPreflight,
};
