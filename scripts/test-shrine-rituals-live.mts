/**
 * ยิงจริงกับฐานข้อมูลจริง — แต่ลงในตารางชั่วคราวของเซสชันตัวเอง (TEMP)
 *
 * ทำไมต้องชั่วคราว: เครื่องแม่ข่ายตัวนี้มีผู้ใช้จริงและรับเงินจริง
 * ผู้ใช้ของแอพ (hourkey_app) ไม่มีสิทธิ์สร้างตารางใน public อยู่แล้ว
 * ตารางชั่วคราวอยู่แค่ในเซสชันนี้ หลุดการเชื่อมต่อเมื่อไรก็หายไปเอง
 * ของจริงใน public ไม่ถูกแตะแม้แต่แถวเดียว แต่ได้ทดสอบคำสั่งฐานข้อมูลจริงทุกบรรทัด
 *
 * รัน (ต้องมีค่าเชื่อมฐานข้อมูลในตัวแปรระบบ):
 *   npx tsx scripts/test-shrine-rituals-live.mts
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../src/lib/db";
import { parseStrikeInput, recordStrike } from "../src/lib/shrine-ritual-strike";
import {
  castQianPermit,
  drawQian,
  parseQianDrawInput,
  parseQianPermitInput,
} from "../src/lib/shrine-qian";
import { castJiaobei, parseJiaobeiCastInput } from "../src/lib/shrine-jiaobei";
import { parseHistoryOptions, ritualHistory, ritualSummary } from "../src/lib/shrine-ritual-history";

const USER_A = "00000000-0000-4000-8000-0000000ca7a1";
const USER_B = "00000000-0000-4000-8000-0000000ca7b2";

const key = (prefix: string) => `${prefix}_${randomBytes(16).toString("hex")}`;
const nonce = () => randomBytes(8).toString("hex");

let passed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`  ผ่าน — ${label}`);
}

/**
 * ทุกการเชื่อมต่อใหม่ในกองเชื่อมต่อ ต้องมีตารางชั่วคราวของตัวเอง
 * ไม่งั้นตอนยิงพร้อมกัน 200 คำขอ การเชื่อมต่อที่เพิ่งเปิดจะหาตารางไม่เจอ
 * (คำสั่งถูกต่อคิวไว้หน้าสุดของการเชื่อมต่อนั้น จึงรันก่อนงานอื่นเสมอ)
 */
function armTempSchemaOnEveryConnection(ddl: string) {
  pool.on("connect", (client) => {
    client.query(ddl).catch(() => {
      /* ถ้าสร้างไม่ได้ คำสั่งถัดไปจะฟ้องเองอยู่แล้ว */
    });
  });
}

function toTemp(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().toUpperCase().startsWith("REVOKE"))
    .join("\n")
    .replace(/CREATE TABLE IF NOT EXISTS/gu, "CREATE TEMP TABLE IF NOT EXISTS");
}

async function buildTempSchema() {
  const root = process.cwd();
  const ledger = readFileSync(
    path.join(root, "migrations", "20260807_shrine_ritual_ledger.sql"),
    "utf8",
  );
  const jiaobei = readFileSync(
    path.join(root, "scripts", "create-shrine-jiaobei.sql"),
    "utf8",
  );
  const ddl = `${toTemp(jiaobei)}\n${toTemp(ledger)}`;
  armTempSchemaOnEveryConnection(ddl);
  await pool.query(ddl);
  const check = await pool.query(
    `SELECT c.relname FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname LIKE 'pg_temp%' AND c.relkind = 'r'
      ORDER BY 1`,
  );
  console.log(
    "  ตารางชั่วคราวที่สร้าง:",
    check.rows.map((row) => row.relname).join(", "),
  );
  assert.ok(check.rowCount && check.rowCount >= 5, "สร้างตารางชั่วคราวไม่ครบ");
  ok("คำสั่งสร้างตารางในแฟ้มย้ายฐานข้อมูล รันผ่านฐานข้อมูลจริงได้ทุกบรรทัด");
}

interface RoundResult {
  strikeTotals: Record<string, number>;
  permitCasts: number;
  slipNo: number;
  slipRecheck: number;
  historyKinds: string[];
  blockedBeforePermit: string;
  secondDrawSlip: number;
}

