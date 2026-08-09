/**
 * ด่านตรวจผลลัพธ์ 5 พิธีศาลเจ้า — 7 ส.ค. 69
 *
 * ส่วน ก (ไม่ต้องมีฐานข้อมูล): ตรรกะล้วน — สุ่มพิสูจน์ได้ · เครื่องสถานะประตูขออนุญาต ·
 *   ด่านกรองข้อมูลเข้า · ครบ 3 ภาษาทุกข้อความ · คัมภีร์ 60 ใบครบและไม่มีป้ายระดับ
 * ส่วน ข (ต้องมีฐานข้อมูล + เครื่องแม่ข่ายที่ยิงได้): ยิงจริง 3 รอบ · กันคนอื่นดูประวัติ ·
 *   โหลด 200 คนพร้อมกัน — เปิดด้วย SHRINE_LIVE_BASE=http://127.0.0.1:3999
 *
 * รัน: npx tsx scripts/test-shrine-rituals.mts
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  QIAN_DRAW_ALGO,
  QIAN_PERMIT_SET_CAP,
  QIAN_PERMIT_STREAK,
  deriveQianSlipNo,
  parseQianDrawInput,
  parseQianPermitInput,
  summarizePermit,
} from "../src/lib/shrine-qian";
import {
  QIAN_DISCLOSURE,
  QIAN_SLIP_COUNT,
  QIAN_TOPIC_LABELS,
  QIAN_TOPIC_ORDER,
  qianCard,
} from "../src/lib/shrine-qian-canon";
import {
  STRIKE_FULL_ROUND,
  localDayString,
  parseStrikeInput,
} from "../src/lib/shrine-ritual-strike";
import {
  deriveJiaobeiOutcome,
  deriveJiaobeiReplayState,
  parseJiaobeiCastInput,
} from "../src/lib/shrine-jiaobei";

let passed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`  ผ่าน — ${label}`);
}

/* ─────────────── ส่วน ก1: เลขใบเซียมซีสุ่มแล้วพิสูจน์ได้ ─────────────── */
function testSlipDerivation() {
  const seed = randomBytes(32).toString("hex");
  const nonce = randomBytes(8).toString("hex");
  const first = deriveQianSlipNo(seed, nonce);
  assert.equal(deriveQianSlipNo(seed, nonce), first);
  assert.equal(deriveQianSlipNo(seed, nonce), first);
  ok("เมล็ดสุ่มเดิม+รหัสฝั่งเครื่องเดิม ให้เลขใบเดิมทุกครั้ง (คำนวณซ้ำ 3 หน)");

  const tally = new Array(QIAN_SLIP_COUNT + 1).fill(0);
  const rounds = 600_000;
  for (let index = 0; index < rounds; index += 1) {
    const slip = deriveQianSlipNo(
      randomBytes(32).toString("hex"),
      randomBytes(8).toString("hex"),
    );
    assert.ok(slip >= 1 && slip <= QIAN_SLIP_COUNT, `เลขใบหลุดกรอบ: ${slip}`);
    tally[slip] += 1;
  }
  const expected = rounds / QIAN_SLIP_COUNT;
  let worst = 0;
  for (let slip = 1; slip <= QIAN_SLIP_COUNT; slip += 1) {
    assert.ok(tally[slip] > 0, `ใบที่ ${slip} ไม่เคยออกเลย`);
    worst = Math.max(worst, Math.abs(tally[slip] - expected) / expected);
  }
  assert.ok(worst < 0.05, `ใบเซียมซีออกไม่สม่ำเสมอ เบี่ยงสูงสุด ${(worst * 100).toFixed(2)}%`);
  ok(`ใบ 1-60 ออกครบและกระจายสม่ำเสมอ ${rounds.toLocaleString()} รอบ (เบี่ยงสูงสุด ${(worst * 100).toFixed(2)}%)`);
}

