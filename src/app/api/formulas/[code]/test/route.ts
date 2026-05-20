import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { FORMULA_OUTPUT_MAP, PRESET_PROFILES } from "@/lib/formula-output-map";
import { loadProfileChart } from "@/app/chart-v2/load-profile";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId") || PRESET_PROFILES[0].id;

  // Fetch profile to know org_id
  const profile = await q1<{ id: string; org_id: string; name: string; birth_datetime: string }>(
    `SELECT id, org_id, name, birth_datetime FROM profiles WHERE id=$1 LIMIT 1`,
    [profileId]
  );
  if (!profile) return NextResponse.json({ error: "profile not found" }, { status: 404 });

  const real = await loadProfileChart(profileId, profile.org_id);
  if (!real) return NextResponse.json({ error: "chart calc failed" }, { status: 500 });

  const extractor = FORMULA_OUTPUT_MAP[code];
  if (!extractor) {
    return NextResponse.json({
      ok: false,
      reason: "no_output_map",
      message: "สูตรนี้ยังไม่มี output extractor · ดู /chart-v2?profile=" + profileId,
      profile: { id: profile.id, name: profile.name, born: profile.birth_datetime },
    });
  }

  let output: unknown;
  let error: string | null = null;
  try {
    output = extractor(real as unknown as Record<string, unknown>);
  } catch (e) {
    error = String(e).slice(0, 200);
  }

  return NextResponse.json({
    ok: !error,
    code,
    profile: {
      id: profile.id,
      name: profile.name,
      born: profile.birth_datetime,
    },
    output,
    error,
    chart_url: `/chart-v2?profile=${profile.id}`,
  });
}
