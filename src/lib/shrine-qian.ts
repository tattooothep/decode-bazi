import { createHash, randomBytes } from "crypto";
import { pool } from "@/lib/db";
import {
  deriveJiaobeiOutcome,
  hashJiaobeiQuestion,
  jiaobeiHourKey,
  type JiaobeiOutcome,
} from "@/lib/shrine-jiaobei";
import {
  QIAN_CANON_VERSION,
  QIAN_DISCLOSURE,
  QIAN_SLIP_COUNT,
  QIAN_TOPIC_LABELS,
  QIAN_TOPIC_ORDER,
  qianCanonSource,
  qianCard,
} from "@/lib/shrine-qian-canon";

/**
 * เสี่ยงเซียมซี (求籤) + ประตูขออนุญาต — เครื่องยนต์กลาง 7 ส.ค. 69
 *
 * ตำราว่าไว้: จับใบเซียมซีเฉย ๆ ไม่นับ ต้องโยนจอกถามเทพก่อนว่า
 * "ใบที่จะจับนี้ใช่คำตอบของท่านหรือไม่" ได้ 聖筊 สามครั้งติดจึงถือว่าท่านอนุญาต
 * ที่นี่แยกเป็นสองขั้นชัด ๆ:
 *   ขั้น 1 permitCast  — โยนจอกขออนุญาต (ต้องซิ่วปัว 3 ครั้งติดในชุดเดียว)
 *   ขั้น 2 drawQian    — จับใบ ทำได้ครั้งเดียวต่อหนึ่งใบอนุญาต
 * ขั้นยืนยันใบหลังจับ ใช้เส้นทางโยนจอกเดิม purpose=qian_confirm ที่มีอยู่แล้ว
 *
 * การสุ่มทั้งสองขั้นเกิดที่เครื่องแม่ข่าย และแนบเมล็ดสุ่มกลับไปให้ตรวจย้อนได้
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEITY_ID_PATTERN = /^[a-z][a-z0-9-]{2,39}$/u;
const NONCE_PATTERN = /^[0-9a-zA-Z_-]{8,64}$/u;
const PERMIT_KEY_PATTERN = /^qianpermit_[0-9a-f]{32}$/u;
const DRAW_KEY_PATTERN = /^qiandraw_[0-9a-f]{32}$/u;
const TOPIC_KEYS = new Set([
  "general",
  "career",
  "wealth",
  "love",
  "health",
  "study",
  "travel",
]);

/** ต้องซิ่วปัวติดกันกี่ครั้งจึงถือว่าเทพอนุญาตให้จับใบ */
export const QIAN_PERMIT_STREAK = 3;
/** เพดานชุดที่ตั้งจิตใหม่ได้ ก่อนต้องมีทางลง */
export const QIAN_PERMIT_SET_CAP = 5;

class QianInputError extends Error {
  constructor(field: string) {
    super(`invalid_${field}`);
  }
}

export interface QianPermitInput {
  permitSessionId: string;
  questionText: string;
  deityId: string;
  topicKey: string;
  clientNonce: string;
  tzOffsetMinutes: number;
  idempotencyKey: string;
}

export interface QianDrawInput {
  permitSessionId: string;
  clientNonce: string;
  tzOffsetMinutes: number;
  idempotencyKey: string;
}

function readTz(value: unknown): number {
  const tzRaw = Number(value);
  return Number.isInteger(tzRaw) && tzRaw >= -840 && tzRaw <= 840 ? tzRaw : 420;
}

