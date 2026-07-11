/**
 * Base URL for server-to-server calls back into this app.
 * Production must not reuse req.url: reverse proxies can advertise HTTPS while
 * the local Next.js upstream only speaks HTTP, causing TLS failures.
 */
export function internalAppOrigin(req: Request, env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.HOURKEY_INTERNAL_APP_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (env.NODE_ENV === "production") {
    return String(env.SIFU_INTERNAL_BASE_URL || "http://127.0.0.1:3349").replace(/\/+$/, "");
  }
  return new URL(req.url).origin;
}
