import type { Pool } from "pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const AUDIENCE_RE = /^[A-Za-z0-9_-]{22,64}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;

export type ScienceNotificationCategory = "astronomy_fact" | "qizheng";

export type ScienceNotificationDetailDb = Pick<Pool, "query">;

export type ScienceNotificationDetailInput = Readonly<{
  userId: string;
  orgId: string;
  installationId: string;
  occurrenceId: string;
  audience: string;
  category: ScienceNotificationCategory;
}>;

export type ScienceNotificationDetail = Readonly<{
  state: "current" | "expired" | "revoked" | "rollback";
  snapshot: unknown;
  snapshotDigest: string;
  createdAt: string;
}>;

type DetailRow = {
  state: "shadowed" | "expired" | "revoked" | "rollback";
  snapshot: unknown;
  snapshot_digest: string;
  created_at: Date | string;
};

export function validScienceNotificationUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function validScienceNotificationAudience(value: unknown): value is string {
  return typeof value === "string" && AUDIENCE_RE.test(value);
}

function validInput(input: ScienceNotificationDetailInput): boolean {
  return validScienceNotificationUuid(input.userId)
    && validScienceNotificationUuid(input.orgId)
    && validScienceNotificationUuid(input.installationId)
    && validScienceNotificationUuid(input.occurrenceId)
    && validScienceNotificationAudience(input.audience)
    && (input.category === "astronomy_fact" || input.category === "qizheng");
}

function detailState(state: DetailRow["state"]): ScienceNotificationDetail["state"] {
  return state === "shadowed" ? "current" : state;
}

export async function resolveScienceNotificationDetail(
  db: ScienceNotificationDetailDb,
  input: ScienceNotificationDetailInput,
): Promise<ScienceNotificationDetail | null> {
  if (!validInput(input)) return null;
  const result = await db.query<DetailRow>(
    `SELECT o.state,o.snapshot,o.snapshot_digest,o.created_at
       FROM mobile_science_notification_occurrences o
       JOIN mobile_science_notification_chains c ON c.id=o.chain_id
       JOIN mobile_science_notification_endpoints e ON e.chain_id=c.id
      WHERE o.id=$1::uuid AND c.user_id=$2::uuid AND c.org_id=$3::uuid
        AND e.installation_id=$4::uuid AND e.audience_binding=$5
        AND c.science_id=$6 AND o.science_id=$6
        AND e.active=true AND e.primary_endpoint=true
      LIMIT 1`,
    [input.occurrenceId,input.userId,input.orgId,input.installationId,input.audience,input.category],
  );
  const row = result.rows[0];
  if (!row || !["shadowed", "expired", "revoked", "rollback"].includes(row.state)
    || !SHA256_RE.test(String(row.snapshot_digest || ""))) return null;
  const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  if (!Number.isFinite(createdAt.valueOf())) return null;
  return Object.freeze({
    state: detailState(row.state),
    snapshot: row.snapshot,
    snapshotDigest: row.snapshot_digest,
    createdAt: createdAt.toISOString(),
  });
}
