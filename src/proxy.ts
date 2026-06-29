import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "decode_auth";

const PROTECTED_PATHS = new Set([
  "/calendar",
  "/calendar.html",
  "/chart",
  "/chart.html",
  "/chart-v2",
  "/chartv2",
  "/compare",
  "/comparison",
  "/comparison.html",
  "/datepick",
  "/datepick.html",
  "/input",
  "/input.html",
  "/master",
  "/master.html",
  "/master-fusion",
  "/master-fusion.html",
  "/network",
  "/qimen",
  "/qimen.html",
  "/today",
  "/today.html",
  "/yongsennetwork",
  "/yongsennetwork.html",
]);

const PROTECTED_PREFIXES = [
  "/chart-v2/",
];

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.has(pathname) || PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return false;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return typeof payload.userId === "string" && payload.userId.length > 0;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const pathname = normalizePath(req.nextUrl.pathname);
  if (!isProtectedPath(pathname)) return NextResponse.next();

  if (await hasValidSession(req)) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/signup";
  loginUrl.search = "";
  loginUrl.searchParams.set("tab", "login");
  loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/calendar",
    "/calendar.html",
    "/chart",
    "/chart.html",
    "/chart-v2",
    "/chart-v2/:path*",
    "/chartv2",
    "/compare",
    "/comparison",
    "/comparison.html",
    "/datepick",
    "/datepick.html",
    "/input",
    "/input.html",
    "/master",
    "/master.html",
    "/master-fusion",
    "/master-fusion.html",
    "/network",
    "/qimen",
    "/qimen.html",
    "/today",
    "/today.html",
    "/yongsennetwork",
    "/yongsennetwork.html",
  ],
};
