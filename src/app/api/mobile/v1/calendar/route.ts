import { NextResponse } from "next/server";
import { GET as calendarGet } from "@/app/api/calendar/route";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  loadMobileTimingProfile,
  mobileProfileSummary,
} from "@/lib/mobile-timing-context";
import {getProductAccess} from "@/lib/product-entitlement";
import {PRODUCT_PAGE_ENTITLEMENTS} from "@/lib/product-page-entitlements";
import { summarizeStars } from "@/lib/star-dict-th";

export const dynamic = "force-dynamic";

function currentBangkokMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || new Date().getFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value || new Date().getMonth() + 1);
  return { year, month };
}

async function resolveInput(req: Request): Promise<{ year: number; month: number; profileId: string | null }> {
  const url = new URL(req.url);
  const fallback = currentBangkokMonth();

  if (req.method === "GET") {
    return {
      year: Number(url.searchParams.get("year") || fallback.year),
      month: Number(url.searchParams.get("month") || fallback.month),
      profileId: url.searchParams.get("profileId"),
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    year: Number((body as { year?: unknown }).year || url.searchParams.get("year") || fallback.year),
    month: Number((body as { month?: unknown }).month || url.searchParams.get("month") || fallback.month),
    profileId: (body as { profileId?: unknown }).profileId
      ? String((body as { profileId?: unknown }).profileId)
      : url.searchParams.get("profileId"),
  };
}

async function handle(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const { year, month, profileId } = await resolveInput(req);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ ok: false, error: "year and month required" }, { status: 400 });
  }

  const profile = await loadMobileTimingProfile(session, profileId);
  if (profileId && !profile) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }
  const access=await getProductAccess(session.userId);
  const caps=access?.pages.calendar||PRODUCT_PAGE_ENTITLEMENTS.free.calendar;
  if(profile&&!profile.is_self&&!caps.multi_profile) return NextResponse.json({ok:false,error:"calendar_multi_profile_locked"},{status:403});

  const url = new URL(req.url);
  url.search = "";
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));
  if (profile) url.searchParams.set("profileId", profile.id);

  const resp = await calendarGet(new Request(url.toString(), {
    headers: req.headers,
    method: "GET",
  }));
  const data = await resp.json();

  /* r521 · เติม stars_detail (ชื่อไทย + คำอธิบาย 神煞) ต่อวัน
   * เว็บ /api/calendar ตัด stars_detail ทิ้งสำหรับแผนต่ำกว่า premium (fullDetail gate)
   * แต่แอพ (r515) พร้อม render CalendarStarDetailRow แล้ว → gods เลยเป็นจีนดิบ
   * แก้: annotate เฉพาะ gods ที่แสดงอยู่ (ตาม entitlement · ไม่เปิดเพิ่ม) ด้วยคลัง star-dict-th
   * additive: เติมเฉพาะวันที่ยังไม่มี stars_detail · ไม่แตะ gods/score/verdict · คำที่คลังไม่มี = อยู่ใน unknown (แอพ fallback จีน) */
  if (data && Array.isArray(data.days)) {
    for (const day of data.days) {
      if (day && !day.stars_detail && day.gods) {
        const names = [
          ...(Array.isArray(day.gods.good) ? day.gods.good : []),
          ...(Array.isArray(day.gods.bad) ? day.gods.bad : []),
          ...(Array.isArray(day.gods.unknown) ? day.gods.unknown : []),
        ].filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
        if (names.length) {
          // ตัด verdict/pos_sum/neg_sum/applied_rule ออก — เว็บกั๊กฟันธงรายวันไว้ให้ premium (fullDetail gate)
          const { good, bad, unknown } = summarizeStars(names);
          day.stars_detail = { good, bad, unknown };
        }
      }
    }
  }

  return NextResponse.json(
    {
      ok: resp.ok,
      profile: profile ? mobileProfileSummary(profile) : null,
      source: "/api/calendar",
      ...data,
    },
    { status: resp.status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