/* ─────────────── ส่วน ก2: เครื่องสถานะประตูขออนุญาต ─────────────── */
type Row = { outcome: "sheng" | "xiao" | "yin" | "li"; sequence_no: number; set_no: number; cast_at: Date };
function rows(spec: Array<[Row["outcome"], number]>): Row[] {
  return spec.map(([outcome, setNo], index) => ({
    outcome,
    sequence_no: 1,
    set_no: setNo,
    cast_at: new Date(1_700_000_000_000 + index * 1000),
  }));
}

function testPermitStateMachine() {
  assert.equal(summarizePermit([]).granted, false);
  assert.equal(summarizePermit([]).nextSetNo, 1);
  ok("ยังไม่เคยโยน = ยังไม่ได้รับอนุญาต");

  const two = summarizePermit(rows([["sheng", 1], ["sheng", 1]]));
  assert.equal(two.streak, 2);
  assert.equal(two.granted, false);
  ok("ซิ่วปัว 2 ครั้ง ยังจับใบไม่ได้");

  const three = summarizePermit(rows([["sheng", 1], ["sheng", 1], ["sheng", 1]]));
  assert.equal(three.streak, QIAN_PERMIT_STREAK);
  assert.equal(three.granted, true);
  ok("ซิ่วปัว 3 ครั้งติด = เทพอนุญาตให้จับใบ");

  const broken = summarizePermit(rows([["sheng", 1], ["sheng", 1], ["yin", 1]]));
  assert.equal(broken.streak, 0);
  assert.equal(broken.granted, false);
  assert.equal(broken.nextSetNo, 2);
  ok("อิมปัวคั่น = นับใหม่จากศูนย์ และขึ้นชุดใหม่");

  const standing = summarizePermit(rows([["sheng", 1], ["li", 1], ["sheng", 1], ["sheng", 1]]));
  assert.equal(standing.streak, 3);
  assert.equal(standing.granted, true);
  ok("จอกตั้งไม่นับครั้ง ไม่ตัดสายซิ่วปัว");

  const recovered = summarizePermit(
    rows([["sheng", 1], ["xiao", 1], ["sheng", 2], ["sheng", 2], ["sheng", 2]]),
  );
  assert.equal(recovered.granted, true);
  assert.equal(recovered.currentSet, 2);
  ok("ตั้งจิตชุดใหม่แล้วได้ 3 ครั้งติด = อนุญาต");

  const capped = summarizePermit(
    rows([["yin", 1], ["yin", 2], ["yin", 3], ["yin", 4], ["yin", 5]]),
  );
  assert.equal(capped.capReached, true);
  assert.equal(capped.granted, false);
  ok(`ครบ ${QIAN_PERMIT_SET_CAP} ชุดแล้วมีทางลง ไม่วนไม่รู้จบ`);

  const replayedThirdSheng = deriveJiaobeiReplayState({
    attempt_no: 1,
    outcome: "sheng",
    purpose: "qian_confirm",
    sequence_no: 3,
    set_no: 2,
  });
  assert.equal(replayedThirdSheng.confirmed, true);
  assert.equal(replayedThirdSheng.consecutiveSheng, 3);
  assert.equal(replayedThirdSheng.nextSetNo, 2);
  const replayedStanding = deriveJiaobeiReplayState({
    attempt_no: 2,
    outcome: "li",
    purpose: "general",
    sequence_no: 1,
    set_no: 1,
  });
  assert.equal(replayedStanding.attemptsLeft, 2);
  ok("ยิงซ้ำกุญแจจอกเดิมคืนสถานะยืนยัน/จำนวนครั้งครบเหมือนผลแรก");
}

/* ─────────────── ส่วน ก3: ด่านกรองข้อมูลเข้า ─────────────── */
function expectReject(fn: () => unknown, label: string) {
  assert.throws(fn, undefined, `ควรปฏิเสธ: ${label}`);
}

