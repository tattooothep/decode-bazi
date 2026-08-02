import { mobileBearerToken, validateMobileBearerToken } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createShrineRealtimeSessionHandler } from "@/lib/shrine-realtime-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = createShrineRealtimeSessionHandler({
  bearerToken: mobileBearerToken,
  clientIp,
  fetch: (input, init) => globalThis.fetch(input, init),
  nowSeconds: () => Math.floor(Date.now() / 1_000),
  openAiApiKey: () => process.env.OPENAI_API_KEY ?? "",
  providerTimeoutMs: 10_000,
  rateLimit,
  validateBearer: async (token) => {
    const session = await validateMobileBearerToken(token);
    return session
      ? { orgId: session.orgId ?? null, userId: session.userId }
      : null;
  },
});

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
