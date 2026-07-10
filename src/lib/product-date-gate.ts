import { getSession } from "@/lib/auth";
import { getProductAccess, PRODUCT_PAGE_ENTITLEMENTS, type ProductPlan } from "@/lib/product-entitlement";

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

export function withinDayWindow(date: string, windowDays: number, today = bangkokToday()): boolean {
  const target = dateDay(date);
  const base = dateDay(today);
  return target !== null && base !== null && Math.abs(target - base) <= Math.max(0, windowDays);
}

export function withinMonthWindow(year: number, month: number, windowMonths: number, today = bangkokToday()): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false;
  const [cy, cm] = today.split("-").map(Number);
  return Math.abs(year * 12 + month - (cy * 12 + cm)) <= Math.max(0, windowMonths);
}

export async function currentDateWindow(page: "today" | "calendar") {
  const session = await getSession();
  const access = session ? await getProductAccess(session.userId) : null;
  const plan: ProductPlan = access?.plan || "free";
  const pages = access?.pages || PRODUCT_PAGE_ENTITLEMENTS.free;
  return {
    plan,
    userId: session?.userId || null,
    max: page === "today" ? pages.today.day_window : pages.calendar.month_window,
  };
}

