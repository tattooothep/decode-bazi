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

export async function POST(req: Request) {
  /* 1 มิ.ย. · ดูคะแนนเครือข่ายต้องสมัคร/login ก่อน (เจ้านายสั่ง) */
  if (!(await (await import("@/lib/auth")).getSession())) {
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

  const payload = await buildNetworkScorePayload(body, req.url);
  if ((payload as any)?.error) return NextResponse.json(payload, { status: 400 });
  return NextResponse.json(payload);
}
