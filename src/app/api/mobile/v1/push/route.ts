import { NextResponse } from "next/server";
import { pool, q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALES = new Set(["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]);

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
  const count = await q1<{ n: number; current: boolean }>(
    `SELECT count(*)::int AS n,
            bool_or(installation_id=$2::uuid) AS current
       FROM mobile_push_tokens WHERE user_id=$1 AND enabled=true`,
    [session.userId, installationId || null]
  );
  return NextResponse.json(
    {
      ok: true,
      subscribed: installationId ? count?.current === true : (count?.n || 0) > 0,
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
  const locale = LOCALES.has(String(body.locale || "")) ? String(body.locale) : "th";
  const appVersion = String(body.app_version || "").trim().slice(0, 40) || null;
  if (!TOKEN_RE.test(token) || !UUID_RE.test(installationId) || !["ios", "android"].includes(platform)) {
    return NextResponse.json({ ok: false, error: "invalid_push_registration" }, { status: 400 });
  }

  const client = await pool.connect();
  let row: { id: string } | undefined;
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM mobile_push_tokens
        WHERE user_id=$1 AND installation_id=$2::uuid AND expo_push_token<>$3`,
      [session.userId, installationId, token]
    );
    const registered = await client.query<{ id: string }>(
      `INSERT INTO mobile_push_tokens
         (user_id,installation_id,expo_push_token,platform,app_version,locale,enabled,
          fail_count,last_registered_at,disabled_at,updated_at)
       VALUES($1,$2::uuid,$3,$4,$5,$6,true,0,now(),NULL,now())
       ON CONFLICT(expo_push_token) DO UPDATE SET
         user_id=EXCLUDED.user_id,
         installation_id=EXCLUDED.installation_id,
         platform=EXCLUDED.platform,
         app_version=EXCLUDED.app_version,
         locale=EXCLUDED.locale,
         enabled=true,
         fail_count=0,
         last_registered_at=now(),
         disabled_at=NULL,
         updated_at=now()
       RETURNING id`,
      [session.userId, installationId, token, platform, appVersion, locale]
    );
    row = registered.rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
  if (!row) return NextResponse.json({ ok: false, error: "push_registration_failed" }, { status: 500 });

  // A reinstall can create a new Expo token for the same installation. Keep one active row.
  await q(
    `UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now()
      WHERE user_id=$1 AND installation_id=$2::uuid AND id<>$3 AND enabled=true`,
    [session.userId, installationId, row.id]
  );
  return NextResponse.json({ ok: true, subscribed: true, registration_id: row.id });
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
  await q(
    `UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now()
      WHERE user_id=$1 AND enabled=true
        AND ($2::uuid IS NULL OR installation_id=$2::uuid)`,
    [session.userId, installationId || null]
  );
  return NextResponse.json({ ok: true, subscribed: false });
}