export function parseQianPermitInput(raw: unknown): QianPermitInput {
  if (typeof raw !== "object" || raw === null) throw new QianInputError("body");
  const body = raw as Record<string, unknown>;
  const permitSessionId =
    typeof body.permit_session_id === "string" ? body.permit_session_id : "";
  if (!UUID_PATTERN.test(permitSessionId)) {
    throw new QianInputError("permit_session_id");
  }
  const questionText =
    typeof body.question === "string" ? body.question.trim() : "";
  if (questionText.length < 1 || questionText.length > 200) {
    throw new QianInputError("question");
  }
  const deityId = typeof body.deity_id === "string" ? body.deity_id : "";
  if (!DEITY_ID_PATTERN.test(deityId)) throw new QianInputError("deity_id");
  const topicKey =
    typeof body.topic_key === "string" && TOPIC_KEYS.has(body.topic_key)
      ? body.topic_key
      : "general";
  const clientNonce =
    typeof body.client_nonce === "string" ? body.client_nonce : "";
  if (!NONCE_PATTERN.test(clientNonce)) throw new QianInputError("client_nonce");
  const idempotencyKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!PERMIT_KEY_PATTERN.test(idempotencyKey)) {
    throw new QianInputError("idempotency_key");
  }
  return {
    permitSessionId: permitSessionId.toLowerCase(),
    questionText,
    deityId,
    topicKey,
    clientNonce,
    tzOffsetMinutes: readTz(body.tz_offset_minutes),
    idempotencyKey,
  };
}

export function parseQianDrawInput(raw: unknown): QianDrawInput {
  if (typeof raw !== "object" || raw === null) throw new QianInputError("body");
  const body = raw as Record<string, unknown>;
  const permitSessionId =
    typeof body.permit_session_id === "string" ? body.permit_session_id : "";
  if (!UUID_PATTERN.test(permitSessionId)) {
    throw new QianInputError("permit_session_id");
  }
  const clientNonce =
    typeof body.client_nonce === "string" ? body.client_nonce : "";
  if (!NONCE_PATTERN.test(clientNonce)) throw new QianInputError("client_nonce");
  const idempotencyKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!DRAW_KEY_PATTERN.test(idempotencyKey)) {
    throw new QianInputError("idempotency_key");
  }
  return {
    permitSessionId: permitSessionId.toLowerCase(),
    clientNonce,
    tzOffsetMinutes: readTz(body.tz_offset_minutes),
    idempotencyKey,
  };
}

/**
 * เลขใบจากเมล็ดสุ่มของเครื่องแม่ข่าย — ตรวจซ้ำได้ด้วยสูตรบรรทัดเดียว
 * slip = (8 ไบต์แรกของ sha256(server_seed + client_nonce) mod 60) + 1
 */
export function deriveQianSlipNo(
  serverSeed: string,
  clientNonce: string,
): number {
  const digest = createHash("sha256")
    .update(serverSeed)
    .update(clientNonce)
    .digest();
  const head = digest.subarray(0, 8).toString("hex");
  const value = BigInt(`0x${head}`) % BigInt(QIAN_SLIP_COUNT);
  return Number(value) + 1;
}

export const QIAN_DRAW_ALGO =
  "slip_no = (BigInt(sha256(server_seed+client_nonce)[0..8]) mod 60) + 1";
export const QIAN_PERMIT_ALGO =
  "sha256(server_seed+client_nonce) byte0 0-127=sheng 128-191=xiao 192-249=yin 250-255=li";

interface PermitRow {
  outcome: JiaobeiOutcome;
  sequence_no: number;
  set_no: number;
  cast_at: Date;
}

/** สรุปสถานะรอบขออนุญาตจากรายการโยนทั้งหมดของรอบนั้น */
export function summarizePermit(rows: readonly PermitRow[]) {
  // จอกตั้งไม่นับครั้งตามธรรมเนียม
  const counted = rows.filter((row) => row.outcome !== "li");
  const last = counted[counted.length - 1];
  const currentSet = last ? last.set_no : 1;
  let streak = 0;
  for (let index = counted.length - 1; index >= 0; index -= 1) {
    const row = counted[index];
    if (row.set_no !== currentSet || row.outcome !== "sheng") break;
    streak += 1;
  }
  const granted = streak >= QIAN_PERMIT_STREAK;
  const setBroken = last != null && last.outcome !== "sheng";
  const nextSetNo = last == null ? 1 : setBroken ? currentSet + 1 : currentSet;
  return {
    counted: counted.length,
    currentSet,
    nextSetNo,
    streak,
    granted,
    capReached: nextSetNo > QIAN_PERMIT_SET_CAP,
  };
}

