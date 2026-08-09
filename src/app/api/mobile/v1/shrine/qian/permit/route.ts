import {
  guardShrineRequest,
  readJsonBody,
  shrineJson,
} from "@/lib/shrine-route-guard";
import { castQianPermit, parseQianPermitInput } from "@/lib/shrine-qian";

/** ประตูขออนุญาตก่อนเสี่ยงเซียมซี — โยนจอกให้ได้ซิ่วปัว 3 ครั้งติด */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardShrineRequest(req, {
    scope: "qian-permit",
    perIp: 60,
    perBearer: 30,
    perUser: 20,
  });
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(req);
  if (body === null) return shrineJson({ ok: false, error: "invalid_body" }, 400);
  let input;
  try {
    input = parseQianPermitInput(body);
  } catch (error) {
    return shrineJson(
      { ok: false, error: error instanceof Error ? error.message : "invalid_body" },
      400,
    );
  }
  const result = await castQianPermit(guard.userId, input);
  if (!result.ok) {
    return shrineJson(result, "status" in result ? result.status : 400);
  }
  return shrineJson(result);
}