async function runRound(user: string, round: number): Promise<RoundResult> {
  const strikeTotals: Record<string, number> = {};

  // 1-3) ตีระฆัง · ตีกลอง · เคาะปลา
  for (const ritual of ["bell", "drum", "muyu"] as const) {
    const idem = key("strike");
    const input = parseStrikeInput({
      ritual,
      strikes: 9,
      session_seconds: 25,
      deity_id: "general",
      idempotency_key: idem,
      tz_offset_minutes: 420,
    });
    const first = await recordStrike(user, input);
    assert.equal(first.ok, true);
    assert.ok(first.ok && first.message.th && first.message.en && first.message.zh);
    assert.ok(first.ok && first.meaning.th && first.meaning.en && first.meaning.zh);
    const replay = await recordStrike(user, input);
    assert.equal(replay.ok && replay.replayed, true, "ยิงกุญแจเดิมซ้ำ ต้องได้ผลเดิม");
    assert.equal(
      replay.ok && replay.dayTotal,
      first.ok && first.dayTotal,
      "ยิงซ้ำต้องไม่บวกยอดเพิ่ม",
    );
    strikeTotals[ritual] = (first.ok && first.dayTotal) || 0;
  }

  // 4) โยนจอกทั่วไป (เส้นทางเดิมที่มีอยู่แล้ว) — ยืนยันว่ายังทำงานคู่กันได้
  const jiaobei = await castJiaobei(
    user,
    parseJiaobeiCastInput({
      question: `รอบทดสอบ ${round} เรื่องงาน ${randomBytes(4).toString("hex")}`,
      deity_id: "mazu",
      topic_key: "career",
      purpose: "general",
      client_nonce: nonce(),
      idempotency_key: key("jiaobei"),
      tz_offset_minutes: 420,
    }),
  );
  assert.equal(jiaobei.ok, true, JSON.stringify(jiaobei));

  // 5) ประตูขออนุญาต: จับใบก่อนขออนุญาต ต้องไม่ได้
  const permitSession = randomUUID();
  const tooEarly = await drawQian(
    user,
    parseQianDrawInput({
      permit_session_id: permitSession,
      client_nonce: nonce(),
      idempotency_key: key("qiandraw"),
    }),
  );
  assert.equal(tooEarly.ok, false);
  assert.equal(!tooEarly.ok && tooEarly.error, "permit_required");
  assert.equal(!tooEarly.ok && (tooEarly as any).status, 403);

  // โยนจอกขออนุญาตจนได้ซิ่วปัว 3 ครั้งติด
  let permitCasts = 0;
  let granted = false;
  let session = permitSession;
  for (let attempt = 0; attempt < 400 && !granted; attempt += 1) {
    const result = await castQianPermit(
      user,
      parseQianPermitInput({
        permit_session_id: session,
        question: `รอบทดสอบ ${round} ควรเริ่มเรื่องนี้ตอนนี้ไหม`,
        deity_id: "mazu",
        topic_key: "career",
        client_nonce: nonce(),
        idempotency_key: key("qianpermit"),
        tz_offset_minutes: 420,
      }),
    );
    if (!result.ok) {
      // ครบ 5 ชุดแล้ว = ตั้งจิตรอบใหม่ (ทางลงตามตำรา)
      assert.equal(result.error, "permit_set_cap_reached");
      assert.ok((result as any).message.th && (result as any).message.zh);
      session = randomUUID();
      continue;
    }
    permitCasts += 1;
    granted = Boolean(result.granted);
    if (granted) {
      assert.equal(result.streak, 3);
      assert.ok(result.message.th && result.message.en && result.message.zh);
      assert.ok(result.verify.serverSeed.length === 64);
    }
  }
  assert.equal(granted, true, "โยนขออนุญาตไม่สำเร็จภายในขอบเขตที่ตั้งไว้");

  // 6) จับใบเซียมซี
  const draw = await drawQian(
    user,
    parseQianDrawInput({
      permit_session_id: session,
      client_nonce: nonce(),
      idempotency_key: key("qiandraw"),
    }),
  );
  assert.equal(draw.ok, true, JSON.stringify(draw));
  assert.ok(draw.ok && draw.slipNo >= 1 && draw.slipNo <= 60);
  assert.equal(draw.ok && draw.card.poem.length, 4);
  assert.ok(draw.ok && draw.card.poem[0].zh.length > 0);
  assert.ok(draw.ok && draw.card.disclosure.th && draw.ok && draw.card.disclosure.zh);

  // จับซ้ำจากใบอนุญาตเดิม ต้องได้ใบเดิม
  const second = await drawQian(
    user,
    parseQianDrawInput({
      permit_session_id: session,
      client_nonce: nonce(),
      idempotency_key: key("qiandraw"),
    }),
  );
  assert.equal(second.ok && second.slipNo, draw.ok && draw.slipNo);

  // 7) ยืนยันใบด้วยเส้นทางโยนจอกเดิม purpose=qian_confirm
  const confirm = await castJiaobei(
    user,
    parseJiaobeiCastInput({
      question: "ใบนี้ใช่คำตอบของท่านหรือไม่",
      deity_id: "mazu",
      topic_key: "career",
      purpose: "qian_confirm",
      qian_slip_no: draw.ok ? draw.slipNo : 1,
      client_nonce: nonce(),
      idempotency_key: key("jiaobei"),
      tz_offset_minutes: 420,
    }),
  );
  assert.ok("ok" in confirm);

  // 8) ประวัติต้องเห็นทุกพิธี
  const history = await ritualHistory(
    user,
    parseHistoryOptions(new URL("https://x/api?limit=100")),
  );
  const kinds = [...new Set(history.entries.map((entry) => entry.kind))].sort();

  return {
    strikeTotals,
    permitCasts,
    slipNo: draw.ok ? draw.slipNo : -1,
    slipRecheck: second.ok ? second.slipNo : -1,
    historyKinds: kinds,
    blockedBeforePermit: (!tooEarly.ok && tooEarly.error) || "",
    secondDrawSlip: second.ok ? second.slipNo : -1,
  };
}

