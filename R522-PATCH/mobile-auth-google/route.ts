// GET /api/mobile/v1/auth/google — ความพร้อมของปุ่ม Google บนแอพ (กันปุ่มหลอก)
// available=true เมื่อ Google OAuth ฝั่งเว็บตั้งค่าครบ (client id/secret/redirect ใน env)
import { NextResponse } from "next/server";
import { isReady } from "@/lib/oauth-google";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      available: isReady(),
      // แอพเปิด URL นี้ใน browser แล้วรอ deep link hourkey://auth/google?code=...
      start_path: "/api/mobile/v1/auth/google/start",
      redirect_scheme: "hourkey://auth/google",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