function permitMessage(
  outcome: JiaobeiOutcome,
  state: { streak: number; granted: boolean; nextSetNo: number; capReached: boolean },
) {
  if (outcome === "li") {
    return {
      th: "จอกตั้ง — เทพยังไม่ตอบ โยนใหม่ได้ทันที ครั้งนี้ไม่นับ",
      en: "A cup stands — no answer yet. Cast again now; this one does not count.",
      zh: "立筊——神明未答,即刻重擲,此次不計。",
    };
  }
  if (outcome === "sheng") {
    if (state.granted) {
      return {
        th: `ซิ่วปัวครบ ${QIAN_PERMIT_STREAK} ครั้งติด — เทพอนุญาตแล้ว จับใบเซียมซีได้เลย (ใบอนุญาตนี้จับได้ใบเดียว)`,
        en: `Three shengjiao in a row — permission granted. Draw your slip now (one slip per permission).`,
        zh: `連得三聖筊——神明允許,即可抽籤(一許一籤)。`,
      };
    }
    return {
      th: `ซิ่วปัว ${state.streak}/${QIAN_PERMIT_STREAK} — เทพเห็นชอบ โยนต่อให้ครบ 3 ครั้งติดจึงจับใบได้`,
      en: `Shengjiao ${state.streak}/${QIAN_PERMIT_STREAK} — keep casting; three in a row unlocks the draw.`,
      zh: `聖筊 ${state.streak}/${QIAN_PERMIT_STREAK}——繼續擲,連三次方可抽籤。`,
    };
  }
  const head =
    outcome === "xiao"
      ? { th: "ชี่ยวปัว — คำถามยังไม่ชัด", en: "Xiaojiao — the question is unclear", zh: "笑筊——所問未明" }
      : { th: "อิมปัว — ยังไม่ถึงเวลา", en: "Yinjiao — not yet time", zh: "陰筊——時機未到" };
  if (state.capReached) {
    return {
      th: `${head.th} และครบ ${QIAN_PERMIT_SET_CAP} ชุดแล้ว — วันนี้เทพยังไม่เปิดใบให้ ลองใหม่วันหลัง หรือไปไหว้ขอพรตามปกติก่อน`,
      en: `${head.en}, and ${QIAN_PERMIT_SET_CAP} sets are used — no slip today. Come back another day, or simply pay respects.`,
      zh: `${head.zh},且已滿${QIAN_PERMIT_SET_CAP}組——今日不開籤,改日再求,或先行禮拜。`,
    };
  }
  return {
    th: `${head.th} นับใหม่จากศูนย์ (ชุดที่ ${state.nextSetNo}/${QIAN_PERMIT_SET_CAP}) — ตั้งคำถามให้แคบลงแล้วโยนอีกครั้ง`,
    en: `${head.en}. Streak resets (set ${state.nextSetNo}/${QIAN_PERMIT_SET_CAP}) — narrow the question and cast again.`,
    zh: `${head.zh},連數歸零(第 ${state.nextSetNo}/${QIAN_PERMIT_SET_CAP} 組)——問題收窄後再擲。`,
  };
}

async function dayGanzhiOf(now: Date, tzOffsetMinutes: number) {
  try {
    const tyme = await import("tyme4ts");
    const local = new Date(now.getTime() + tzOffsetMinutes * 60_000);
    const solar = tyme.SolarDay.fromYmd(
      local.getUTCFullYear(),
      local.getUTCMonth() + 1,
      local.getUTCDate(),
    );
    return solar.getLunarDay().getSixtyCycle().getName() as string;
  } catch {
    return null;
  }
}

const PERMIT_DISCLOSURE = {
  th: "ของถวายไม่เปลี่ยนคำตอบของเทพ",
  en: "Offerings never change the deity's answer.",
  zh: "供品不改神意。",
};