function testInputGuards() {
  const goodPermit = {
    permit_session_id: randomUUID(),
    question: "ปีนี้ควรย้ายงานไหม",
    deity_id: "mazu",
    topic_key: "career",
    client_nonce: randomBytes(8).toString("hex"),
    idempotency_key: `qianpermit_${randomBytes(16).toString("hex")}`,
    tz_offset_minutes: 420,
  };
  assert.equal(parseQianPermitInput(goodPermit).topicKey, "career");
  ok("ข้อมูลขออนุญาตที่ถูกต้อง ผ่านด่าน");

  expectReject(() => parseQianPermitInput({ ...goodPermit, permit_session_id: "x" }), "รหัสรอบไม่ใช่รูปแบบที่กำหนด");
  expectReject(() => parseQianPermitInput({ ...goodPermit, question: "" }), "คำถามว่าง");
  expectReject(() => parseQianPermitInput({ ...goodPermit, question: "ก".repeat(201) }), "คำถามยาวเกิน");
  expectReject(() => parseQianPermitInput({ ...goodPermit, deity_id: "MAZU" }), "รหัสองค์เทพผิดรูปแบบ");
  expectReject(() => parseQianPermitInput({ ...goodPermit, client_nonce: "sh" }), "รหัสฝั่งเครื่องสั้นเกิน");
  expectReject(() => parseQianPermitInput({ ...goodPermit, idempotency_key: "jiaobei_x" }), "กุญแจกันยิงซ้ำผิดหมวด");
  ok("ข้อมูลผิดรูปแบบ 6 แบบ ถูกปฏิเสธครบ");

  assert.equal(parseQianPermitInput({ ...goodPermit, topic_key: "อะไรก็ไม่รู้" }).topicKey, "general");
  assert.equal(parseQianPermitInput({ ...goodPermit, tz_offset_minutes: 99999 }).tzOffsetMinutes, 420);
  ok("ค่าที่รับไม่ได้ ถอยไปค่าปลอดภัยแทนที่จะพัง");

  const goodDraw = {
    permit_session_id: goodPermit.permit_session_id,
    client_nonce: randomBytes(8).toString("hex"),
    idempotency_key: `qiandraw_${randomBytes(16).toString("hex")}`,
  };
  assert.equal(parseQianDrawInput(goodDraw).permitSessionId, goodPermit.permit_session_id.toLowerCase());
  expectReject(() => parseQianDrawInput({ ...goodDraw, idempotency_key: `qianpermit_${randomBytes(16).toString("hex")}` }), "ใช้กุญแจของขั้นขออนุญาตมาจับใบ");
  ok("ขั้นจับใบใช้กุญแจข้ามขั้นไม่ได้");

  const qianDrawId = `ritual_${randomBytes(16).toString("hex")}`;
  const goodJiaobei = {
    client_nonce: randomBytes(12).toString("hex"),
    deity_id: "guanyin",
    idempotency_key: `jiaobei_${randomBytes(16).toString("hex")}`,
    purpose: "qian_confirm",
    qian_draw_id: qianDrawId,
    qian_slip_no: 7,
    question: "ยืนยันใบเซียมซีที่ 7",
    topic_key: "general",
    tz_offset_minutes: 420,
  };
  assert.equal(parseJiaobeiCastInput(goodJiaobei).qianDrawId, qianDrawId);
  expectReject(
    () => parseJiaobeiCastInput({ ...goodJiaobei, qian_draw_id: "ritual_wrong" }),
    "รหัสการจับใบผิดรูปแบบ",
  );
  ok("ยืนยันเซียมซีรับ draw identity ที่ตรวจรูปแบบแล้ว");

  const goodStrike = {
    ritual: "bell",
    strikes: 12,
    session_seconds: 40,
    deity_id: "general",
    idempotency_key: `strike_${randomBytes(16).toString("hex")}`,
  };
  assert.equal(parseStrikeInput(goodStrike).strikes, 12);
  expectReject(() => parseStrikeInput({ ...goodStrike, ritual: "gong" }), "พิธีนอกรายการ");
  expectReject(() => parseStrikeInput({ ...goodStrike, strikes: 0 }), "ตีศูนย์ครั้ง");
  expectReject(() => parseStrikeInput({ ...goodStrike, strikes: STRIKE_FULL_ROUND + 1 }), "ตีเกินเพดานรอบเดียว");
  ok("ด่านกรองพิธีเคาะ ปฏิเสธค่าที่เป็นไปไม่ได้");

  assert.equal(localDayString(new Date("2026-08-07T16:30:00Z"), 420), "2026-08-07");
  assert.equal(localDayString(new Date("2026-08-07T17:30:00Z"), 420), "2026-08-08");
  ok("วันท้องถิ่นตัดตามเขตเวลาผู้ใช้ ไม่ตัดตามเวลาเครื่อง");
}

