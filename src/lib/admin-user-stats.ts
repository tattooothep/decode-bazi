/**
 * สถิติผู้ใช้หลังบ้าน (User Statistics) — แหล่งเดียวใช้ร่วมกันระหว่าง
 * หน้า /admin (server render) และ /api/admin/user-stats (JSON)
 *
 * กติกา: ข้อมูลจริงจาก DB ทั้งหมด · ไม่มี mockup · รวม SQL แค่ 2 query
 * นิยาม "ออนไลน์ตอนนี้" = users.last_active_at ภายใน 15 นาที
 * (last_active_at อัปเดตตอน login / ใช้งาน AI / เรียก GET /api/profile ซึ่งทุกหน้าโหลด — throttle 5 นาที)
 */
import { q, q1 } from "@/lib/db";

export const ONLINE_WINDOW_MINUTES = 15;

export type SignupDailyPoint = { d: string; n: number };
export type OnlineUser = { email: string; name: string | null; last_active_at: string };
export type RecentUser = {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  hour_balance: number;
  verified: boolean;
  signup_method: "email" | "phone" | "google" | "line";
  created_at: string;
  last_active_at: string | null;
  online: boolean;
};

export type UserStats = {
  onlineNow: number;
  onlineUsers: OnlineUser[];
  users: {
    total: number;
    dau: number;
    wau: number;
    mau: number;
    verified: number;
    unverified: number;
    signupEmail: number;
    signupPhone: number;
    signupGoogle: number;
    signupLine: number;
    planFree: number;
    planPaid: number;
    newToday: number;
    new7d: number;
    new30d: number;
  };
  signupDaily: SignupDailyPoint[];
  yam: { balanceTotal: number; balanceAvg: number; spentTotal: number };
  features: {
    fusionToday: number;
    fusion7d: number;
    palmToday: number;
    palm7d: number;
    exportToday: number;
    export7d: number;
    hourkeyToday: number;
    hourkey7d: number;
  };
  revenue: { ordersWeek: number; thbWeek: number; ordersMonth: number; thbMonth: number };
  recentUsers: RecentUser[];
  onlineWindowMinutes: number;
  generatedAt: string;
};

type CoreRow = {
  u: Record<string, number> | null;
  online_list: OnlineUser[] | null;
  signup_daily: SignupDailyPoint[] | null;
  yam_spent: number | null;
  features: Record<string, number> | null;
  revenue: Record<string, number> | null;
};

const num = (v: unknown) => Number(v || 0);

/* query เดียวรวม aggregate ทั้งหมด (users + jobs 4 ตาราง + orders + ledger) */
const CORE_SQL = `
WITH u AS (SELECT * FROM users WHERE deleted_at IS NULL),
     bkk AS (SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date AS today)
SELECT
  (SELECT row_to_json(t) FROM (
     SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE last_active_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes')::int AS online_now,
       COUNT(*) FILTER (WHERE last_active_at >= now() - interval '24 hours')::int AS dau,
       COUNT(*) FILTER (WHERE last_active_at >= now() - interval '7 days')::int AS wau,
       COUNT(*) FILTER (WHERE last_active_at >= now() - interval '30 days')::int AS mau,
       COUNT(*) FILTER (WHERE email_verified=true OR phone_verified=true)::int AS verified,
       COUNT(*) FILTER (WHERE COALESCE(email_verified,false)=false AND COALESCE(phone_verified,false)=false)::int AS unverified,
       COUNT(*) FILTER (WHERE email LIKE 'phone.%@hourkey.local')::int AS signup_phone,
       COUNT(*) FILTER (WHERE google_user_id IS NOT NULL)::int AS signup_google,
       COUNT(*) FILTER (WHERE line_user_id IS NOT NULL)::int AS signup_line,
       COUNT(*) FILTER (WHERE email NOT LIKE 'phone.%@hourkey.local' AND google_user_id IS NULL AND line_user_id IS NULL)::int AS signup_email,
       COUNT(*) FILTER (WHERE tier='free')::int AS plan_free,
       COUNT(*) FILTER (WHERE tier IS DISTINCT FROM 'free')::int AS plan_paid,
       COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date = (SELECT today FROM bkk))::int AS new_today,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS new_7d,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS new_30d,
       COALESCE(SUM(hour_balance),0)::int AS yam_balance,
       COALESCE(ROUND(AVG(hour_balance)),0)::int AS yam_avg
     FROM u) t) AS u,
  (SELECT COALESCE(json_agg(json_build_object(
            'email', email, 'name', name, 'last_active_at', last_active_at::text)
            ORDER BY last_active_at DESC), '[]'::json)
     FROM u WHERE last_active_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes') AS online_list,
  (SELECT json_agg(json_build_object('d', to_char(days.d,'MM-DD'), 'n', COALESCE(s.n,0)) ORDER BY days.d)
     FROM (SELECT generate_series((SELECT today FROM bkk) - 29, (SELECT today FROM bkk), '1 day'::interval)::date AS d) days
     LEFT JOIN (SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date AS d, COUNT(*)::int AS n
                  FROM u GROUP BY 1) s ON s.d = days.d) AS signup_daily,
  (SELECT COALESCE(SUM(-delta),0)::int FROM hour_transactions WHERE delta < 0) AS yam_spent,
  (SELECT row_to_json(f) FROM (
     SELECT
       (SELECT COUNT(*)::int FROM fusion5_jobs WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date=(SELECT today FROM bkk)) AS fusion_today,
       (SELECT COUNT(*)::int FROM fusion5_jobs WHERE created_at >= now() - interval '7 days') AS fusion_7d,
       (SELECT COUNT(*)::int FROM palm_jobs WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date=(SELECT today FROM bkk)) AS palm_today,
       (SELECT COUNT(*)::int FROM palm_jobs WHERE created_at >= now() - interval '7 days') AS palm_7d,
       (SELECT COUNT(*)::int FROM export_jobs WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date=(SELECT today FROM bkk)) AS export_today,
       (SELECT COUNT(*)::int FROM export_jobs WHERE created_at >= now() - interval '7 days') AS export_7d,
       (SELECT COUNT(*)::int FROM hourkey_jobs WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date=(SELECT today FROM bkk)) AS hourkey_today,
       (SELECT COUNT(*)::int FROM hourkey_jobs WHERE created_at >= now() - interval '7 days') AS hourkey_7d
  ) f) AS features,
  (SELECT row_to_json(r) FROM (
     SELECT
       COUNT(*) FILTER (WHERE paid_at >= (date_trunc('week',  now() AT TIME ZONE 'Asia/Bangkok')) AT TIME ZONE 'Asia/Bangkok')::int AS orders_week,
       COALESCE(SUM(amount_thb) FILTER (WHERE paid_at >= (date_trunc('week',  now() AT TIME ZONE 'Asia/Bangkok')) AT TIME ZONE 'Asia/Bangkok'),0)::int AS thb_week,
       COUNT(*) FILTER (WHERE paid_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')) AT TIME ZONE 'Asia/Bangkok')::int AS orders_month,
       COALESCE(SUM(amount_thb) FILTER (WHERE paid_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')) AT TIME ZONE 'Asia/Bangkok'),0)::int AS thb_month
     FROM orders WHERE status='paid') r) AS revenue
`;

