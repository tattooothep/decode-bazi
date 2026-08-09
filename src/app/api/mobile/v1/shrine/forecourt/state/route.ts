import { guardShrineRequest, shrineJson } from "@/lib/shrine-route-guard";
import { getForecourtState } from "@/lib/shrine-forecourt-v195";
import {
  assertForecourtStateQuery,
  forecourtDisabledResponse,
  forecourtErrorResponse,
} from "@/lib/shrine-forecourt-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const disabled = forecourtDisabledResponse();
  if (disabled !== null) return disabled;
  const guard = await guardShrineRequest(request, {
    scope: "forecourt-state-v1",
    perIp: 180,
    perBearer: 90,
    perUser: 60,
  });
  if (!guard.ok) return guard.response;
  try {
    assertForecourtStateQuery(request);
    return shrineJson(await getForecourtState(guard.userId));
  } catch (error) {
    return forecourtErrorResponse(error);
  }
}
