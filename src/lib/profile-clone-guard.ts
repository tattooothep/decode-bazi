import { q } from "./db";

type SelfProfileMatchInput = {
  orgId: string;
  userId: string;
  name?: unknown;
  nickname?: unknown;
  birthDate: string;
  birthTime: string;
  birthTimeKnown: boolean;
  dayBoundary: "23:00" | "00:00";
  excludeProfileId?: string;
};

type SelfProfileCandidate = {
  id: string;
  name: string | null;
  nickname: string | null;
};

function normName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function findMatchingSelfProfile(input: SelfProfileMatchInput): Promise<SelfProfileCandidate | null> {
  const candidateNames = [normName(input.name), normName(input.nickname)].filter(Boolean);
  if (!candidateNames.length) return null;

  const rows = await q<SelfProfileCandidate>(
    `SELECT id, name, nickname
       FROM profiles
      WHERE org_id=$1
        AND created_by_user_id=$2
        AND is_archived=false
        AND (relationship_type IS NULL OR btrim(relationship_type) = '')
        AND birth_time_known=$3
        AND to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') = $4
        AND to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') = $5
        AND COALESCE(day_boundary, '23:00') = $6
        AND ($7::uuid IS NULL OR id <> $7::uuid)
      LIMIT 5`,
    [
      input.orgId,
      input.userId,
      input.birthTimeKnown,
      input.birthDate,
      input.birthTime,
      input.dayBoundary,
      input.excludeProfileId || null,
    ]
  );

  const candidateSet = new Set(candidateNames);
  return rows.find((row) => {
    const selfNames = [normName(row.name), normName(row.nickname)].filter(Boolean);
    return selfNames.some((name) => candidateSet.has(name));
  }) || null;
}
