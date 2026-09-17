/**
 * R8 astronomy dispatch cron entry (ยังไม่ติดตั้งใน crontab จนกว่า activation ครบ 5 ลายเซ็น)
 *
 * รันด้วย: node --import tsx scripts/mobile-astronomy-dispatch-cron.mts [--limit=50] [--no-interpret]
 * ทุกการตัดสินใจอยู่ในตัวจัดคิวส่ง (fenced) — สคริปต์นี้แค่ประกอบ deps จริง:
 * pool จาก env · นาฬิกาจริง · transport FCM ครั้งเดียว/คำขอ · preflight ตั๋ว OAuth
 * ภายใต้ CHECK ปัจจุบันของ production (consent/producer ปิด) รายงานได้อย่างเดียว
 * คือ not_admitted ทั้งหมด — ไม่มีการเขียนอะไร
 *
 * 18 ก.ย. 2569: เพิ่มคำตีความรายยาม (deps.interpret) — AI แปลท้องฟ้ายามนี้เทียบดวงกำเนิด
 * ก่อนใส่ซอง · ล้ม/ช้าเกิน = ข้อความคงที่เดิม (ไม่หยุดส่ง) · ปิดได้ด้วย --no-interpret
 * หรือ env ASTRONOMY_INTERPRET=0
 */
import pg from "pg";
import { createRequire } from "node:module";
import { getFcmDispatchTicket } from "../src/lib/fcm-direct";
import {
  createAstronomyFcmTransport,
} from "../src/lib/mobile-astronomy-dispatch-r8";
import { runAstronomyDispatchSweep } from "../src/lib/mobile-astronomy-dispatch-worker-r8";
import { createAstronomyInterpretDep } from "../src/lib/mobile-astronomy-interpret-runtime";

const require = createRequire(import.meta.url);

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : 50;
const interpretEnabled = !process.argv.includes("--no-interpret") && process.env.ASTRONOMY_INTERPRET !== "0";

const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: 4,
});

function buildInterpret() {
  if (!interpretEnabled) return undefined;
  if (!process.env.AUTH_SECRET) {
    console.log("[astronomy-dispatch] interpret disabled: no AUTH_SECRET in env");
    return undefined;
  }
  const fortuneCron = require("./mobile-daily-fortune-push-cron.cjs") as { signSession: (u: never) => string };
  const interpretLib = require("../src/lib/mobile-astronomy-interpret-r8.cjs") as {
    generateAstronomyInterpretation: (input: unknown) => Promise<never>;
  };
  return createAstronomyInterpretDep({
    pool,
    base: process.env.PUSH_INTERNAL_BASE || "http://127.0.0.1:3350",
    signSession: (user) => fortuneCron.signSession(user as never),
    generate: (input) => interpretLib.generateAstronomyInterpretation(input),
  });
}

try {
  const ticket = await getFcmDispatchTicket();
  const projectId = ticket?.projectId || "";
  const report = await runAstronomyDispatchSweep({
    pool,
    clock: () => Date.now(),
    projectId,
    transport: createAstronomyFcmTransport(getFcmDispatchTicket),
    preflight: async () => (await getFcmDispatchTicket()) !== null,
    interpret: buildInterpret(),
  }, { limit: Number.isInteger(limit) && limit > 0 ? limit : 50 });
  console.log(`[astronomy-dispatch] scanned=${report.scanned} dispatched=${report.dispatched} not_admitted=${report.notAdmitted} skipped=${report.skipped} stopped=${report.stopped} recovered=${report.recovered} failures=${report.failures} interpret=${interpretEnabled ? "on" : "off"}`);
} finally {
  await pool.end();
}
