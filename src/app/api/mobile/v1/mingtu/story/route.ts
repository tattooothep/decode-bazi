// POST /api/mobile/v1/mingtu/story — อินโฟกราฟิกชีวิต Cinematic Life Report (22 ก.ค. 2569)
// {profileId, lang} → โหลดดวงจริงผ่าน handleMobileChart (org guard + /api/chart LOCKED เดิม ไม่คำนวณเสาใหม่)
// → content planner deterministic (ไม่เรียก AI) → prompt builder → xAI เจนภาพฉาก 9:16
// contract PRD: destiny_visual_story · เจนภาพพัง = ตอบ error ตรงๆ ห้าม fallback เงียบ
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { handleMobileChart } from "@/lib/mobile-chart-handler";
import { buildScenePrompt, buildStorySections, type ChartStoryPayload } from "@/lib/mingtu/story-planner";
import { generateSceneImage, sceneImageModel } from "@/lib/mingtu/scene-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const CONTRACT = {
  modeId: "destiny_visual_story",
  outputType: "longform_personal_infographic",
  templateId: "cinematic_personal_analysis_v1",
  requiresPortrait: true,
  allowsMascotFallback: false,
  allowsTechnicalReportFallback: false,
} as const;

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session || !session.orgId) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });

  /* เจนภาพแพง → 4 ครั้ง/ชม./user */
  const limited = await rateLimit(`mobile-mingtu-story:${clientIp(req)}:${session.userId}`, 4, 3600_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  /* clone ก่อนอ่าน body — handleMobileChart ข้างในเรียก req.clone() ซึ่งพังถ้า body ถูกใช้ไปแล้ว */
  const reqForChart = req.clone();
  let body: { profileId?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  let profileId = String(body.profileId || "").trim();
  // 22 ก.ค.: แอพอาจส่งมาไม่ทัน (ดวงยังโหลด) — ใช้ดวงหลักของบัญชีแทนการปฏิเสธ (แก้บั๊ก "เปิดไม่ได้")
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    const self = await q1<{ id: string }>(
      `SELECT id FROM profiles
        WHERE created_by_user_id=$2 AND org_id=$1 AND COALESCE(is_archived,false)=false
          AND (relationship_type IS NULL OR btrim(relationship_type) = '')
        ORDER BY created_at ASC LIMIT 1`,
      [session.orgId, session.userId]
    );
    if (!self) return NextResponse.json({ ok: false, error: "no_profile" }, { status: 404 });
    profileId = self.id;
  }
  const lang = body.lang === "en" || body.lang === "zh" ? body.lang : "th";

  console.log("[mingtu-story] REQUESTED_OUTPUT_TYPE=" + CONTRACT.outputType);
  console.log("[mingtu-story] SELECTED_TEMPLATE_ID=" + CONTRACT.templateId);
  console.log("[mingtu-story] SELECTED_RENDERER=xai-images:" + sceneImageModel());

  /* โหลดดวงจริง: reuse mobile chart bridge เดิมทั้งก้อน (org guard + loadMobileTimingProfile + /api/chart LOCKED)
   * ห้ามคำนวณเสาใหม่เองในเลเยอร์นี้ (กฎ Layer) */
  const chartResp = await handleMobileChart(reqForChart as Request, profileId);
  let chart: (ChartStoryPayload & { ok?: boolean; error?: string; profile?: { name?: string; nickname?: string | null } }) | null = null;
  try {
    chart = await chartResp.json();
  } catch {
    chart = null;
  }
  if (!chartResp.ok || !chart || chart.ok === false) {
    console.log("[mingtu-story] REQUIRED_ASSETS_STATUS=chart_failed");
    console.log("[mingtu-story] FALLBACK_ATTEMPTED=none");
    console.log("[mingtu-story] FINAL_OUTPUT_TYPE=error");
    return NextResponse.json(
      { ok: false, error: "chart_failed", detail: chart?.error || `chart status ${chartResp.status}` },
      { status: chartResp.status >= 400 ? chartResp.status : 502 }
    );
  }

  /* content planner — deterministic ล้วน จาก field จริง (ทุก field 3 ภาษา th/en/zh · lang ที่ขอใช้ฝั่ง client เลือกอ่าน) */
  const displayName = chart.profile?.nickname || chart.profile?.name || "";
  const sections = buildStorySections(displayName, chart);
  const promptUsed = buildScenePrompt(chart);

  /* เจนแผ่นฉากจริง — พังคือพัง ตอบ error ตรงๆ (allowsMascotFallback:false · allowsTechnicalReportFallback:false) */
  let imageB64: string;
  try {
    imageB64 = await generateSceneImage(promptUsed);
  } catch (e) {
    console.log("[mingtu-story] REQUIRED_ASSETS_STATUS=scene_failed");
    console.log("[mingtu-story] FALLBACK_ATTEMPTED=none");
    console.log("[mingtu-story] FINAL_OUTPUT_TYPE=error");
    return NextResponse.json(
      { ok: false, error: "scene_generation_failed", detail: String((e as Error)?.message || "").slice(0, 200) },
      { status: 502 }
    );
  }

  console.log("[mingtu-story] REQUIRED_ASSETS_STATUS=scene_ready");
  console.log("[mingtu-story] FALLBACK_ATTEMPTED=none");
  console.log("[mingtu-story] FINAL_OUTPUT_TYPE=" + CONTRACT.outputType);

  return NextResponse.json(
    {
      ok: true,
      lang,
      contract: CONTRACT,
      scene: { imageB64, promptUsed },
      sections,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
