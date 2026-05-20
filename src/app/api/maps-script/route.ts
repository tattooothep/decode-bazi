/**
 * GET /api/maps-script?callback=hkInitPlaces
 *
 * Proxy ไปยัง Google Maps JS API · ส่ง browser key จาก env (ไม่ expose ใน HTML)
 * โหลด Places library พร้อม callback ที่ frontend ส่งมา
 *
 * ใช้โดย /input.html (สถานที่เกิด autocomplete)
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const callback = (url.searchParams.get("callback") || "hkInitPlaces").replace(/[^a-zA-Z0-9_]/g, "");
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    "";
  if (!key) {
    return new NextResponse(
      `// /api/maps-script · GOOGLE_MAPS_BROWSER_KEY ไม่ได้ตั้งค่าใน .env\nconsole.error('[maps-script] missing GOOGLE_MAPS_BROWSER_KEY');`,
      { status: 503, headers: { "Content-Type": "application/javascript; charset=utf-8" } }
    );
  }

  const target =
    `https://maps.googleapis.com/maps/api/js` +
    `?key=${encodeURIComponent(key)}` +
    `&libraries=places` +
    `&callback=${encodeURIComponent(callback)}` +
    `&loading=async` +
    `&v=weekly`;

  try {
    const r = await fetch(target, { redirect: "follow" });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      },
    });
  } catch (err) {
    return new NextResponse(
      `// /api/maps-script · fetch error: ${String(err).slice(0, 200)}`,
      { status: 502, headers: { "Content-Type": "application/javascript; charset=utf-8" } }
    );
  }
}
