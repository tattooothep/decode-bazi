import {
  guardShrineRequest,
  readJsonBody,
  shrineJson,
} from "@/lib/shrine-route-guard";
import { drawQian, parseQianDrawInput } from "@/lib/shrine-qian";

/** จับใบเซียมซี — ต้องผ่านประตูขออนุญาตมาก่อนเท่านั้น */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardShrineRequest(req, {
    scope: "qian-draw",
    perIp: 40,
    perBearer: 20,
    perUser: 10,
  });
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(req);
  if (body === null) return shrineJson({ ok: false, error: "invalid_body" }, 400);
  let input;
  try {
    input = parseQianDrawInput(body);
  } catch (error) {
    return shrineJson(
      { ok: false, error: error instanceof Error ? error.message : "invalid_body" },
      400,
    );
  }
  const result = await drawQian(guard.userId, input);
  if (!result.ok) {
    return shrineJson(result, "status" in result ? result.status : 400);
  }
  return shrineJson(result);
}
