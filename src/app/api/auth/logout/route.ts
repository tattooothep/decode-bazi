import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

export async function POST(req: Request) {
  await clearAuthCookie();
  if ((req.headers.get("accept") || "").includes("text/html")) {
    const origin = process.env.NODE_ENV === "production" ? "https://hourkey.io" : new URL(req.url).origin;
    return NextResponse.redirect(new URL("/signup?tab=login", origin), { status: 303 });
  }
  return NextResponse.json({ ok: true });
}