function testJiaobeiDrawIdentityContract() {
  const source = readFileSync(
    new URL("../src/lib/shrine-jiaobei.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL("../migrations/20260809_shrine_jiaobei_draw_identity.sql", import.meta.url),
    "utf8",
  );
  const runner = readFileSync(
    new URL("./apply-shrine-ritual-migration.mts", import.meta.url),
    "utf8",
  );
  assert.match(source, /ritual_id = 'fortune-sticks'/u,
    "backend must validate the cited draw against the authoritative ledger");
  assert.match(source, /qian_draw_id = \$6/u,
    "new confirmation history must be grouped by draw ID");
  assert.match(source, /qian_draw_id IS NULL[\s\S]*qian_slip_no = \$4/u,
    "legacy NULL draws must remain isolated from V194 draw-scoped rows");
  assert.match(source, /jiaobei_idempotency_conflict/u,
    "reusing one cast key across draws must fail closed");
  assert.match(migration, /FOREIGN KEY \(user_id, qian_draw_id\)/u,
    "draw ownership must be enforced by the database");
  assert.match(runner, /20260809_shrine_jiaobei_draw_identity\.sql/u,
    "the production migration runner must apply draw identity");
  ok("ประวัติยืนยันใบแยกตาม draw ID · ตรวจเจ้าของ/เลขใบ · legacy ไม่ปน");
}

/* ─────────────── ส่วน ก4: ครบ 3 ภาษาทุกข้อความ ─────────────── */
function collectLangObjects(value: unknown, path: string, found: string[][]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLangObjects(item, `${path}[${index}]`, found));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const looksLikeMessage =
    keys.includes("th") && (keys.includes("en") || keys.includes("zh"));
  if (looksLikeMessage) {
    for (const lang of ["th", "en", "zh"]) {
      const text = record[lang];
      assert.equal(typeof text, "string", `${path}.${lang} ต้องเป็นข้อความ`);
      assert.ok(String(text).trim().length > 0, `${path}.${lang} ว่าง`);
    }
    found.push([path]);
    return;
  }
  for (const key of keys) {
    collectLangObjects(record[key], `${path}.${key}`, found);
  }
}

function testThreeLanguages() {
  const found: string[][] = [];
  collectLangObjects(QIAN_DISCLOSURE, "qianDisclosure", found);
  collectLangObjects(QIAN_TOPIC_LABELS, "topicLabels", found);
  assert.ok(found.length >= 30, `พบข้อความ 3 ภาษาน้อยเกินไป: ${found.length}`);
  ok(`ข้อความระบบ ${found.length} ชุด ครบไทย-อังกฤษ-จีนทุกชุด`);

  for (const topic of QIAN_TOPIC_ORDER) {
    const label = QIAN_TOPIC_LABELS[topic];
    assert.ok(label, `หัวข้อ ${topic} ไม่มีป้ายชื่อ`);
    assert.equal(label.zh, topic);
  }
  ok(`ป้ายหัวข้อคำแก้ครบทั้ง ${QIAN_TOPIC_ORDER.length} หัวข้อ 3 ภาษา`);
}

