const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Add the authoritative durable parent ID at the authenticated history edge.
 *
 * Producer facts are stored before PostgreSQL creates the parent UUID, while
 * native provider envelopes are created afterwards. Notification Center must
 * expose the same routable envelope without trusting a stale/colliding ID from
 * stored JSON.
 */
export function notificationHistoryPayload(
  notificationId: string,
  payload: unknown,
): Readonly<Record<string, unknown>> | null {
  if (!UUID_RE.test(notificationId) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(payload);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return Object.freeze({ ...(payload as Record<string, unknown>), notificationId });
}