const RECENT_SQL = `
SELECT id, email, name, tier,
       COALESCE(hour_balance,0)::int AS hour_balance,
       (COALESCE(email_verified,false) OR COALESCE(phone_verified,false)) AS verified,
       CASE WHEN email LIKE 'phone.%@hourkey.local' THEN 'phone'
            WHEN google_user_id IS NOT NULL THEN 'google'
            WHEN line_user_id IS NOT NULL THEN 'line'
            ELSE 'email' END AS signup_method,
       created_at::text AS created_at,
       last_active_at::text AS last_active_at,
       COALESCE(last_active_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes', false) AS online
  FROM users
 WHERE deleted_at IS NULL
 ORDER BY created_at DESC
 LIMIT 20
`;

export async function loadUserStats(): Promise<UserStats> {
  const [core, recent] = await Promise.all([
    q1<CoreRow>(CORE_SQL, []).catch((err) => {
      console.warn("[admin user-stats] core query failed", (err as Error).message);
      return null;
    }),
    q<RecentUser>(RECENT_SQL, []).catch((err) => {
      console.warn("[admin user-stats] recent query failed", (err as Error).message);
      return [] as RecentUser[];
    }),
  ]);

  const u = core?.u || {};
  const f = core?.features || {};
  const r = core?.revenue || {};

  return {
    onlineNow: num(u.online_now),
    onlineUsers: Array.isArray(core?.online_list) ? core.online_list : [],
    users: {
      total: num(u.total),
      dau: num(u.dau),
      wau: num(u.wau),
      mau: num(u.mau),
      verified: num(u.verified),
      unverified: num(u.unverified),
      signupEmail: num(u.signup_email),
      signupPhone: num(u.signup_phone),
      signupGoogle: num(u.signup_google),
      signupLine: num(u.signup_line),
      planFree: num(u.plan_free),
      planPaid: num(u.plan_paid),
      newToday: num(u.new_today),
      new7d: num(u.new_7d),
      new30d: num(u.new_30d),
    },
    signupDaily: Array.isArray(core?.signup_daily) ? core.signup_daily : [],
    yam: {
      balanceTotal: num(u.yam_balance),
      balanceAvg: num(u.yam_avg),
      spentTotal: num(core?.yam_spent),
    },
    features: {
      fusionToday: num(f.fusion_today),
      fusion7d: num(f.fusion_7d),
      palmToday: num(f.palm_today),
      palm7d: num(f.palm_7d),
      exportToday: num(f.export_today),
      export7d: num(f.export_7d),
      hourkeyToday: num(f.hourkey_today),
      hourkey7d: num(f.hourkey_7d),
    },
    revenue: {
      ordersWeek: num(r.orders_week),
      thbWeek: num(r.thb_week),
      ordersMonth: num(r.orders_month),
      thbMonth: num(r.thb_month),
    },
    recentUsers: recent,
    onlineWindowMinutes: ONLINE_WINDOW_MINUTES,
    generatedAt: new Date().toISOString(),
  };
}
