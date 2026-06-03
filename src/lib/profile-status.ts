// เช็คว่า user มี self profile (ดวงเจ้าของบัญชี) ที่ active หรือไม่
import { q1 } from "@/lib/db";

export async function userHasProfile(userId: string): Promise<boolean> {
  if (!userId) return false;
  const row = await q1<{ id: string }>(
    `SELECT id FROM profiles
     WHERE created_by_user_id=$1
       AND COALESCE(is_archived, false)=false
       AND (relationship_type IS NULL OR btrim(relationship_type) = '')
     LIMIT 1`,
    [userId]
  );
  return !!row;
}
