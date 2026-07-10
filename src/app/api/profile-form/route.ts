import { getSession } from "@/lib/auth";
import { upsertSelfProfile } from "@/lib/self-profile";

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return redirect303("/signup?tab=login&err=" + encodeURIComponent("กรุณาเข้าสู่ระบบก่อน"));

  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const birthDate = String(form.get("birthDate") || "");
  const birthTimeKnown = form.get("birthTimeUnknown") !== "1";
  const birthTime = birthTimeKnown ? String(form.get("birthTime") || "12:00") : "12:00";
  const locationName = String(form.get("locationName") || "Bangkok");
  const gender = String(form.get("gender") || "M");
  if (!name || !birthDate) return redirect303("/onboarding?err=" + encodeURIComponent("กรอก ชื่อ + วันเกิด"));

  // Codex direction: self-profile upsert · derived columns via shared calcBazi
  await upsertSelfProfile(s, {
    name,
    birthDate,
    birthTime,
    birthLat: 13.7563,
    birthLng: 100.5018,
    locationName,
    gender: gender as "M" | "F",
    birthTimeKnown,
  });

  return redirect303("/master?intro=1&next=" + encodeURIComponent("/today"));
}
