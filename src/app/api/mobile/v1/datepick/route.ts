import { NextResponse } from "next/server";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";

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

function cleanDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

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
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const activityType = String((body as { activityType?: unknown }).activityType || "").trim();
  const dateFrom = cleanDate((body as { dateFrom?: unknown }).dateFrom);
  const dateTo = cleanDate((body as { dateTo?: unknown }).dateTo);
  const profileId = cleanProfileId((body as { profileId?: unknown }).profileId);
  const activityProfileKey = cleanActivityProfileKey((body as { activityProfileKey?: unknown }).activityProfileKey);
  const limit = cleanLimit((body as { limit?: unknown }).limit);

  if (!ACTIVITY_TYPES.has(activityType)) {
    return NextResponse.json({ ok: false, error: "activityType ไม่ถูกต้อง" }, { status: 400 });
  }
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ ok: false, error: "dateFrom/dateTo ต้องเป็น YYYY-MM-DD" }, { status: 400 });
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
    peopleIds: profileId ? [`hk_${profileId}`] : [],
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
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: auspiciousResp.status,
    }
  );
}
