import { NextResponse } from "next/server";

export async function GET() {
  const t = Date.now();
  // Sanity: try load 1 wrapper + 1 tyme4ts call
  let engineOk = false;
  let tymeOk = false;
  let qimenOk = false;
  try {
    const tyme = await import("tyme4ts");
    const ec = tyme.SolarTime.fromYmdHms(2026,5,6,12,0,0).getLunarHour().getEightChar();
    tymeOk = !!ec.getDay().getName();
  } catch {}
  try {
    const w = await import("../../../../data/library/wrappers/4-useful-god.js");
    const r = w.getUsefulGod("己");
    engineOk = r.ranks.length === 5;
  } catch {}
  try {
    const r = await fetch("http://localhost:4090/", { signal: AbortSignal.timeout(1500) });
    qimenOk = r.status < 500;
  } catch {}

  return NextResponse.json({
    ok: tymeOk && engineOk,
    services: {
      tyme4ts: tymeOk,
      engine_wrappers: engineOk,
      qimen_api: qimenOk,
    },
    elapsedMs: Date.now() - t,
    ts: new Date().toISOString(),
  });
}
