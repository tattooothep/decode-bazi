/* ทดสอบเครื่องยนต์โยนจอก — รันตรงกับ DB จริงด้วย user ทดสอบ แล้วลบทิ้ง */
import { randomBytes } from "crypto";
import {
  castJiaobei,
  deriveJiaobeiOutcome,
  jiaobeiHourKey,
  parseJiaobeiCastInput,
} from "../src/lib/shrine-jiaobei";
import { pool } from "../src/lib/db";

const TEST_USER = "00000000-0000-4000-8000-00000000beef";
const RUN = Date.now().toString(36);
const SLIP = 1 + Math.floor(Math.random() * 60) % 60;

function key() {
  return `jiaobei_${randomBytes(16).toString("hex")}`;
}
function nonce() {
  return randomBytes(8).toString("hex");
}

async function main() {
  // 1) แจกแจงความน่าจะเป็น 100,000 รอบ
  const tally: Record<string, number> = { sheng: 0, xiao: 0, yin: 0, li: 0 };
  for (let index = 0; index < 100_000; index++) {
    const { outcome } = deriveJiaobeiOutcome(
      randomBytes(32).toString("hex"),
      nonce(),
    );
    tally[outcome] += 1;
  }
  console.log("DIST", tally);
  const okDist =
    Math.abs(tally.sheng / 100_000 - 0.5) < 0.01 &&
    Math.abs(tally.xiao / 100_000 - 0.25) < 0.01 &&
    Math.abs(tally.yin / 100_000 - 0.2266) < 0.01 &&
    Math.abs(tally.li / 100_000 - 0.0234) < 0.005;
  console.log(okDist ? "PASS dist" : "FAIL dist");

  // 2) hourKey: 23:30 ไทย = ยาม 子 ของ "วันถัดไป" ตามนาฬิกาเลื่อนชั่วโมง
  const hk = jiaobeiHourKey(new Date("2026-08-04T16:30:00Z"), 420);
  console.log("HOURKEY 23:30th =", hk, hk.hourBranch === "子" ? "PASS" : "FAIL");
  const hk2 = jiaobeiHourKey(new Date("2026-08-04T06:10:00Z"), 420);
  console.log("HOURKEY 13:10th =", hk2, hk2.hourBranch === "未" ? "PASS" : "FAIL");


  // 3) กติกาถามทั่วไป: ยิงคำถามเดิมซ้ำในยามเดียว → ครั้งที่ 2 ต้องโดนกัน
  const q = `งานใหม่ควรรับไหม ${RUN}`;
  const first = await castJiaobei(TEST_USER, parseJiaobeiCastInput({
    question: q, deity_id: "caishen", client_nonce: nonce(),
    idempotency_key: key(),
  }));
  console.log("CAST1", first.ok ? first.outcome : first, first.ok ? "PASS" : "FAIL");
  const second = await castJiaobei(TEST_USER, parseJiaobeiCastInput({
    question: q, deity_id: "caishen", client_nonce: nonce(),
    idempotency_key: key(),
  }));
  console.log(
    "SAME-HOUR",
    !second.ok && second.error === "same_hour_repeat" ? "PASS" : `FAIL ${JSON.stringify(second).slice(0, 120)}`,
  );

  // 4) idempotency: ยิง key เดิมซ้ำ ต้องได้ผลเดิม ไม่เกิดแถวใหม่
  const fixedKey = key();
  const n1 = await castJiaobei(TEST_USER, parseJiaobeiCastInput({
    question: `เรื่องที่สอง ${RUN}`, deity_id: "guanyin", client_nonce: nonce(),
    idempotency_key: fixedKey,
  }));
  const n2 = await castJiaobei(TEST_USER, parseJiaobeiCastInput({
    question: `เรื่องที่สอง ${RUN}`, deity_id: "guanyin", client_nonce: nonce(),
    idempotency_key: fixedKey,
  }));
  console.log(
    "IDEMPOTENT",
    n1.ok && n2.ok && n2.replayed && n1.outcome === n2.outcome ? "PASS" : "FAIL",
  );

  // 5) ยืนยันเซียมซี: โยนจนกว่าจะยืนยันหรือครบเพดาน 5 ชุด — สถานะต้องเดินถูก
  let confirmed = false;
  let capReached = false;
  let casts = 0;
  while (!confirmed && !capReached && casts < 60) {
    const result = await castJiaobei(TEST_USER, parseJiaobeiCastInput({
      question: `ยืนยันใบ ${RUN}`, deity_id: "guanyin", purpose: "qian_confirm",
      qian_slip_no: SLIP, client_nonce: nonce(), idempotency_key: key(),
    }));
    casts += 1;
    if (!result.ok) {
      if (result.error === "set_cap_reached") { capReached = true; break; }
      console.log("QIAN unexpected", result);
      break;
    }
    if (result.confirmed) confirmed = true;
  }
  console.log(
    `QIAN ${casts} โยน → ${confirmed ? "ยืนยันสำเร็จ (3 ซิ่วปัวติด)" : capReached ? "ชนเพดาน 5 ชุด มีทางลง" : "??"}`,
    confirmed || capReached ? "PASS" : "FAIL",
  );

  // 6) ตรวจแถวใน DB: จำนวน + ค่า snapshot ครบ
  const rows = await pool.query(
    "SELECT count(*)::int AS n, count(hour_branch)::int AS hb, count(day_ganzhi)::int AS dg FROM shrine_jiaobei_casts WHERE user_id=$1",
    [TEST_USER],
  );
  console.log("DB", rows.rows[0], rows.rows[0].n >= 3 && rows.rows[0].hb === rows.rows[0].n ? "PASS" : "FAIL");

  await pool.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
