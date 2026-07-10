/**
 * POST /api/network/score
 *
 * Body: {
 *   self:   { day:{stem,branch}, year:{stem,branch}, month:{stem,branch}, hour:{stem,branch} },
 *   others: [ { id, day, year, month, hour } ]
 * }
 *
 * Returns: { scores: { [id]: { day, week, month, year, luck } }, tags: { [id]: string[] } }
 */
import { NextResponse } from "next/server";
import { buildNetworkScorePayload } from "@/lib/scoring/network-score-payload";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { entitlementDenied, getProductAccess } from "@/lib/product-entitlement";

const PAIR_COMPARE_TRIAL_REASON = "use_network_pair_compare_trial";

export async function POST(req: Request) {
  /* 1 มิ.ย. · ดูคะแนนเครือข่ายต้องสมัคร/login ก่อน (เจ้านายสั่ง) */
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "not logged in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const access = await getProductAccess(session.userId);
  const caps = access?.pages.network;
  const plan = access?.plan || "free";
  const purpose = body.purpose === "pair_compare" ? "pair_compare" : "visualization";
  const requestedOthers = Array.isArray(body.others) ? body.others : [];

  if (purpose === "pair_compare" && (!caps || caps.pair_compare === "locked")) {
    return NextResponse.json(entitlementDenied("network_pair_compare_locked", { plan }), { status: 403 });
  }
  if (purpose === "pair_compare" && requestedOthers.length !== 1) {
    return NextResponse.json({ error: "pair_compare_requires_one_other" }, { status: 400 });
  }
  if (purpose === "pair_compare" && caps?.pair_compare === "once") {
    const used = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM hour_transactions WHERE user_id=$1 AND reason=$2`,
      [session.userId, PAIR_COMPARE_TRIAL_REASON]
    );
    if ((Number(used?.n) || 0) >= 1) {
      return NextResponse.json(entitlementDenied("network_pair_compare_trial_used", { plan, max: 1 }), { status: 403 });
    }
  }

  const visualizationLimit = Math.max(0, (caps?.visualization_profiles || 1) - 1);
  const allowedOthers = purpose === "pair_compare" ? requestedOthers : requestedOthers.slice(0, visualizationLimit);
  const lockedProfileIds = purpose === "pair_compare"
    ? []
    : requestedOthers.slice(visualizationLimit).map((entry: any) => String(entry?.id || "")).filter(Boolean);
  body = { ...body, others: allowedOthers };

  if (purpose === "visualization" && allowedOthers.length === 0) {
    const fullVisualization = plan === "premium" || plan === "master";
    return NextResponse.json({
      scores: {}, tags: {}, labels: {},
      ...(fullVisualization ? { guidance: {}, directional: {}, breakdown: {} } : {}),
      entitlement: {
        plan,
        purpose,
        visualization_profiles: caps?.visualization_profiles || 1,
        locked_profile_ids: lockedProfileIds,
      },
    });
  }

  const payload = await buildNetworkScorePayload(body, req.url);
  if ((payload as any)?.error) return NextResponse.json(payload, { status: 400 });
  if (purpose === "pair_compare" && caps?.pair_compare === "once") {
    try {
      const claimed = await q1<{ id: string }>(
        `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature)
         SELECT id, 0, $2::varchar, hour_balance, 'network_pair_compare'
           FROM users
          WHERE id=$1
            AND NOT EXISTS (SELECT 1 FROM hour_transactions WHERE user_id=$1 AND reason=$2::varchar)
         RETURNING id`,
        [session.userId, PAIR_COMPARE_TRIAL_REASON]
      );
      if (!claimed) {
        return NextResponse.json(entitlementDenied("network_pair_compare_trial_used", { plan, max: 1 }), { status: 403 });
      }
    } catch (error: any) {
      if (error?.code === "23505") {
        return NextResponse.json(entitlementDenied("network_pair_compare_trial_used", { plan, max: 1 }), { status: 403 });
      }
      throw error;
    }
  }

  const fullVisualization = plan === "premium" || plan === "master" || purpose === "pair_compare";
  const shaped = fullVisualization ? payload : {
    version: (payload as any).version,
    scores: (payload as any).scores || {},
    tags: (payload as any).tags || {},
    labels: (payload as any).labels || {},
  };
  return NextResponse.json({
    ...shaped,
    entitlement: {
      plan,
      purpose,
      visualization_profiles: caps?.visualization_profiles || 1,
      pair_compare: caps?.pair_compare || "locked",
      locked_profile_ids: lockedProfileIds,
    },
  });
}
