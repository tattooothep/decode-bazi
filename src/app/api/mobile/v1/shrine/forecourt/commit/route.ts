import { guardShrineRequest, shrineJson } from "@/lib/shrine-route-guard";
import { commitForecourtThrow, parseForecourtCommitInput } from "@/lib/shrine-forecourt-v195";
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
    scope: "forecourt-commit-v1",
    perIp: 180,
    perBearer: 90,
    perUser: 60,
  });
  if (!guard.ok) return guard.response;
  try {
    const input = parseForecourtCommitInput(await readForecourtJsonBody(request));
    return shrineJson(
      await commitForecourtThrow(guard.userId, input, forecourtAuthoritySecret()),
    );
  } catch (error) {
    return forecourtErrorResponse(error);
  }
}
