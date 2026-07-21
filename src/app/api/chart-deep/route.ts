/**
 * GET /api/chart-deep?profile=<uuid>
 * Read-only endpoint — exposes structured 18-section chart
 * Source: src/app/chart-v2/load-profile.ts (no new logic)
 * Auth: requires session cookie · scoped to session.orgId
 */
import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, scrubFormulaTrace } from "@/lib/api-scrub";
import { getSession } from "@/lib/auth";
import { loadProfileChart } from "../../chart-v2/load-profile";
import { entitlementDenied, getProductAccess } from "@/lib/product-entitlement";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profile");
  if (!profileId) {
    return NextResponse.json({ error: "profile required (?profile=<uuid>)" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const session = await getSession();
  if (!session?.orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const productAccess = await getProductAccess(session.userId);
  if (!productAccess || (productAccess.pages.chart.detail !== "full" && productAccess.pages.chart.detail !== "technical")) {
    return NextResponse.json(
      entitlementDenied("chart_deep_locked", { plan: productAccess?.plan || "free", required_plan: "premium" }),
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const r = await loadProfileChart(profileId, session.orgId);
  if (!r) {
    return NextResponse.json({ error: "profile not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const response = {
    schema: "decode-chart-deep-v1",
    generated_at: new Date().toISOString(),
    profile_id: profileId,
    subject: r.SUBJECT,

    // 1. pillars
    pillars: r.PILLARS,

    // 2. hidden stems (already inside pillars[].hidden)
    hiddenStems: r.PILLARS.map((p) => ({ label: p.label, branch: p.branch, hidden: p.hidden })),

    // 3. interactions (9 patterns)
    interactions: r.INTERACTIONS_REAL,

    // 4. kong wang (DP + YP)
    kongWang: { dp: r.KONG_WANG, yp: r.KONG_WANG_YP, sixDestructions: r.SIX_DEST_FOUND },

    // 5. ten gods
    tenGods: r.TEN_GODS_REAL,

    // 6. elements
    elements: r.ELEMENTS_DIST,

    // 7. dm strength
    dmStrength: { percent: r.DM.strengthPercent, status: r.DM.status, dm: r.DM },

    // 8. ge ju
    geJu: r.GE_JU,
    structure: r.STRUCTURE,

    // 9. tiao hou
    tiaoHou: { climate: r.CLIMATE, yongshen: r.YONGSHEN, ji: r.JI },

    // 10. luck pillars
    luckPillars: r.LUCK_PILLARS,
    currentLp: r.CURRENT_LP,
    currentAge: r.CURRENT_AGE,
    luckStart: r.LUCK_START,

    // 11. na yin
    naYin: r.NA_YIN,

    // 12. qi phases
    qiPhases: r.QI_PHASES,

    // 13. symbolic stars
    symbolicStars: r.SHEN_SHA_FULL,
    starsTop: r.STARS_TOP,
    starsTotal: r.STARS_TOTAL,

    // 14. liu cycles
    liuCycles: r.LIU_TRANSITS,

    // 15. root + tou gan
    rootTouGan: { roots: r.ROOTS_DATA, touGan: r.TOU_GAN_DATA },

    // 16. storage / tomb
    storageTomb: r.STORAGE_DATA,

    // 17. palace reading
    palaceReading: r.PALACE_DATA,

    // 19. follow / 從格 analysis (read-only · evidence + recommendation:inspect_only)
    followAnalysis: r.FOLLOW_ANALYSIS,

    // 18. narrative / report context
    narrative: {
      today: r.TODAY,
      tongshu: r.TONGSHU_TODAY,
      hours: r.HOURS_REAL,
      compass: r.COMPASS_REAL,
      archetype: r.ARCHETYPE,
      stemMatrix: r.STEM_MATRIX,
      branchMatrix: r.BRANCH_MATRIX,
    },
  };

  return NextResponse.json({
    ...scrubFormulaTrace(response) as Record<string, unknown>,
    entitlement: {
      plan: productAccess.plan,
      detail: productAccess.pages.chart.detail,
      technical_detail: productAccess.pages.chart.detail === "technical",
    },
  }, { headers: NO_STORE_HEADERS });
}