export async function castQianPermit(userId: string, input: QianPermitInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await client.query(
      `SELECT outcome, face_left, face_right, sequence_no, set_no,
              server_seed, client_nonce, hour_key, hour_branch, day_ganzhi, cast_at
         FROM shrine_qian_permit_casts
        WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, input.idempotencyKey],
    );
    if (replay.rowCount) {
      await client.query("ROLLBACK");
      const row = replay.rows[0];
      return {
        ok: true as const,
        replayed: true,
        outcome: row.outcome as JiaobeiOutcome,
        faces: { left: row.face_left, right: row.face_right },
        sequenceNo: row.sequence_no,
        setNo: row.set_no,
        hourKey: row.hour_key,
        dayGanzhi: row.day_ganzhi,
        verify: {
          serverSeed: row.server_seed,
          clientNonce: row.client_nonce,
          algo: QIAN_PERMIT_ALGO,
        },
      };
    }

    // จองคิวตามรอบขออนุญาต กันสองเครื่องโยนพร้อมกันแล้วนับสายซิ่วปัวเพี้ยน
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `shrine-qian-permit:${userId}:${input.permitSessionId}`,
    ]);

    // ใบอนุญาตนี้ถูกใช้จับใบไปแล้วหรือยัง
    const drawn = await client.query(
      `SELECT slip_no FROM shrine_qian_draws
        WHERE user_id = $1 AND permit_session_id = $2`,
      [userId, input.permitSessionId],
    );
    if (drawn.rowCount) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "permit_already_used",
        status: 409,
        message: {
          th: `ใบอนุญาตรอบนี้ใช้จับใบที่ ${drawn.rows[0].slip_no} ไปแล้ว — ถ้าจะถามใหม่ ให้ตั้งจิตเริ่มรอบใหม่`,
          en: `This permission was already used for slip ${drawn.rows[0].slip_no}. Start a new round to ask again.`,
          zh: `本次許可已抽得第 ${drawn.rows[0].slip_no} 籤——欲再問請另起一輪。`,
        },
      };
    }

    const historyResult = await client.query(
      `SELECT outcome, sequence_no, set_no, cast_at
         FROM shrine_qian_permit_casts
        WHERE user_id = $1 AND permit_session_id = $2
        ORDER BY cast_at ASC, id ASC
        FOR UPDATE`,
      [userId, input.permitSessionId],
    );
    const before = summarizePermit(historyResult.rows as PermitRow[]);

    if (before.granted) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "permit_already_granted",
        status: 409,
        message: {
          th: "เทพอนุญาตแล้ว ไม่ต้องโยนซ้ำ — จับใบเซียมซีได้เลย",
          en: "Permission is already granted — draw your slip.",
          zh: "已獲允許,不必再擲——請抽籤。",
        },
      };
    }
    if (before.capReached) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "permit_set_cap_reached",
        status: 409,
        message: {
          th: `ครบ ${QIAN_PERMIT_SET_CAP} ชุดแล้ว — วันนี้ยังไม่ใช่จังหวะของเรื่องนี้ ไหว้ขอพรตามปกติแล้วกลับมาใหม่วันหลัง`,
          en: `${QIAN_PERMIT_SET_CAP} sets used — not the moment for this matter. Pay respects and return another day.`,
          zh: `已滿${QIAN_PERMIT_SET_CAP}組——此事今日非時,禮拜後改日再來。`,
        },
      };
    }

    const now = new Date();
    const { hourKey, hourBranch } = jiaobeiHourKey(now, input.tzOffsetMinutes);
    const dayGanzhi = await dayGanzhiOf(now, input.tzOffsetMinutes);
    const questionHash = hashJiaobeiQuestion(userId, input.questionText);
    const serverSeed = randomBytes(32).toString("hex");
    const { outcome, faceLeft, faceRight } = deriveJiaobeiOutcome(
      serverSeed,
      input.clientNonce,
    );

    const setNo = before.nextSetNo;
    const sequenceNo = outcome === "li" ? Math.max(1, before.streak) : before.streak + 1;
    const boundedSequence = Math.min(
      Math.max(sequenceNo, 1),
      QIAN_PERMIT_STREAK,
    );

    await client.query(
      `INSERT INTO shrine_qian_permit_casts
         (user_id, permit_session_id, deity_id, topic_key, question_hash,
          sequence_no, set_no, server_seed, client_nonce, face_left, face_right,
          outcome, tz_offset_minutes, hour_key, hour_branch, day_ganzhi,
          engine_version, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        userId,
        input.permitSessionId,
        input.deityId,
        input.topicKey,
        questionHash,
        boundedSequence,
        setNo,
        serverSeed,
        input.clientNonce,
        faceLeft,
        faceRight,
        outcome,
        input.tzOffsetMinutes,
        hourKey,
        hourBranch,
        dayGanzhi,
        "qian-permit-v1",
        input.idempotencyKey,
      ],
    );
    await client.query("COMMIT");

    const after = summarizePermit([
      ...(historyResult.rows as PermitRow[]),
      { outcome, sequence_no: boundedSequence, set_no: setNo, cast_at: now },
    ]);

    return {
      ok: true as const,
      replayed: false,
      outcome,
      faces: { left: faceLeft, right: faceRight },
      sequenceNo: boundedSequence,
      setNo,
      streak: after.streak,
      needStreak: QIAN_PERMIT_STREAK,
      granted: after.granted,
      setCap: QIAN_PERMIT_SET_CAP,
      capReached: after.capReached,
      hourKey,
      hourBranch,
      dayGanzhi,
      message: permitMessage(outcome, {
        streak: after.streak,
        granted: after.granted,
        nextSetNo: after.nextSetNo,
        capReached: after.capReached,
      }),
      disclosure: PERMIT_DISCLOSURE,
      verify: {
        serverSeed,
        clientNonce: input.clientNonce,
        algo: QIAN_PERMIT_ALGO,
      },
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ธุรกรรมอาจปิดไปแล้ว */
    }
    if (error instanceof QianInputError) {
      return { ok: false as const, error: error.message, status: 400 };
    }
    throw error;
  } finally {
    client.release();
  }
}

