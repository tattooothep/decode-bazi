// เช็คว่า user มี profile (วันเกิด) ที่ active อย่างน้อย 1 ตัวหรือไม่
import { q1 } from "@/lib/db";

export async function userHasProfile(userId: string): Promise<boolean> {
  if (!userId) return false;
  const row = await q1<{ id: string }>(
    `SELECT id FROM profiles
     WHERE created_by_user_id=$1
       AND COALESCE(is_archived, false)=false
     LIMIT 1`,
    [userId]
  );
  return !!row;
}
