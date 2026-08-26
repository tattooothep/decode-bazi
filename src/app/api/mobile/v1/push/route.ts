import { NextResponse } from "next/server";
import zibaiVersionRuntime from "@/lib/zibai-version-runtime.cjs";
import type { PoolClient } from "pg";
import { pool, q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALES = new Set(["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]);

type PushIdentity = {
  user_id: string;
  expo_push_token: string;
  installation_id: string;
  device_push_token: string | null;
};

function sortedValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

async function lockIdentitySet(client: PoolClient, kind: "user" | "expo" | "installation" | "native", values: Array<string | null | undefined>) {
  for (const value of sortedValues(values)) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('mobile-push-${kind}:' || $1::text, 0))`,
      [value],
    );
  }
}

/**
 * Every mutation uses this order: users, Expo identities, installations, then
 * native tokens. Discovery is deliberately unlocked; row locks only happen
 * after the full advisory identity set is held.
 */
async function lockPushIdentities(
  client: PoolClient,
  rows: PushIdentity[],
  requested: { userId: string; expoTokens?: string[]; installationIds?: string[]; nativeTokens?: Array<string | null> },
) {
  await lockIdentitySet(client, "user", [requested.userId, ...rows.map((row) => row.user_id)]);
  await lockIdentitySet(client, "expo", [...(requested.expoTokens || []), ...rows.map((row) => row.expo_push_token)]);
  await lockIdentitySet(client, "installation", [...(requested.installationIds || []), ...rows.map((row) => row.installation_id)]);
  await lockIdentitySet(client, "native", [...(requested.nativeTokens || []), ...rows.map((row) => row.device_push_token)]);
}

function cleanTimezone(value: unknown): string | null {
  const timezone = typeof value === "string" ? value.trim().slice(0, 80) : "";
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

function nativeTokenValid(platform: string, type: string | null, token: string | null): boolean {
  if (token === null && type === null) return true; // V190/V191 compatibility
  if (!token || !type || token.length < 16 || token.length > 4096) return false;
  if (/[\u0000-\u0020\u007f]/.test(token)) return false;
  return (platform === "android" && type === "fcm") || (platform === "ios" && type === "apns");
}

async function authorize(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return { ok: false as const, error: "not_authorized", status: 401 };
  const rl = await rateLimit(`mobile-push:${session.userId}:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return { ok: false as const, error: "rate_limited", status: 429 };
  return { ok: true as const, session };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { session } = auth;
  const installationId = new URL(req.url).searchParams.get("installation_id") || "";
  if (installationId && !UUID_RE.test(installationId)) {
    return NextResponse.json({ ok: false, error: "invalid_installation_id" }, { status: 400 });
  }
  /**
   * 🔴 "สมัครรับแล้ว" ไม่พอ ต้องดูว่า **ส่งถึงจริงได้ไหม** ด้วย (31 ก.ค. 69)
   *
   * เครื่องเจ้าของลงทะเบียนสำเร็จ มีกุญแจของบริการกลางครบ
   * แต่กุญแจส่งตรงถึงกูเกิลว่าง — ซึ่งเซิร์ฟเวอร์เราส่งได้ทางเดียวคือทางตรง
   * (ทางบริการกลางพิสูจน์แล้วว่าใช้ไม่ได้ ตอบ InvalidCredentials 480 รอบติด)
   * ผลคือหน้าแอพขึ้นว่า "พร้อมรับแล้ว" ทั้งที่ส่งไปไม่มีวันถึง แล้วซ่อนปุ่มแก้ทิ้ง
   */
  const count = await q1<{ n: number; current: boolean; native_deliverable: boolean; ios_current: boolean }>(
    `SELECT count(*)::int AS n,
            bool_or(installation_id=$2::uuid) AS current,
            bool_or(installation_id=$2::uuid
                    AND platform='android'
                    AND device_token_type='fcm'
                    AND device_push_token IS NOT NULL
                    AND device_push_token <> '') AS native_deliverable,
            bool_or(installation_id=$2::uuid AND platform='ios') AS ios_current
       FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`,
    [session.userId, installationId || null]
  );
  return NextResponse.json(
    {
      ok: true,
      subscribed: installationId ? count?.current === true : (count?.n || 0) > 0,
      /** ส่งถึงเครื่องนี้ได้จริงไหม — มีกุญแจส่งตรงหรือยัง */
      deliverable: installationId
        ? count?.native_deliverable === true
          || (count?.ios_current === true && process.env.EXPO_IOS_PUSH_READY === "true")
        : null,
      active_installations: count?.n || 0,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { session } = auth;
  const body = await req.json().catch(() => ({}));
  const token = String(body.expo_push_token || "").trim();
  const installationId = String(body.installation_id || "").trim();
  const platform = String(body.platform || "").trim();
  const localeProvided = body.locale !== undefined && body.locale !== null;
  const requestedLocale = typeof body.locale === "string" ? body.locale.trim().toLowerCase() : "";
  const locale = LOCALES.has(requestedLocale) ? requestedLocale : null;
  const appVersion = String(body.app_version || "").trim().slice(0, 40) || null;
  const timezone = cleanTimezone(body.timezone);
  const zibaiPayloadSchema = body.zibaiPayloadSchema === undefined ? 1 : body.zibaiPayloadSchema;
  const zibaiCalculationVersion = body.zibaiCalculationVersion === undefined
    ? zibaiVersionRuntime.LEGACY_CALCULATION_VERSION
    : body.zibaiCalculationVersion;
  const qimenPayloadSchema = body.qimenPayloadSchema === undefined ? 1 : body.qimenPayloadSchema;
  const ziweiPayloadSchema = body.ziweiPayloadSchema === undefined ? 0 : body.ziweiPayloadSchema;
  const qizhengPayloadSchema = body.qizhengPayloadSchema === undefined ? 0 : body.qizhengPayloadSchema;
  /**
   * กุญแจเครื่องแบบส่งตรงถึงกูเกิล (30 ก.ค.)
   *
   * เดิมส่งผ่านบริการกลาง ซึ่งต้องเอากุญแจโครงการไปฝากที่นั่นอีกที
   * เปลี่ยนมาส่งตรงเอง คุมได้ทั้งเส้น ไม่ต้องพึ่งบัญชีของใคร
   * ยังไม่บังคับ เพราะแอพรุ่นเก่ายังส่งมาแค่กุญแจเดิม
   */
  const deviceToken = String(body.device_push_token || "").trim().slice(0, 4096) || null;
  const deviceTokenType = body.device_token_type === "fcm" || body.device_token_type === "apns"
    ? body.device_token_type
    : null;
  if (
    !TOKEN_RE.test(token)
    || !UUID_RE.test(installationId)
    || !["ios", "android"].includes(platform)
    || (localeProvided && locale === null)
    || !nativeTokenValid(platform, deviceTokenType, deviceToken)
    || (body.timezone != null && timezone === null)
    || !(zibaiPayloadSchema === 1 || zibaiPayloadSchema === 2)
    || !zibaiVersionRuntime.isReadableCalculationVersion(zibaiCalculationVersion)
    || !(qimenPayloadSchema === 1 || qimenPayloadSchema === 2 || qimenPayloadSchema === 3)
    || !(ziweiPayloadSchema === 0 || ziweiPayloadSchema === 1 || ziweiPayloadSchema === 2)
    || qizhengPayloadSchema !== 0
  ) {
    return NextResponse.json({ ok: false, error: "invalid_push_registration" }, { status: 400 });
  }

  const client = await pool.connect();
  let row: { id: string } | undefined;
  try {
    await client.query("BEGIN");
    const discovered = await client.query<PushIdentity>(
      `SELECT user_id::text, expo_push_token, installation_id::text, device_push_token FROM mobile_push_tokens
        WHERE expo_push_token=$1
           OR (user_id=$2 AND installation_id=$3::uuid AND enabled=true)
           OR ($4::text IS NOT NULL AND device_push_token=$4)`,
      [token, session.userId, installationId, deviceToken],
    );
    await lockPushIdentities(client, discovered.rows, {
      userId: session.userId,
      expoTokens: [token],
      installationIds: [installationId],
      nativeTokens: [deviceToken],
    });
    await client.query(
      `SELECT id FROM mobile_push_tokens
        WHERE expo_push_token=$1
           OR (user_id=$2 AND installation_id=$3::uuid AND enabled=true)
           OR ($4::text IS NOT NULL AND device_push_token=$4)
        FOR UPDATE`,
      [token, session.userId, installationId, deviceToken]
    );
    const accountContext = await client.query<{ locale: string | null }>(
      `SELECT locale FROM users
        WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM false
        FOR UPDATE`,
      [session.userId],
    );
    if (!accountContext.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "account_not_available" }, { status: 409 });
    }
    const currentAccountLocale = LOCALES.has(String(accountContext.rows[0]?.locale || "").toLowerCase())
      ? String(accountContext.rows[0]?.locale).toLowerCase()
      : "th";
    const tokenLocale = locale ?? currentAccountLocale;
    const accountLocaleChanged = locale !== null && tokenLocale !== currentAccountLocale;
    await client.query(
      `DELETE FROM mobile_zibai_installations z USING mobile_push_tokens t
        WHERE z.user_id=t.user_id AND z.installation_id=t.installation_id
          AND t.user_id<>$1
          AND (t.installation_id=$2::uuid OR ($3::text IS NOT NULL AND t.device_push_token=$3))`,
      [session.userId, installationId, deviceToken],
    );
    await client.query(
      `DELETE FROM mobile_qimen_installations q USING mobile_push_tokens t
        WHERE q.user_id=t.user_id AND q.installation_id=t.installation_id
          AND t.user_id<>$1
          AND (t.installation_id=$2::uuid OR ($3::text IS NOT NULL AND t.device_push_token=$3))`,
      [session.userId, installationId, deviceToken],
    );
    await client.query(
      `DELETE FROM mobile_ziwei_hourly_installations z USING mobile_push_tokens t
        WHERE z.user_id=t.user_id AND z.installation_id=t.installation_id
          AND t.user_id<>$1
          AND (t.installation_id=$2::uuid OR ($3::text IS NOT NULL AND t.device_push_token=$3))`,
      [session.userId, installationId, deviceToken],
    );
    // Installation IDs and native push tokens identify a physical app install,
    // not an account. Transfer both identities before the upsert so an old
    // account can never remain enabled for the same device after account switch.
    await client.query(
      `UPDATE mobile_push_tokens
          SET enabled=false,disabled_at=now(),updated_at=now()
        WHERE enabled=true
          AND user_id<>$1
          AND (installation_id=$2::uuid OR ($3::text IS NOT NULL AND device_push_token=$3))`,
      [session.userId, installationId, deviceToken]
    );
    await client.query(
      `UPDATE mobile_push_tokens
          SET enabled=false,disabled_at=now(),updated_at=now()
        WHERE enabled=true
          AND user_id=$1
          AND expo_push_token<>$3
          AND (installation_id=$2::uuid OR ($4::text IS NOT NULL AND device_push_token=$4))`,
      [session.userId, installationId, token, deviceToken]
    );
    const registered = await client.query<{ id: string }>(
      `INSERT INTO mobile_push_tokens
         (user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,app_version,locale,timezone,enabled,
          fail_count,last_registered_at,disabled_at,updated_at,zibai_payload_schema,qimen_payload_schema,
          ziwei_payload_schema,qizheng_payload_schema,zibai_calculation_version)
       VALUES($1,$2::uuid,$3,$7,$8,$4,$5,$6,$9,true,0,now(),NULL,now(),$10,$11,$13,$14,$12)
       ON CONFLICT(expo_push_token) DO UPDATE SET
         user_id=EXCLUDED.user_id,
         installation_id=EXCLUDED.installation_id,
         device_push_token=EXCLUDED.device_push_token,
         device_token_type=EXCLUDED.device_token_type,
         platform=EXCLUDED.platform,
         app_version=EXCLUDED.app_version,
         locale=EXCLUDED.locale,
         timezone=COALESCE(EXCLUDED.timezone, mobile_push_tokens.timezone),
         zibai_payload_schema=EXCLUDED.zibai_payload_schema,
         zibai_calculation_version=EXCLUDED.zibai_calculation_version,
         qimen_payload_schema=EXCLUDED.qimen_payload_schema,
         ziwei_payload_schema=EXCLUDED.ziwei_payload_schema,
         qizheng_payload_schema=EXCLUDED.qizheng_payload_schema,
         enabled=true,
         fail_count=0,
         last_registered_at=now(),
         disabled_at=NULL,
         updated_at=now()
       RETURNING id`,
      [
        session.userId, installationId, token, platform, appVersion, tokenLocale,
        deviceToken, deviceTokenType, timezone, zibaiPayloadSchema, qimenPayloadSchema,
        zibaiCalculationVersion, ziweiPayloadSchema, qizhengPayloadSchema,
      ]
    );
    row = registered.rows[0];
    const installationCalculationVersion = zibaiVersionRuntime.supportsCalculationVersion(
      zibaiCalculationVersion,
      zibaiVersionRuntime.ACTIVE_CALCULATION_VERSION,
    )
      ? zibaiVersionRuntime.ACTIVE_CALCULATION_VERSION
      : zibaiVersionRuntime.LEGACY_CALCULATION_VERSION;
    await client.query(
      `UPDATE mobile_zibai_installations
          SET calculation_version=$3,updated_at=now()
        WHERE user_id=$1 AND installation_id=$2::uuid`,
      [session.userId, installationId, installationCalculationVersion],
    );
    await client.query(
      `INSERT INTO mobile_qimen_installations
         (user_id,installation_id,enabled,purpose,quiet_start,quiet_end,location_permission,
          latitude,longitude,location_timezone,location_captured_at,location_expires_at,next_due_at,updated_at)
       SELECT $1,$2::uuid,
              ($3::smallint=3 AND COALESCE(np.qimen_enabled,false)
                AND np.qimen_latitude IS NOT NULL AND np.qimen_longitude IS NOT NULL
                AND np.qimen_location_updated_at>now()-interval '7 days'),
              'travel',COALESCE(np.quiet_start,22),COALESCE(np.quiet_end,7),
              CASE WHEN np.qimen_latitude IS NOT NULL AND np.qimen_longitude IS NOT NULL
                AND np.qimen_location_updated_at IS NOT NULL THEN 'foreground' ELSE 'unknown' END,
              CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL ELSE np.qimen_latitude END,
              CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL ELSE np.qimen_longitude END,
              CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL ELSE COALESCE(np.timezone,$4,'Asia/Bangkok') END,
              np.qimen_location_updated_at,
              CASE WHEN np.qimen_location_updated_at IS NULL THEN NULL ELSE np.qimen_location_updated_at+interval '7 days' END,
              CASE WHEN $3::smallint=3 AND COALESCE(np.qimen_enabled,false)
                AND np.qimen_latitude IS NOT NULL AND np.qimen_longitude IS NOT NULL
                AND np.qimen_location_updated_at>now()-interval '7 days' THEN now() ELSE NULL END,
              now()
         FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id WHERE u.id=$1
       ON CONFLICT(user_id,installation_id) DO UPDATE SET
         enabled=EXCLUDED.enabled,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,
         location_permission=EXCLUDED.location_permission,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
         location_timezone=EXCLUDED.location_timezone,location_captured_at=EXCLUDED.location_captured_at,
         location_expires_at=EXCLUDED.location_expires_at,next_due_at=EXCLUDED.next_due_at,
         lease_token=NULL,lease_expires_at=NULL,last_skip_reason=NULL,
         owner_generation=mobile_qimen_installations.owner_generation+1,updated_at=now()`,
      [session.userId, installationId, qimenPayloadSchema, timezone],
    );
    if (accountLocaleChanged) {
      await client.query(
        `UPDATE mobile_ziwei_hourly_installations
            SET next_due_at=CASE WHEN enabled THEN now() ELSE NULL END,
                lease_token=NULL,lease_expires_at=NULL,last_skip_reason='locale_changed',
                owner_generation=owner_generation+1,updated_at=now()
          WHERE user_id=$1 AND installation_id<>$2::uuid`,
        [session.userId, installationId],
      );
    }
    await client.query(
      `INSERT INTO mobile_ziwei_hourly_installations
         (user_id,installation_id,profile_id,enabled,reference_timezone,quiet_start,quiet_end,next_due_at,updated_at)
       SELECT $1,$2::uuid,np.ziwei_profile_id,
              ($3::smallint=2 AND np.ziwei_hourly_enabled),
              COALESCE($4,np.timezone,u.timezone,'Asia/Bangkok'),np.quiet_start,np.quiet_end,
              CASE WHEN $3::smallint=2 AND np.ziwei_hourly_enabled THEN now() ELSE NULL END,now()
         FROM users u JOIN mobile_notification_prefs np ON np.user_id=u.id
         JOIN profiles p ON p.id=np.ziwei_profile_id
          AND p.created_by_user_id=u.id AND COALESCE(p.is_archived,false)=false
          AND p.birth_time_known=true
          AND NULLIF(btrim(p.birth_tz),'') IS NOT NULL
          AND hourkey_birth_timezone_valid(p.birth_tz)
          AND p.gender IN ('M','F')
          AND (p.relationship_type IS NULL OR btrim(p.relationship_type)='')
        WHERE u.id=$1
         ON CONFLICT(user_id,installation_id) DO UPDATE SET
           profile_id=EXCLUDED.profile_id,enabled=EXCLUDED.enabled,
           reference_timezone=EXCLUDED.reference_timezone,quiet_start=EXCLUDED.quiet_start,
           quiet_end=EXCLUDED.quiet_end,next_due_at=EXCLUDED.next_due_at,
           lease_token=NULL,lease_expires_at=NULL,last_skip_reason=NULL,
           owner_generation=mobile_ziwei_hourly_installations.owner_generation+1,updated_at=now()
         WHERE mobile_ziwei_hourly_installations.profile_id IS DISTINCT FROM EXCLUDED.profile_id
            OR mobile_ziwei_hourly_installations.enabled IS DISTINCT FROM EXCLUDED.enabled
            OR mobile_ziwei_hourly_installations.reference_timezone IS DISTINCT FROM EXCLUDED.reference_timezone
            OR mobile_ziwei_hourly_installations.quiet_start IS DISTINCT FROM EXCLUDED.quiet_start
            OR mobile_ziwei_hourly_installations.quiet_end IS DISTINCT FROM EXCLUDED.quiet_end
            OR $5::boolean`,
      [session.userId, installationId, ziweiPayloadSchema, timezone, accountLocaleChanged],
    );
    // Account notification context follows the most recently authenticated
    // mobile installation. Per-installation locale remains on the token for
    // lock-screen copy; account history/schedulers use this shared context.
    await client.query(
      `UPDATE users SET locale=COALESCE($2,locale),timezone=COALESCE($3,timezone) WHERE id=$1`,
      [session.userId, locale, timezone],
    );
    // Do not create a preference/consent row merely by registering a device.
    // If one already exists, keep its locale/timezone synchronized under the
    // same per-user transaction lock used by registration and preference saves.
    await client.query(
      `UPDATE mobile_notification_prefs
          SET locale=COALESCE($2,locale),timezone=COALESCE($3,timezone),updated_at=now()
        WHERE user_id=$1`,
      [session.userId, locale, timezone],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    return NextResponse.json(
      { ok: false, error: code === "23505" ? "push_registration_conflict" : "push_registration_failed" },
      { status: code === "23505" ? 409 : 500 },
    );
  } finally {
    client.release();
  }
  if (!row) return NextResponse.json({ ok: false, error: "push_registration_failed" }, { status: 500 });
  const deliverable = platform === "android"
    ? deviceTokenType === "fcm" && deviceToken !== null
    : process.env.EXPO_IOS_PUSH_READY === "true";
  return NextResponse.json({ ok: true, subscribed: true, deliverable, registration_id: row.id });
}

export async function DELETE(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { session } = auth;
  const body = await req.json().catch(() => ({}));
  const installationId = String(body.installation_id || "").trim();
  if (installationId && !UUID_RE.test(installationId)) {
    return NextResponse.json({ ok: false, error: "invalid_installation_id" }, { status: 400 });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const discovered = installationId
      ? await client.query<PushIdentity>(
        `SELECT user_id::text, expo_push_token, installation_id::text, device_push_token FROM mobile_push_tokens
          WHERE installation_id=$1::uuid`,
        [installationId],
      )
      : await client.query<PushIdentity>(
        `SELECT user_id::text, expo_push_token, installation_id::text, device_push_token FROM mobile_push_tokens
          WHERE user_id=$1 AND enabled=true`,
        [session.userId],
      );
    await lockPushIdentities(client, discovered.rows, {
      userId: session.userId,
      installationIds: installationId ? [installationId] : [],
    });
    if (installationId) {
      await client.query(
        `SELECT id FROM mobile_push_tokens WHERE installation_id=$1::uuid FOR UPDATE`,
        [installationId],
      );
    } else {
      await client.query(
        `SELECT id FROM mobile_push_tokens
          WHERE user_id=$1 AND enabled=true FOR UPDATE`,
        [session.userId]
      );
    }
    await client.query(
      `UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now()
        WHERE user_id=$1 AND enabled=true
          AND ($2::uuid IS NULL OR installation_id=$2::uuid)`,
      [session.userId, installationId || null]
    );
    await client.query(
      `DELETE FROM mobile_zibai_installations
        WHERE user_id=$1 AND ($2::uuid IS NULL OR installation_id=$2::uuid)`,
      [session.userId, installationId || null],
    );
    await client.query(
      `DELETE FROM mobile_qimen_installations
        WHERE user_id=$1 AND ($2::uuid IS NULL OR installation_id=$2::uuid)`,
      [session.userId, installationId || null],
    );
    await client.query(
      `DELETE FROM mobile_ziwei_hourly_installations
        WHERE user_id=$1 AND ($2::uuid IS NULL OR installation_id=$2::uuid)`,
      [session.userId, installationId || null],
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => null);
    return NextResponse.json({ ok: false, error: "push_unregistration_failed" }, { status: 500 });
  } finally {
    client.release();
  }
  return NextResponse.json({ ok: true, subscribed: false });
}