/** ห่อใบเซียมซีให้พร้อมส่งขึ้นหน้าจอ — ตัวจีนคู่คำแปลเสมอ */
function presentCard(slipNo: number) {
  const card = qianCard(slipNo);
  return {
    no: card.no,
    ganzhi: card.ganzhi,
    trigram: card.trigram,
    elementDirection: card.elementDirection,
    poem: card.poem,
    fanshi: card.fanshi,
    storyTitles: card.storyTitles,
    topicOrder: QIAN_TOPIC_ORDER,
    topicLabels: QIAN_TOPIC_LABELS,
    interpretation: card.interpretation,
    canonVersion: QIAN_CANON_VERSION,
    canonSource: qianCanonSource(),
    disclosure: QIAN_DISCLOSURE,
  };
}

export async function drawQian(userId: string, input: QianDrawInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await client.query(
      `SELECT slip_no, server_seed, client_nonce, hour_key, hour_branch,
              day_ganzhi, drawn_at, permit_session_id
         FROM shrine_qian_draws
        WHERE user_id = $1
          AND (idempotency_key = $2 OR permit_session_id = $3)`,
      [userId, input.idempotencyKey, input.permitSessionId],
    );
    if (replay.rowCount) {
      await client.query("ROLLBACK");
      const row = replay.rows[0];
      return {
        ok: true as const,
        replayed: true,
        slipNo: row.slip_no,
        card: presentCard(row.slip_no),
        permitSessionId: row.permit_session_id,
        hourKey: row.hour_key,
        dayGanzhi: row.day_ganzhi,
        drawnAt: row.drawn_at,
        message: {
          th: `ใบที่ ${row.slip_no} ของรอบนี้ — จับได้ใบเดียวต่อหนึ่งใบอนุญาต ใบนี้คือใบเดิม`,
          en: `Slip ${row.slip_no} for this round — one slip per permission; this is the same slip.`,
          zh: `本輪第 ${row.slip_no} 籤——一許一籤,仍為此籤。`,
        },
        verify: {
          serverSeed: row.server_seed,
          clientNonce: row.client_nonce,
          algo: QIAN_DRAW_ALGO,
        },
      };
    }

    // จองคิวตามรอบขออนุญาต กันจับสองใบพร้อมกันจากใบอนุญาตเดียว
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `shrine-qian-draw:${userId}:${input.permitSessionId}`,
    ]);

    const permitRows = await client.query(
      `SELECT outcome, sequence_no, set_no, cast_at, deity_id, topic_key, question_hash
         FROM shrine_qian_permit_casts
        WHERE user_id = $1 AND permit_session_id = $2
        ORDER BY cast_at ASC, id ASC
        FOR UPDATE`,
      [userId, input.permitSessionId],
    );
    if (!permitRows.rowCount) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "permit_required",
        status: 403,
        message: {
          th: "ยังไม่ได้ขออนุญาต — ตามตำราต้องโยนจอกถามเทพให้ได้ซิ่วปัว 3 ครั้งติดก่อน จึงจับใบเซียมซีได้",
          en: "No permission yet — by the canon you must first cast the moon blocks and receive three shengjiao in a row.",
          zh: "尚未請示——依例須先擲筊連得三聖筊,方可抽籤。",
        },
      };
    }
    const state = summarizePermit(permitRows.rows as PermitRow[]);
    if (!state.granted) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "permit_not_granted",
        status: 403,
        message: {
          th: `ยังได้ซิ่วปัวติดกัน ${state.streak}/${QIAN_PERMIT_STREAK} ครั้ง — โยนจอกให้ครบ 3 ครั้งติดก่อน แล้วค่อยจับใบ`,
          en: `Shengjiao streak ${state.streak}/${QIAN_PERMIT_STREAK} — complete three in a row before drawing.`,
          zh: `聖筊連數 ${state.streak}/${QIAN_PERMIT_STREAK}——連足三次再抽籤。`,
        },
        streak: state.streak,
        needStreak: QIAN_PERMIT_STREAK,
      };
    }

    const head = permitRows.rows[0];
    const now = new Date();
    const { hourKey, hourBranch } = jiaobeiHourKey(now, input.tzOffsetMinutes);
    const dayGanzhi = await dayGanzhiOf(now, input.tzOffsetMinutes);
    const serverSeed = randomBytes(32).toString("hex");
    const slipNo = deriveQianSlipNo(serverSeed, input.clientNonce);

    await client.query(
      `INSERT INTO shrine_qian_draws
         (user_id, permit_session_id, slip_no, deity_id, topic_key,
          question_hash, server_seed, client_nonce, tz_offset_minutes,
          hour_key, hour_branch, day_ganzhi, canon_version, engine_version,
          idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        userId,
        input.permitSessionId,
        slipNo,
        head.deity_id,
        head.topic_key,
        head.question_hash,
        serverSeed,
        input.clientNonce,
        input.tzOffsetMinutes,
        hourKey,
        hourBranch,
        dayGanzhi,
        QIAN_CANON_VERSION,
        "qian-draw-v1",
        input.idempotencyKey,
      ],
    );
    await client.query("COMMIT");

    return {
      ok: true as const,
      replayed: false,
      slipNo,
      card: presentCard(slipNo),
      permitSessionId: input.permitSessionId,
      hourKey,
      hourBranch,
      dayGanzhi,
      message: {
        th: `ได้ใบที่ ${slipNo} — อ่านกลอนทั้ง 4 วรรคก่อน แล้วค่อยดูคำแก้ตามเรื่องที่ถาม จะให้แน่ใจว่าใช่ใบของท่านจริง ให้โยนจอกยืนยันอีกชุดหนึ่ง`,
        en: `Slip ${slipNo} — read all four lines first, then the topic wording. To confirm this slip is truly yours, cast the moon blocks once more.`,
        zh: `得第 ${slipNo} 籤——先讀四句籤詩,再看所問之解;欲確認此籤,可再擲筊印證。`,
      },
      nextStep: {
        route: "/api/mobile/v1/shrine/jiaobei/cast",
        purpose: "qian_confirm",
        qianSlipNo: slipNo,
        hint: {
          th: "โยนจอกยืนยันใบนี้ (ไม่บังคับ) — เส้นทางเดิมที่มีอยู่แล้ว",
          en: "Optional confirmation cast for this slip — uses the existing route.",
          zh: "可選:為此籤擲筊印證(沿用原有路徑)。",
        },
      },
      disclosure: PERMIT_DISCLOSURE,
      verify: {
        serverSeed,
        clientNonce: input.clientNonce,
        algo: QIAN_DRAW_ALGO,
      },
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ธุรกรรมอาจปิดไปแล้ว */
    }
    if (error instanceof QianInputError) {
      return { ok: false as const, error: error.message, status: 400 };
    }
    throw error;
  } finally {
    client.release();
  }
}
