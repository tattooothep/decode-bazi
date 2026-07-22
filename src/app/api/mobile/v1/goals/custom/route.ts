// /api/mobile/v1/goals/custom — เป้าหมายส่วนตัว + ฤกษ์มงคล (เจ้านายเคาะ 22 ก.ค. 2569)
// POST   {title, profileId?}  เพิ่มเป้าหมาย (สูงสุด 8 active) → AI จำแนกผ่าน /api/activity-classify → เก็บ activity_key+label
// GET    ?profileId=          ลิสต์เป้าหมาย active + คะแนนวันนี้ + ฤกษ์ดีถัดไปต่อเป้าหมาย (engine จริงผ่าน /api/auspicious · LOCKED เรียกอย่างเดียว)
// DELETE {goalId}             soft delete (active=false · เช็คเจ้าของ)
// pattern auth/rate-limit ตาม checkin/route.ts · internal call ตาม network/compare + datepick (internalAppOrigin + cookie=bearer)
// ทุกคะแนน/ฤกษ์มาจาก engine จริงเท่านั้น — หาไม่ได้ = null ห้ามปั้น
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getActivityProfile, profileLabelEn } from "@/lib/luck-engine/activity-profiles";
import {
  MAX_GOALS,
  cleanGoalTitle,
  cleanGoalUuid,
  goalCacheKey,
  mapClassifyToActivity,
  pickNextAuspicious,
  thaiDay,
  todayScoreFrom,
  type GoalActivity,
  type NextAuspicious,
} from "./goals-lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* กระจกจาก mobile/v1/datepick/route.ts (default 9 modules + hard 3) — ปลายทาง /api/auspicious กรอง entitlement เองอีกชั้น */
const DEFAULT_ACTIVE_MODULES = [
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
const DEFAULT_HARD_MODULES = ["ze_ri", "tai_sui", "qi_men"];
const WINDOW_DAYS = 14; // มองไปข้างหน้า 14 วัน (สเปค 7-14 · อยู่ใน cap free 30 วัน)

type Row = {
  id: string;
  profile_id: string | null;
  title: string;
  activity_key: string | null;
  activity_label: unknown;
  created_at: string;
};

function cookieHeader(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

async function ownsProfile(profileId: string, orgId: string, userId: string): Promise<boolean> {
  const row = await q1<{ id: string }>(
    `SELECT id FROM profiles WHERE id=$1::uuid AND org_id=$2 AND created_by_user_id=$3 AND COALESCE(is_archived,false)=false`,
    [profileId, orgId, userId]
  );
  return !!row;
}

/* ── cache ฤกษ์ใน memory · key = activity+profile+วัน · TTL 1 ชม. (ตามสเปค) ── */
type LuckView = { todayScore: number | null; nextAuspicious: NextAuspicious | null };
const LUCK_TTL = 60 * 60 * 1000;
const _luckCache = new Map<string, { value: LuckView; expires: number }>();

function luckCacheGet(key: string): LuckView | null {
  const hit = _luckCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) _luckCache.delete(key);
  return null;
}
function luckCacheSet(key: string, value: LuckView): void {
  _luckCache.set(key, { value, expires: Date.now() + LUCK_TTL });
  if (_luckCache.size > 500) {
    const oldest = [..._luckCache.entries()].sort((a, b) => a[1].expires - b[1].expires).slice(0, 100);
    for (const [k] of oldest) _luckCache.delete(k);
  }
}

/** เรียก /api/auspicious ภายใน (LOCKED — เรียกอย่างเดียว) · คืน candidates หรือ null ถ้าพัง (ไม่ throw) */
async function fetchAuspiciousCandidates(
  origin: string,
  cookie: string,
  ip: string,
  payload: Record<string, unknown>
): Promise<unknown[] | null> {
  try {
    const resp = await fetch(`${origin}/api/auspicious`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // ให้ rate limit ฝั่ง /api/auspicious นับตาม ip ผู้ใช้จริง ไม่ใช่ก้อนเดียว "unknown"
        "x-forwarded-for": ip,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return null;
    const data = (await resp.json().catch(() => null)) as { candidates?: unknown } | null;
    return Array.isArray(data?.candidates) ? data!.candidates as unknown[] : null;
  } catch {
    return null;
  }
}

/** คะแนนวันนี้ + ฤกษ์ดีถัดไปของ activity หนึ่ง (เรียกครั้งเดียวต่อ activity_key+profile · cache 1 ชม.) */
async function luckForActivity(
  req: Request,
  activityKey: string,
  personProfileId: string | null
): Promise<LuckView> {
  const today = thaiDay();
  const key = goalCacheKey(activityKey, personProfileId, today);
  const cached = luckCacheGet(key);
  if (cached) return cached;

  const profile = getActivityProfile(activityKey);
  if (!profile) {
    // activity_key ในแถวเก่าไม่รู้จัก engine → ไม่มีข้อมูลจริงให้ = null (ไม่ cache กันข้อมูลใหม่หลังแก้)
    return { todayScore: null, nextAuspicious: null };
  }

  const origin = internalAppOrigin(req);
  const cookie = cookieHeader(req);
  const ip = clientIp(req);
  const base = {
    activityType: profile.baseActivityType,
    activityProfileKey: profile.key,
    activeModules: DEFAULT_ACTIVE_MODULES,
    peopleIds: personProfileId ? [`hk_${personProfileId}`] : [],
  };
  const [windowCands, todayCands] = await Promise.all([
    fetchAuspiciousCandidates(origin, cookie, ip, {
      ...base,
      dateFrom: today,
      dateTo: thaiDay(WINDOW_DAYS - 1),
      options: { hardModules: DEFAULT_HARD_MODULES, limit: 10, scanLimit: 240 },
    }),
    fetchAuspiciousCandidates(origin, cookie, ip, {
      ...base,
      dateFrom: today,
      dateTo: today,
      options: { hardModules: DEFAULT_HARD_MODULES, limit: 10, scanLimit: 24 },
    }),
  ]);

  const view: LuckView = {
    todayScore: todayScoreFrom(todayCands, today),
    nextAuspicious: pickNextAuspicious(windowCands, Date.now()),
  };
  // engine ตอบไม่ได้ทั้งคู่ = อย่า cache ค่า null ทิ้งไว้ทั้งชั่วโมง (ให้ลองใหม่ request หน้า)
  if (windowCands !== null || todayCands !== null) luckCacheSet(key, view);
  return view;
}

/* ══ GET ?profileId= — ลิสต์เป้าหมาย + คะแนนวันนี้ + ฤกษ์ดีถัดไป ══ */
export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-goals-list:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const url = new URL(req.url);
  const rawProfileId = url.searchParams.get("profileId");
  let queryProfileId: string | null = null;
  if (rawProfileId) {
    queryProfileId = cleanGoalUuid(rawProfileId);
    if (!queryProfileId) return NextResponse.json({ ok: false, error: "bad profileId" }, { status: 400 });
    if (!(await ownsProfile(queryProfileId, session.orgId, session.userId))) {
      return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
    }
  }

  const rows = await q<Row>(
    `SELECT id, profile_id, title, activity_key, activity_label, created_at::text
       FROM user_custom_goals
      WHERE user_id=$1 AND active=true
      ORDER BY created_at DESC
      LIMIT ${MAX_GOALS}`,
    [session.userId]
  );

  // เรียก engine ครั้งเดียวต่อ (activity_key, ดวง) — เป้าหมายที่ activity ซ้ำใช้ผลร่วมกัน
  const uniq = new Map<string, { activityKey: string; personId: string | null }>();
  for (const row of rows) {
    if (!row.activity_key) continue;
    const personId = queryProfileId || row.profile_id || null;
    const k = `${row.activity_key}|${personId || ""}`;
    if (!uniq.has(k)) uniq.set(k, { activityKey: row.activity_key, personId });
  }
  const luckByKey = new Map<string, LuckView>();
  await Promise.all(
    [...uniq.entries()].map(async ([k, item]) => {
      luckByKey.set(k, await luckForActivity(req, item.activityKey, item.personId));
    })
  );

  const goals = rows.map((row) => {
    const personId = queryProfileId || row.profile_id || null;
    const luck = row.activity_key ? luckByKey.get(`${row.activity_key}|${personId || ""}`) : undefined;
    return {
      id: row.id,
      title: row.title,
      profileId: row.profile_id,
      activityKey: row.activity_key,
      activityLabel: row.activity_label ?? null,
      todayScore: luck ? luck.todayScore : null,
      nextAuspicious: luck ? luck.nextAuspicious : null,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json(
    { ok: true, goals, limit: MAX_GOALS },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

/* ══ POST {title, profileId?} — เพิ่มเป้าหมาย + จำแนกประเภทด้วย /api/activity-classify ══ */
export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-goals-add:${clientIp(req)}:${session.userId}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  let body: { title?: unknown; profileId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const title = cleanGoalTitle(body.title);
  if (!title) return NextResponse.json({ ok: false, error: "title_invalid" }, { status: 400 });

  let profileId: string | null = null;
  if (body.profileId !== undefined && body.profileId !== null && String(body.profileId).trim() !== "") {
    profileId = cleanGoalUuid(body.profileId);
    if (!profileId) return NextResponse.json({ ok: false, error: "bad profileId" }, { status: 400 });
    if (!(await ownsProfile(profileId, session.orgId, session.userId))) {
      return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
    }
  }

  // นับก่อน (ตอบเร็ว ไม่เปลือง AI) — เพดานจริงบังคับอีกชั้นตอน INSERT กัน race
  const count = await q1<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM user_custom_goals WHERE user_id=$1 AND active=true`,
    [session.userId]
  );
  if ((count?.n ?? 0) >= MAX_GOALS) {
    return NextResponse.json({ ok: false, error: "limit", max: MAX_GOALS }, { status: 409 });
  }

  // จำแนกประเภทด้วยเส้น AI ที่มีอยู่แล้ว (keyword → Claude CLI → default) · cookie=bearer ให้ชั้น AI ที่ต้อง login ทำงาน
  let activity: GoalActivity | null = null;
  try {
    const resp = await fetch(`${internalAppOrigin(req)}/api/activity-classify`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-forwarded-for": clientIp(req),
        ...(cookieHeader(req) ? { Cookie: cookieHeader(req) } : {}),
      },
      body: JSON.stringify({ query: title }),
    });
    if (resp.ok) {
      activity = mapClassifyToActivity(await resp.json().catch(() => null), getActivityProfile, profileLabelEn);
    }
  } catch {
    activity = null;
  }
  if (!activity) return NextResponse.json({ ok: false, error: "classify_failed" }, { status: 502 });

  const label = { ...activity.label, classify: activity.classify };
  const inserted = await q1<{ id: string; created_at: string }>(
    `INSERT INTO user_custom_goals (user_id, profile_id, title, activity_key, activity_label)
     SELECT $1, $2::uuid, $3, $4, $5::jsonb
      WHERE (SELECT COUNT(*) FROM user_custom_goals WHERE user_id=$1 AND active=true) < $6
     RETURNING id, created_at::text`,
    [session.userId, profileId, title, activity.activityKey, JSON.stringify(label), MAX_GOALS]
  );
  if (!inserted) return NextResponse.json({ ok: false, error: "limit", max: MAX_GOALS }, { status: 409 });

  return NextResponse.json({
    ok: true,
    goal: {
      id: inserted.id,
      title,
      profileId,
      activityKey: activity.activityKey,
      activityLabel: label,
      createdAt: inserted.created_at,
    },
  });
}

/* ══ DELETE {goalId} — soft delete · เช็คเจ้าของ ══ */
export async function DELETE(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-goals-del:${clientIp(req)}:${session.userId}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  let body: { goalId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const goalId = cleanGoalUuid(body.goalId);
  if (!goalId) return NextResponse.json({ ok: false, error: "bad goalId" }, { status: 400 });

  const row = await q1<{ id: string }>(
    `UPDATE user_custom_goals SET active=false
      WHERE id=$1::uuid AND user_id=$2 AND active=true
     RETURNING id`,
    [goalId, session.userId]
  );
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, goalId: row.id });
}
