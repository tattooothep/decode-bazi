import type { Pool } from "pg";

export type NotificationEngagementEvent = "app_received" | "opened" | "action";
export type NotificationEngagementInput = {
  notificationId: string;
  installationId: string;
  event: NotificationEngagementEvent;
  actionId: string;
};

export async function recordNotificationEngagement(
  pool: Pool,
  userId: string,
  input: NotificationEngagementInput,
): Promise<"recorded" | "duplicate" | "not_found"> {
  const result = await pool.query<{ inserted: boolean }>(
     `WITH owned_target AS (
       SELECT l.id AS push_log_id,l.user_id,a.installation_id
         FROM mobile_push_log l JOIN mobile_push_attempts a ON a.push_log_id=l.id
        WHERE l.id=$2::uuid AND l.user_id=$1::uuid AND a.installation_id=$3::uuid
          AND EXISTS(
            SELECT 1 FROM mobile_push_tokens t
             WHERE t.user_id=l.user_id AND t.installation_id=a.installation_id AND t.enabled=true
          )
     ), inserted AS (
       INSERT INTO mobile_notification_engagements(user_id,installation_id,push_log_id,event,action_id)
       SELECT user_id,installation_id,push_log_id,$4,$5 FROM owned_target
       ON CONFLICT(user_id,installation_id,push_log_id,event,action_id) DO NOTHING
       RETURNING true AS inserted
     ) SELECT COALESCE((SELECT inserted FROM inserted),false) AS inserted,
              EXISTS(SELECT 1 FROM owned_target) AS owned`,
    [userId, input.notificationId, input.installationId, input.event, input.actionId],
  );
  const row = result.rows[0] as { inserted?: boolean; owned?: boolean } | undefined;
  if (row?.inserted === true) return "recorded";
  return row?.owned === true ? "duplicate" : "not_found";
}
