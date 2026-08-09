import {
  guardShrineRequest,
  readJsonBody,
  shrineJson,
} from "@/lib/shrine-route-guard";
import { parseStrikeInput, recordStrike } from "@/lib/shrine-ritual-strike";

/** ตีระฆัง · ตีกลอง · เคาะปลา — บันทึกผลรอบหนึ่ง */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardShrineRequest(req, {
    scope: "strike",
    perIp: 120,
    perBearer: 60,
    perUser: 40,
  });
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(req);
  if (body === null) return shrineJson({ ok: false, error: "invalid_body" }, 400);
  let input;
  try {
    input = parseStrikeInput(body);
  } catch (error) {
    return shrineJson(
      { ok: false, error: error instanceof Error ? error.message : "invalid_body" },
      400,
    );
  }
  const result = await recordStrike(guard.userId, input);
  if (!result.ok) {
    return shrineJson(result, "status" in result ? result.status : 400);
  }
  return shrineJson(result);
}