/* ─────────────── ส่วน ก5: คัมภีร์เซียมซี ─────────────── */
function testCanon() {
  const banned = /^(大吉|中吉|下下|上上|吉|凶)$/u;
  for (let slip = 1; slip <= QIAN_SLIP_COUNT; slip += 1) {
    const card = qianCard(slip);
    assert.equal(card.no, slip);
    assert.ok(card.ganzhi.length >= 2, `ใบที่ ${slip} ไม่มีกิ่งก้านฟ้าดิน`);
    assert.equal(card.poem.length, 4, `ใบที่ ${slip} กลอนไม่ครบ 4 วรรค`);
    for (const line of card.poem) {
      assert.ok(line.zh.trim().length > 0, `ใบที่ ${slip} มีวรรคที่ไม่มีต้นฉบับจีน`);
      assert.ok((line.th || "").trim().length > 0, `ใบที่ ${slip} มีวรรคที่ไม่มีคำแปลไทย`);
    }
    assert.ok(card.fanshi.zh.trim().length > 0, `ใบที่ ${slip} ไม่มีคำแก้ 凡事`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(card, "grade"),
      false,
      `ใบที่ ${slip} มีป้ายระดับ ซึ่งคัมภีร์ต้นฉบับไม่มี`,
    );
    assert.equal(banned.test(card.fanshi.zh.trim()), false, `ใบที่ ${slip} ถูกย่อเหลือป้ายระดับ`);
  }
  ok(`คัมภีร์ครบ ${QIAN_SLIP_COUNT} ใบ · กลอน 4 วรรคมีทั้งจีนและไทยครบ · ไม่มีป้ายระดับดี-ร้ายสักใบ`);
}

/* ─────────────── ส่วน ก6: หน้าจอกยังตรงกับผลที่บันทึก ─────────────── */
function testFaceConsistency() {
  for (let index = 0; index < 200_000; index += 1) {
    const { outcome, faceLeft, faceRight } = deriveJiaobeiOutcome(
      randomBytes(32).toString("hex"),
      randomBytes(8).toString("hex"),
    );
    if (outcome === "sheng") assert.notEqual(faceLeft, faceRight);
    if (outcome === "xiao") assert.equal(`${faceLeft}${faceRight}`, "flatflat");
    if (outcome === "yin") assert.equal(`${faceLeft}${faceRight}`, "roundround");
    if (outcome === "li") {
      assert.ok(faceLeft === "standing" || faceRight === "standing");
    }
  }
  ok("หน้าจอกที่แสดง ตรงกับผลที่ตัดสินทุกกรณี 200,000 รอบ");
}

/* ─────────────── ส่วน ข: ยิงจริงผ่านเครื่องแม่ข่าย ─────────────── */
const LIVE_BASE = process.env.SHRINE_LIVE_BASE || "";
const LIVE_TOKEN_A = process.env.SHRINE_LIVE_TOKEN_A || "";
const LIVE_TOKEN_B = process.env.SHRINE_LIVE_TOKEN_B || "";

