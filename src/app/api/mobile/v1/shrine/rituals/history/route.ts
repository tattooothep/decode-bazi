import { guardShrineRequest, shrineJson } from "@/lib/shrine-route-guard";
import {
  parseHistoryOptions,
  ritualHistory,
  ritualSummary,
} from "@/lib/shrine-ritual-history";

/**
 * ประวัติพิธีของ "ผู้ที่ล็อกอินอยู่" เท่านั้น
 * ไม่มีตัวแปรรับรหัสผู้ใช้จากผู้เรียกเลยแม้แต่ตัวเดียว
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await guardShrineRequest(req, {
    scope: "ritual-history",
    perIp: 240,
    perBearer: 120,
    perUser: 90,
  });
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const options = parseHistoryOptions(url);
  const [history, summary] = await Promise.all([
    ritualHistory(guard.userId, options),
    ritualSummary(guard.userId),
  ]);
  return shrineJson({ ...history, summary });
}
