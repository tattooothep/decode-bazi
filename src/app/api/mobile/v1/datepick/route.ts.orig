import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { cleanDatepickDate, parseDatepickPeople } from "./input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIVITY_TYPES = new Set(["立約", "開市", "出行", "求財", "婚姻", "搬家", "動土", "祭祀"]);
const ACTIVE_MODULES = [
  "ze_ri",
  "twelve_officers",
  "twenty_eight",
  "twelve_spirits",
  "nine_stars",
  "tai_sui",
  "qi_men",
  "he_luo",
  "hex64",
];

function cleanLimit(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 8;
  return Math.max(1, Math.min(20, Math.floor(num)));
}

function cleanActivityProfileKey(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9_:-]{2,48}$/.test(text) ? text : null;
}

function cookieHeaderForAuspicious(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-datepick:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "ค้นฤกษ์ถี่เกินไป · กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const activityType = String(body.activityType || "").trim();
  const dateFrom = cleanDatepickDate(body.dateFrom);
  const dateTo = cleanDatepickDate(body.dateTo);
  const activityProfileKey = cleanActivityProfileKey(body.activityProfileKey);
  const limit = cleanLimit(body.limit);
  const people = parseDatepickPeople(body);

  if (!ACTIVITY_TYPES.has(activityType)) {
    return NextResponse.json({ ok: false, error: "activityType ไม่ถูกต้อง" }, { status: 400 });
  }
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ ok: false, error: "dateFrom/dateTo ต้องเป็น YYYY-MM-DD" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ ok: false, error: "dateFrom ต้องไม่เกิน dateTo" }, { status: 400 });
  }
  if (people.error) {
    return NextResponse.json({ ok: false, error: people.error }, { status: 400 });
  }

  if (people.ids.length) {
    const owned = await q<{ id: string }>(
      `SELECT id
         FROM profiles
        WHERE id = ANY($1::uuid[])
          AND org_id=$2
          AND created_by_user_id=$3
          AND COALESCE(is_archived, false)=false`,
      [people.ids, session.orgId, session.userId]
    );
    const ownedIds = new Set(owned.map((row) => row.id));
    if (people.ids.some((id) => !ownedIds.has(id))) {
      return NextResponse.json({ ok: false, error: "people_profile_not_owned" }, { status: 403 });
    }
  }

  const origin = internalAppOrigin(req);
  const cookie = cookieHeaderForAuspicious(req);
  const payload = {
    activityType,
    ...(activityProfileKey ? { activityProfileKey } : {}),
    activeModules: ACTIVE_MODULES,
    dateFrom,
    dateTo,
    options: {
      hardModules: ["ze_ri", "tai_sui", "qi_men"],
      limit,
      scanLimit: 240,
    },
    peopleIds: people.ids.map((id) => `hk_${id}`),
  };

  const auspiciousResp = await fetch(`${origin}/api/auspicious`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    method: "POST",
  });

  const text = await auspiciousResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid auspicious response" };
  }

  return NextResponse.json(
    {
      ok: auspiciousResp.ok,
      source: "/api/auspicious",
      ...data,
      people_ids: people.ids,
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: auspiciousResp.status,
    }
  );
}