async function call(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const response = await fetch(`${LIVE_BASE}${path}`, {
    method: init.method || "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

const key = (prefix: string) => `${prefix}_${randomBytes(16).toString("hex")}`;
const nonce = () => randomBytes(8).toString("hex");

/** โยนขออนุญาตจนได้ 3 ซิ่วปัวติด (หรือหมดชุด) แล้วคืนสถานะ */
async function pushForPermit(token: string, sessionId: string, question: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await call(token, "/api/mobile/v1/shrine/qian/permit", {
      method: "POST",
      body: {
        permit_session_id: sessionId,
        question,
        deity_id: "mazu",
        topic_key: "career",
        client_nonce: nonce(),
        idempotency_key: key("qianpermit"),
      },
    });
    if (result.status === 409) return result;
    assert.equal(result.status, 200, `ขออนุญาตล้มเหลว: ${JSON.stringify(result.body)}`);
    if (result.body.granted) return result;
  }
  throw new Error("โยนขออนุญาตไม่จบใน 80 ครั้ง");
}

async function liveRound(round: number) {
  console.log(`\n  รอบที่ ${round}`);
  // 1-3) ระฆัง กลอง ปลาไม้
  for (const ritual of ["bell", "drum", "muyu"] as const) {
    const idem = key("strike");
    const first = await call(LIVE_TOKEN_A, "/api/mobile/v1/shrine/ritual/strike", {
      method: "POST",
      body: { ritual, strikes: 9, session_seconds: 30, deity_id: "general", idempotency_key: idem },
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.ok, true);
    assert.equal(first.body.strikes, 9);
    assert.ok(first.body.message.th && first.body.message.en && first.body.message.zh);
    const again = await call(LIVE_TOKEN_A, "/api/mobile/v1/shrine/ritual/strike", {
      method: "POST",
      body: { ritual, strikes: 9, session_seconds: 30, deity_id: "general", idempotency_key: idem },
    });
    assert.equal(again.body.replayed, true, "ยิงซ้ำกุญแจเดิมต้องได้ผลเดิม ไม่บวกซ้ำ");
    assert.equal(again.body.dayTotal, first.body.dayTotal);
    console.log(`    ${ritual}: ${first.body.dayTotal}/${STRIKE_FULL_ROUND} · ยิงซ้ำไม่บวกเพิ่ม`);
  }

  // 4) จับใบทั้งที่ยังไม่ขออนุญาต ต้องถูกปิดประตู
  const sessionId = randomUUID();
  const blocked = await call(LIVE_TOKEN_A, "/api/mobile/v1/shrine/qian/draw", {
    method: "POST",
    body: { permit_session_id: sessionId, client_nonce: nonce(), idempotency_key: key("qiandraw") },
  });
  assert.equal(blocked.status, 403, "ยังไม่ขออนุญาตต้องจับใบไม่ได้");
  assert.equal(blocked.body.error, "permit_required");
  console.log("    ประตูขออนุญาต: จับใบก่อนโยนจอก ถูกปิดถูกต้อง");

  // 5) โยนขออนุญาต แล้วจับใบ
  const permit = await pushForPermit(LIVE_TOKEN_A, sessionId, `รอบทดสอบ ${round} ${Date.now()}`);
  if (permit.status === 409) {
    console.log("    ประตูขออนุญาต: ครบชุดแล้วมีทางลง (ไม่วนไม่รู้จบ)");
    return;
  }
  assert.equal(permit.body.granted, true);
  const drawIdem = key("qiandraw");
  const draw = await call(LIVE_TOKEN_A, "/api/mobile/v1/shrine/qian/draw", {
    method: "POST",
    body: { permit_session_id: sessionId, client_nonce: nonce(), idempotency_key: drawIdem },
  });
  assert.equal(draw.status, 200, JSON.stringify(draw.body));
  assert.ok(draw.body.slipNo >= 1 && draw.body.slipNo <= 60);
  assert.equal(draw.body.card.poem.length, 4);
  const secondDraw = await call(LIVE_TOKEN_A, "/api/mobile/v1/shrine/qian/draw", {
    method: "POST",
    body: { permit_session_id: sessionId, client_nonce: nonce(), idempotency_key: key("qiandraw") },
  });
  assert.equal(secondDraw.body.slipNo, draw.body.slipNo, "หนึ่งใบอนุญาตต้องได้ใบเดียว");
  console.log(`    เซียมซี: ได้ใบที่ ${draw.body.slipNo} · จับซ้ำได้ใบเดิม · สูตรตรวจ ${QIAN_DRAW_ALGO}`);

  // 6) ประวัติต้องเห็นทุกพิธีที่เพิ่งทำ
  const history = await call(LIVE_TOKEN_A, "/api/mobile/v1/shrine/rituals/history?limit=50");
  assert.equal(history.status, 200);
  const kinds = new Set(history.body.entries.map((entry: any) => entry.kind));
  for (const kind of ["bell", "drum", "muyu", "qian_permit", "qian_draw"]) {
    assert.ok(kinds.has(kind), `ประวัติไม่มี ${kind}`);
  }
  console.log(`    ประวัติ: ${history.body.entries.length} รายการ ครบทุกพิธี`);
}

async function liveIsolation() {
  console.log("\n  ทดสอบกันคนอื่นดูประวัติ");
  const mine = await call(LIVE_TOKEN_A, "/api/mobile/v1/shrine/rituals/history?limit=50");
  const theirs = await call(LIVE_TOKEN_B, "/api/mobile/v1/shrine/rituals/history?limit=50");
  const mineIds = new Set(mine.body.entries.map((entry: any) => entry.id));
  for (const entry of theirs.body.entries) {
    assert.equal(mineIds.has(entry.id), false, "ผู้ใช้ ข เห็นรายการของผู้ใช้ ก");
  }
  ok("ประวัติของสองคนไม่ปนกันแม้แต่รายการเดียว");

  const target = mine.body.entries.find((entry: any) => entry.verifiable);
  if (target) {
    const byOwner = await call(
      LIVE_TOKEN_A,
      `/api/mobile/v1/shrine/rituals/verify?kind=${target.kind}&id=${target.id}`,
    );
    assert.equal(byOwner.status, 200);
    assert.equal(byOwner.body.match, true, "เจ้าของตรวจย้อนแล้วต้องตรงกัน");
    const byOther = await call(
      LIVE_TOKEN_B,
      `/api/mobile/v1/shrine/rituals/verify?kind=${target.kind}&id=${target.id}`,
    );
    assert.equal(byOther.status, 404, "คนอื่นต้องเปิดหลักฐานของเราไม่ได้");
    ok("ตรวจย้อนหลักฐานได้เฉพาะเจ้าของ คนอื่นได้ 404 ไม่ใช่ข้อมูล");
  }

  const noToken = await fetch(`${LIVE_BASE}/api/mobile/v1/shrine/rituals/history`);
  assert.equal(noToken.status, 401, "ไม่ล็อกอินต้องเข้าไม่ได้");
  ok("ไม่ล็อกอิน เปิดประวัติไม่ได้");
}

async function liveLoad() {
  console.log("\n  ทดสอบโหลด 200 คนพร้อมกัน");
  const started = Date.now();
  const jobs = Array.from({ length: 200 }, (_, index) =>
    call(index % 2 === 0 ? LIVE_TOKEN_A : LIVE_TOKEN_B, "/api/mobile/v1/shrine/ritual/strike", {
      method: "POST",
      body: {
        ritual: "muyu",
        strikes: 1,
        session_seconds: 1,
        deity_id: "general",
        idempotency_key: key("strike"),
      },
    }),
  );
  const results = await Promise.all(jobs);
  const elapsed = Date.now() - started;
  const good = results.filter((r) => r.status === 200).length;
  const limited = results.filter((r) => r.status === 429).length;
  const failed = results.filter((r) => r.status !== 200 && r.status !== 429);
  assert.equal(failed.length, 0, `มีคำขอพังจริง ${failed.length} รายการ: ${JSON.stringify(failed[0])}`);
  console.log(`    สำเร็จ ${good} · ถูกโควตากั้น ${limited} · พัง 0 · ใช้เวลา ${elapsed} มิลลิวินาที`);
  ok("ยิง 200 คำขอพร้อมกัน ไม่มีคำขอไหนพัง");
}

async function main() {
  console.log("ส่วน ก — ตรรกะล้วน (ไม่ต้องมีฐานข้อมูล)");
  testSlipDerivation();
  testPermitStateMachine();
  testInputGuards();
  testJiaobeiDrawIdentityContract();
  testThreeLanguages();
  testCanon();
  testFaceConsistency();

  if (!LIVE_BASE || !LIVE_TOKEN_A || !LIVE_TOKEN_B) {
    console.log(
      "\nส่วน ข — ข้ามไว้ (ต้องตั้ง SHRINE_LIVE_BASE, SHRINE_LIVE_TOKEN_A, SHRINE_LIVE_TOKEN_B)",
    );
  } else {
    console.log("\nส่วน ข — ยิงจริงผ่านเครื่องแม่ข่าย");
    for (let round = 1; round <= 3; round += 1) await liveRound(round);
    await liveIsolation();
    await liveLoad();
  }

  console.log(`\nสรุป: ผ่าน ${passed} ด่าน`);
}

main().catch((error) => {
  console.error("\nไม่ผ่าน:", error.message);
  process.exit(1);
});