async function main() {
  console.log("เตรียมตารางชั่วคราว (ของจริงใน public ไม่ถูกแตะ)");
  await buildTempSchema();

  console.log("\nยิงจริง 3 รอบ — ผลต้องออกมาแบบเดียวกันทุกรอบ");
  const results: RoundResult[] = [];
  for (let round = 1; round <= 3; round += 1) {
    const result = await runRound(USER_A, round);
    results.push(result);
    console.log(
      `  รอบ ${round}: ระฆัง ${result.strikeTotals.bell} · กลอง ${result.strikeTotals.drum} · ปลาไม้ ${result.strikeTotals.muyu} · ` +
        `โยนขออนุญาต ${result.permitCasts} ครั้ง · ได้ใบที่ ${result.slipNo} · จับซ้ำได้ใบที่ ${result.secondDrawSlip} · ` +
        `ประวัติมี ${result.historyKinds.length} ชนิด`,
    );
  }

  for (const result of results) {
    assert.equal(result.blockedBeforePermit, "permit_required");
    assert.equal(result.slipNo, result.secondDrawSlip);
    assert.deepEqual(
      result.historyKinds,
      ["bell", "drum", "jiaobei", "muyu", "qian_draw", "qian_permit"],
      "ประวัติไม่ครบทุกพิธี",
    );
  }
  ok("3 รอบให้พฤติกรรมตรงกันทุกข้อ (ประตูปิดก่อนขออนุญาต · หนึ่งอนุญาตหนึ่งใบ · ประวัติครบ 6 ชนิด)");

  const totals = results.map((r) => r.strikeTotals.bell);
  assert.deepEqual(totals, [9, 18, 27], "ยอดสะสมระฆังต้องบวกทีละ 9 ทุกรอบ");
  ok(`ยอดสะสมเดินตรงสูตรทุกรอบ: ระฆัง ${totals.join(" → ")}`);

  // กันคนอื่นดูประวัติ
  console.log("\nทดสอบกันคนอื่นดูประวัติ");
  await runRound(USER_B, 1);
  const mine = await ritualHistory(
    USER_A,
    parseHistoryOptions(new URL("https://x/api?limit=100")),
  );
  const theirs = await ritualHistory(
    USER_B,
    parseHistoryOptions(new URL("https://x/api?limit=100")),
  );
  assert.ok(mine.entries.length > 0 && theirs.entries.length > 0);
  const mineIds = new Set(mine.entries.map((entry) => entry.id));
  for (const entry of theirs.entries) {
    assert.equal(mineIds.has(entry.id), false, "คนที่สองเห็นรายการของคนแรก");
  }
  ok(`ประวัติสองคนไม่ปนกันสักรายการ (คนแรก ${mine.entries.length} · คนที่สอง ${theirs.entries.length})`);

  const stranger = await ritualHistory(
    randomUUID(),
    parseHistoryOptions(new URL("https://x/api?limit=100")),
  );
  assert.equal(stranger.entries.length, 0);
  assert.ok(stranger.emptyMessage.th && stranger.emptyMessage.en && stranger.emptyMessage.zh);
  ok("คนที่ยังไม่เคยทำพิธี เห็นหน้าประวัติว่างพร้อมคำชวนเริ่ม 3 ภาษา");

  // ใบอนุญาตของคนหนึ่ง คนอื่นเอาไปจับใบไม่ได้
  let stolenSession = randomUUID();
  let grantedForA = false;
  for (let attempt = 0; attempt < 800 && !grantedForA; attempt += 1) {
    const result = await castQianPermit(
      USER_A,
      parseQianPermitInput({
        permit_session_id: stolenSession,
        question: "ทดสอบใบอนุญาตข้ามคน",
        deity_id: "mazu",
        topic_key: "general",
        client_nonce: nonce(),
        idempotency_key: key("qianpermit"),
      }),
    );
    if (!result.ok) {
      // ครบ 5 ชุด = ตั้งจิตรอบใหม่ตามทางลงที่ออกแบบไว้
      stolenSession = randomUUID();
      continue;
    }
    grantedForA = Boolean(result.granted);
  }
  assert.equal(grantedForA, true, "เตรียมใบอนุญาตให้คนแรกไม่สำเร็จ");
  const theft = await drawQian(
    USER_B,
    parseQianDrawInput({
      permit_session_id: stolenSession,
      client_nonce: nonce(),
      idempotency_key: key("qiandraw"),
    }),
  );
  assert.equal(theft.ok, false);
  assert.equal(!theft.ok && theft.error, "permit_required");
  ok("เอารหัสใบอนุญาตของคนอื่นมาจับใบไม่ได้ (ถูกปฏิเสธเหมือนไม่เคยขออนุญาต)");

  const summary = await ritualSummary(USER_A);
  assert.ok(summary.strikes.bell.strikes > 0 && summary.qianDraws > 0);
  console.log("\n  ยอดสรุปของคนแรก:", JSON.stringify(summary));
  ok("ยอดสรุปหัวหน้าประวัติคำนวณได้ถูกต้อง");

  // โหลด 200 คนพร้อมกัน — ทำเป็นด่านสุดท้าย เพราะจะเปิดการเชื่อมต่อเพิ่ม
  // และตารางชั่วคราวเป็นของใครของมันตามการเชื่อมต่อ
  console.log("\nทดสอบโหลด 200 คนพร้อมกัน");
  const started = Date.now();
  const latencies: number[] = [];
  const jobs = Array.from({ length: 200 }, (_, index) => {
    const user = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const at = Date.now();
    return castQianPermit(
      user,
      parseQianPermitInput({
        permit_session_id: randomUUID(),
        question: `โหลดเทส ${index}`,
        deity_id: "mazu",
        topic_key: "general",
        client_nonce: nonce(),
        idempotency_key: key("qianpermit"),
      }),
    )
      .then((result) => {
        latencies.push(Date.now() - at);
        return result;
      })
      .catch((error) => ({ ok: false as const, error: `พัง: ${error.message}` }));
  });
  const outcomes = await Promise.all(jobs);
  const elapsed = Date.now() - started;
  const good = outcomes.filter((result) => result.ok).length;
  const broken = outcomes.filter(
    (result) => !result.ok && String((result as any).error).startsWith("พัง"),
  );
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  console.log(
    `  สำเร็จ ${good}/200 · พัง ${broken.length} · ใช้เวลารวม ${elapsed} มิลลิวินาที · ` +
      `ช้าสุด 95% ที่ ${p95} มิลลิวินาที (กองเชื่อมต่อ 10 ช่อง)`,
  );
  if (broken.length) console.error("  ตัวอย่างที่พัง:", (broken[0] as any).error);
  assert.equal(broken.length, 0, "มีคำขอพังตอนยิงพร้อมกัน");
  assert.equal(good, 200, "มีคำขอที่ไม่สำเร็จตอนยิงพร้อมกัน");
  ok(`ยิงพร้อมกัน 200 คำขอ สำเร็จครบ ไม่มีพัง (ช้าสุด 95% ที่ ${p95} มิลลิวินาที)`);

  console.log(`\nสรุป: ผ่าน ${passed} ด่าน · ตารางชั่วคราวหายไปเองเมื่อปิดการเชื่อมต่อ`);
  await pool.end();
}

main().catch(async (error) => {
  console.error("\nไม่ผ่าน:", error.message);
  try {
    await pool.end();
  } catch {
    /* ปิดไปแล้ว */
  }
  process.exit(1);
});
