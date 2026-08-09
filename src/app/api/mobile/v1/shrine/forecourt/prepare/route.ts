import { guardShrineRequest, shrineJson } from "@/lib/shrine-route-guard";
import { parseForecourtPrepareInput, prepareForecourtThrow } from "@/lib/shrine-forecourt-v195";
import {
  forecourtAuthoritySecret,
  forecourtDisabledResponse,
  forecourtErrorResponse,
  readForecourtJsonBody,
} from "@/lib/shrine-forecourt-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const disabled = forecourtDisabledResponse();
  if (disabled !== null) return disabled;
  const guard = await guardShrineRequest(request, {
    scope: "forecourt-prepare-v1",
    perIp: 120,
    perBearer: 60,
    perUser: 30,
  });
  if (!guard.ok) return guard.response;
  try {
    const input = parseForecourtPrepareInput(await readForecourtJsonBody(request));
    return shrineJson(
      await prepareForecourtThrow(guard.userId, input, forecourtAuthoritySecret()),
    );
  } catch (error) {
    return forecourtErrorResponse(error);
  }
}
