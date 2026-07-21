import type { Pool, PoolClient } from "pg";
import { pool } from "@/lib/db";

export const NOTIFICATION_EVENT_TYPES = [
  "user_signup",
  "order_paid",
  "job_fail_spike",
  "support_report_new",
  "support_user_reply",
  "support_admin_reply",
  "support_status_changed",
  "payment_exception",
  "refund_failed",
  "service_unhealthy",
  "service_recovered",
  "admin_role_changed",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export type NotificationSeverity = "info" | "warning" | "critical";
type Queryable = Pick<Pool | PoolClient, "query">;

export type EnqueueNotificationInput = {
  eventType: NotificationEventType;
  severity?: NotificationSeverity;
  audienceKind: "admin" | "user";
  audienceRoles?: string[];
  requiredPermission?: string | null;
  recipientUserId?: string | null;
  dedupeKey: string;
  targetUrl: string;
  payload?: Record<string, unknown>;
  availableAt?: Date;
  expiresAt?: Date;
};

function safeTargetUrl(raw: string): string {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value.slice(0, 700);
}

export async function enqueueNotification(
  input: EnqueueNotificationInput,
  db: Queryable = pool
): Promise<string> {
  if (input.audienceKind === "user" && !input.recipientUserId) {
    throw new Error("recipient_user_id_required");
  }
  const dedupeKey = String(input.dedupeKey || "").trim().slice(0, 240);
  if (!dedupeKey) throw new Error("dedupe_key_required");
  const values = [
    input.eventType,
    input.severity || "info",
    input.audienceKind,
    input.audienceRoles || [],
    input.requiredPermission || null,
    input.recipientUserId || null,
    dedupeKey,
    safeTargetUrl(input.targetUrl),
    JSON.stringify(input.payload || {}),
    input.availableAt || new Date(),
    input.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  ];
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO notification_events
       (event_type,severity,audience_kind,audience_roles,required_permission,
        recipient_user_id,dedupe_key,target_url,payload,available_at,expires_at)
     VALUES ($1,$2,$3,$4::text[],$5,$6::uuid,$7,$8,$9::jsonb,$10,$11)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    values
  );
  if (inserted.rows[0]?.id) return inserted.rows[0].id;
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM notification_events WHERE dedupe_key=$1`,
    [dedupeKey]
  );
  if (!existing.rows[0]?.id) throw new Error("notification_enqueue_failed");
  return existing.rows[0].id;
}
