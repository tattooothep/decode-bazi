/**
 * R8 astronomy dispatch cron entry (ยังไม่ติดตั้งใน crontab จนกว่า activation ครบ 5 ลายเซ็น)
 *
 * รันด้วย: node --import tsx scripts/mobile-astronomy-dispatch-cron.mts [--limit=50]
 * ทุกการตัดสินใจอยู่ในตัวจัดคิวส่ง (fenced) — สคริปต์นี้แค่ประกอบ deps จริง:
 * pool จาก env · นาฬิกาจริง · transport FCM ครั้งเดียว/คำขอ · preflight ตั๋ว OAuth
 * ภายใต้ CHECK ปัจจุบันของ production (consent/producer ปิด) รายงานได้อย่างเดียว
 * คือ not_admitted ทั้งหมด — ไม่มีการเขียนอะไร
 */
import pg from "pg";
import { getFcmDispatchTicket } from "../src/lib/fcm-direct";
import {
  createAstronomyFcmTransport,
} from "../src/lib/mobile-astronomy-dispatch-r8";
import { runAstronomyDispatchSweep } from "../src/lib/mobile-astronomy-dispatch-worker-r8";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : 50;

const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: 4,
});

try {
  const ticket = await getFcmDispatchTicket();
  const projectId = ticket?.projectId || "";
  const report = await runAstronomyDispatchSweep({
    pool,
    clock: () => Date.now(),
    projectId,
    transport: createAstronomyFcmTransport(getFcmDispatchTicket),
    preflight: async () => (await getFcmDispatchTicket()) !== null,
  }, { limit: Number.isInteger(limit) && limit > 0 ? limit : 50 });
  console.log(`[astronomy-dispatch] scanned=${report.scanned} dispatched=${report.dispatched} not_admitted=${report.notAdmitted} skipped=${report.skipped} stopped=${report.stopped} recovered=${report.recovered} failures=${report.failures}`);
} finally {
  await pool.end();
}
