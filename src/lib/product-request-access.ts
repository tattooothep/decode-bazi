import { getSession, type Session } from "@/lib/auth";
import { validateMobileBearerToken } from "@/lib/mobile-auth";
import {
  getProductAccess,
  PRODUCT_PAGE_ENTITLEMENTS,
  type ProductPlan,
} from "@/lib/product-entitlement";

/**
 * Resolve the product contract for the current HTTP request.
 * Anonymous users and entitlement lookup failures fail closed to the free plan.
 */
async function requestSession(req?: Request): Promise<Session | null> {
  const authorization = req?.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const session = bearer ? await validateMobileBearerToken(bearer) : await getSession();
  return session || null;
}

export async function currentRequestProductAccess(req?: Request) {
  const session = await requestSession(req);
  const access = session
    ? await getProductAccess(session.userId).catch(() => null)
    : null;
  const plan: ProductPlan = access?.plan || "free";
  return {
    session,
    access,
    plan,
    pages: access?.pages || PRODUCT_PAGE_ENTITLEMENTS.free,
  };
}

export function nextRequiredPlan(plan: ProductPlan): "trial" | "premium" | "master" {
  if (plan === "free") return "trial";
  if (plan === "trial") return "premium";
  return "master";
}
