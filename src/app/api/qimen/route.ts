/**
 * GET /api/qimen?date=YYYY-MM-DD&time=HH:MM
 * Proxy → qimen-api at port 4090
 */
import { NextResponse } from "next/server";

const QIMEN_BASE = process.env.QIMEN_API_URL || "http://localhost:4090";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const time = url.searchParams.get("time") || "12:00";

  try {
    const target = `${QIMEN_BASE}/calculate?date=${date}&time=${time}`;
    const r = await fetch(target, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "decode-app/1.0" },
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: "qimen-api error", status: r.status, target },
        { status: 502 }
      );
    }
    const data = await r.json().catch(() => null);
    return NextResponse.json({
      source: "qimen-api",
      target,
      data,
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      {
        error: err.message,
        hint: "qimen-api may not be running on " + QIMEN_BASE,
      },
      { status: 503 }
    );
  }
}
