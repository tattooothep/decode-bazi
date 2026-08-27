const MOBILE_MARKER = "/__mobile__/";
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

export type GoogleCallbackFlow =
  | Readonly<{ kind: "web" }>
  | Readonly<{ kind: "mobile"; challenge: string }>
  | Readonly<{ kind: "invalid_mobile" }>;

export function classifyGoogleCallback(next: string | null): GoogleCallbackFlow {
  if (!next?.startsWith(MOBILE_MARKER)) return { kind: "web" };
  const challenge = next.slice(MOBILE_MARKER.length);
  return CHALLENGE_RE.test(challenge)
    ? { kind: "mobile", challenge }
    : { kind: "invalid_mobile" };
}

export function googleAccountAction(
  flow: GoogleCallbackFlow,
  browserUserId: string | null,
): "login" | "link" {
  return flow.kind === "web" && browserUserId ? "link" : "login";
}

export function googleCallbackErrorLocation(
  flow: GoogleCallbackFlow,
  mobileCode: string,
  webMessage: string,
): string {
  return flow.kind === "mobile"
    ? `hourkey://auth/google?error=${encodeURIComponent(mobileCode)}`
    : `/signup?tab=login&err=${encodeURIComponent(webMessage)}`;
}
