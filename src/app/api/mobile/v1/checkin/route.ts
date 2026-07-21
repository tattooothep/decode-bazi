// POST/GET /api/mobile/v1/checkin — สายบุญต่อเนื่อง (streak) + ยามหยดเล็ก (21 ก.ค. 2569)
// เช็คอินวันละครั้ง (วันไทย tz+7): นับวันติดต่อกัน · รางวัล +1 ยาม/วัน · ครบทุก 7 วัน +5 · ครบทุก 30 วัน +20
// กันซ้ำด้วย PRIMARY KEY (user_id, day) — insert ชนกัน = ไม่ให้รางวัลซ้ำ (atomic)
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q, q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAILY_REWARD = 1;
const WEEK_BONUS = 5;
const MONTH_BONUS = 20;

/** วันตามเวลาไทย (สัญญาเดียวกับ mobile-yam-push-cron) */
function thaiDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function rewardFor(streak: number): number {
  let r = DAILY_REWARD;
  if (streak % 7 === 0) r += WEEK_BONUS;
  if (streak % 30 === 0) r += MONTH_BONUS;
  return r;
}

async function currentView(userId: string) {
  const today = thaiDay();
  const yesterday = thaiDay(-1);
  const last = await q1<{ day: string; streak: number }>(
    `SELECT day::text, streak FROM mobile_checkins WHERE user_id=$1 ORDER BY day DESC LIMIT 1`,
    [userId]
  );
  const checkedToday = last?.day === today;
  // streak ปัจจุบัน: วันนี้เช็คแล้วใช้ค่านั้น · เมื่อวานเช็ค = ยังต่อได้ · เก่ากว่า = ขาดแล้ว (นับใหม่)
  const streak = checkedToday ? last!.streak : last?.day === yesterday ? last.streak : 0;
  const nextStreak = checkedToday ? last!.streak : streak + 1;
  return { today, yesterday, checkedToday, streak, nextStreak, nextReward: rewardFor(nextStreak) };
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const v = await currentView(session.userId);
  return NextResponse.json(
    { ok: true, checkedToday: v.checkedToday, streak: v.streak, nextReward: v.checkedToday ? 0 : v.nextReward },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-checkin:${clientIp(req)}:${session.userId}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  const v = await currentView(session.userId);
  if (v.checkedToday) {
    return NextResponse.json({ ok: true, alreadyChecked: true, streak: v.streak, reward: 0 });
  }
  const streak = v.nextStreak;
  const reward = rewardFor(streak);
  // insert ก่อน (PK กันซ้ำ) — ชนกัน = มีคนเช็คไปแล้วใน request คู่ขนาน ไม่ให้รางวัลซ้ำ
  const ins = await q1<{ day: string }>(
    `INSERT INTO mobile_checkins (user_id, day, streak, reward) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, day) DO NOTHING RETURNING day::text`,
    [session.userId, v.today, streak, reward]
  );
  if (!ins) {
    const again = await currentView(session.userId);
    return NextResponse.json({ ok: true, alreadyChecked: true, streak: again.streak, reward: 0 });
  }
  const row = await q1<{ hour_balance: number }>(
    `UPDATE users SET hour_balance = hour_balance + $2 WHERE id=$1 RETURNING hour_balance`,
    [session.userId, reward]
  );
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature)
     VALUES ($1, $2, 'checkin_daily', $3, 'checkin')`,
    [session.userId, reward, row?.hour_balance ?? 0]
  ).catch(() => {});
  return NextResponse.json({
    ok: true,
    streak,
    reward,
    weekBonus: streak % 7 === 0,
    monthBonus: streak % 30 === 0,
    balance_after: row?.hour_balance ?? null,
  });
}
