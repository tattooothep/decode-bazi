import { pool } from "@/lib/db";
import { jiaobeiHourKey } from "@/lib/shrine-jiaobei";

/**
 * ตีระฆัง · ตีกลอง · เคาะปลา — เครื่องยนต์กลาง 7 ส.ค. 69
 *
 * หลักตามธรรมเนียม:
 * - 108 ครั้ง = ครบรอบ (ดับกิเลส 108 กอง) นับสะสมภายในวันท้องถิ่นเดียวกัน
 * - 晨鐘暮鼓 ระฆังคู่เช้า กลองคู่เย็น — บอกเป็นคำแนะนำ ไม่ใช่การห้าม
 * - 木魚 ปลาไม่หลับตา = ตีเพื่อคุมจังหวะและความรู้ตัว ไม่ใช่การขอพร
 *
 * 🔴 ไม่มีการสุ่มในพิธีนี้ ผลคำนวณตรงจากจำนวนครั้ง จึงคำนวณซ้ำได้ตรงกันทุกครั้ง
 *    (ส่วนที่ต้องสุ่มมีแค่โยนจอกกับเซียมซี ซึ่งแนบหลักฐานตรวจย้อนไว้แล้ว)
 * 🔴 ห้ามให้ผลพิธีนี้กลายเป็นคำทำนายหรือคำสัญญาผลลัพธ์ใด ๆ
 */

export type StrikeRitual = "bell" | "drum" | "muyu";

export const STRIKE_RITUALS: readonly StrikeRitual[] = ["bell", "drum", "muyu"];

/** ครบรอบเมื่อสะสมถึงเลขนี้ภายในวันเดียว */
export const STRIKE_FULL_ROUND = 108;

export interface StrikeInput {
  ritual: StrikeRitual;
  strikes: number;
  sessionSeconds: number;
  deityId: string;
  tzOffsetMinutes: number;
  idempotencyKey: string;
}

const DEITY_ID_PATTERN = /^[a-z][a-z0-9-]{2,39}$/u;
const IDEMPOTENCY_PATTERN = /^strike_[0-9a-f]{32}$/u;

class StrikeInputError extends Error {
  constructor(field: string) {
    super(`invalid_${field}`);
  }
}

export function parseStrikeInput(raw: unknown): StrikeInput {
  if (typeof raw !== "object" || raw === null) throw new StrikeInputError("body");
  const body = raw as Record<string, unknown>;
  const ritual = body.ritual;
  if (
    ritual !== "bell" &&
    ritual !== "drum" &&
    ritual !== "muyu"
  ) {
    throw new StrikeInputError("ritual");
  }
  const strikes = Number(body.strikes);
  if (!Number.isInteger(strikes) || strikes < 1 || strikes > STRIKE_FULL_ROUND) {
    throw new StrikeInputError("strikes");
  }
  const rawSeconds = Number(body.session_seconds);
  const sessionSeconds =
    Number.isInteger(rawSeconds) && rawSeconds >= 0 && rawSeconds <= 86_400
      ? rawSeconds
      : 0;
  const deityId =
    typeof body.deity_id === "string" && DEITY_ID_PATTERN.test(body.deity_id)
      ? body.deity_id
      : "general";
  const idempotencyKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new StrikeInputError("idempotency_key");
  }
  const tzRaw = Number(body.tz_offset_minutes);
  const tzOffsetMinutes =
    Number.isInteger(tzRaw) && tzRaw >= -840 && tzRaw <= 840 ? tzRaw : 420;
  return {
    ritual,
    strikes,
    sessionSeconds,
    deityId,
    tzOffsetMinutes,
    idempotencyKey,
  };
}

export function localDayString(at: Date, tzOffsetMinutes: number): string {
  const local = new Date(at.getTime() + tzOffsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const RITUAL_NAMES: Record<StrikeRitual, { th: string; en: string; zh: string }> = {
  bell: { th: "ตีระฆัง", en: "Bell", zh: "撞鐘" },
  drum: { th: "ตีกลอง", en: "Drum", zh: "擊鼓" },
  muyu: { th: "เคาะปลาไม้", en: "Wooden fish", zh: "敲木魚" },
};

/** คำอธิบายความหมายของพิธี — เป็นความรู้ตามธรรมเนียม ไม่ใช่คำทำนาย */
const RITUAL_MEANING: Record<
  StrikeRitual,
  { th: string; en: string; zh: string }
> = {
  bell: {
    th: "เสียงระฆังใช้เปิดวันและเรียกสติกลับมาที่ตัว ตามธรรมเนียมคู่กับช่วงเช้า",
    en: "The bell opens the day and calls the mind back; by custom it pairs with morning.",
    zh: "鐘聲開日、攝心歸位,依例配於晨時。",
  },
  drum: {
    th: "เสียงกลองใช้ปิดวันและวางเรื่องที่แบกมาทั้งวันลง ตามธรรมเนียมคู่กับช่วงเย็น",
    en: "The drum closes the day and sets down what you carried; by custom it pairs with dusk.",
    zh: "鼓聲收日、放下所負,依例配於暮時。",
  },
  muyu: {
    th: "ปลาไม้ไม่หลับตา จึงใช้คุมจังหวะสวดและกันใจเผลอ ไม่ใช่การขอสิ่งใด",
    en: "The wooden fish never shuts its eyes; it keeps the chanting rhythm and the mind awake — it asks for nothing.",
    zh: "木魚不合目,用以節誦、警心不寐,非為所求。",
  },
};

/** 晨鐘暮鼓 — บอกจังหวะที่ธรรมเนียมนิยม ไม่ใช่การห้าม */
function timingHint(ritual: StrikeRitual, hourBranch: string) {
  const morning = ["寅", "卯", "辰", "巳"].includes(hourBranch);
  const evening = ["申", "酉", "戌", "亥"].includes(hourBranch);
  if (ritual === "bell" && morning) {
    return {
      th: "ตรงจังหวะพอดี — ระฆังคู่ยามเช้าตามคำว่า 晨鐘",
      en: "Right on time — the bell belongs to the morning (晨鐘).",
      zh: "正合其時——晨鐘。",
    };
  }
  if (ritual === "drum" && evening) {
    return {
      th: "ตรงจังหวะพอดี — กลองคู่ยามเย็นตามคำว่า 暮鼓",
      en: "Right on time — the drum belongs to the dusk (暮鼓).",
      zh: "正合其時——暮鼓。",
    };
  }
  if (ritual === "muyu") {
    return {
      th: "เคาะปลาไม่เลือกยาม ตีได้ทุกเวลาที่ตั้งใจสวด",
      en: "The wooden fish keeps no hour; strike it whenever you settle to chant.",
      zh: "木魚不擇時,凡靜誦皆可。",
    };
  }
  return {
    th: "ยามนี้ไม่ใช่ยามที่ธรรมเนียมนิยม แต่ตีได้ ไม่ถือเป็นข้อห้าม",
    en: "Not the customary hour, but striking now is allowed — it is not a prohibition.",
    zh: "非慣例之時,然仍可擊,非有禁忌。",
  };
}

function progressMessage(
  ritual: StrikeRitual,
  dayTotal: number,
  added: number,
) {
  const name = RITUAL_NAMES[ritual];
  if (dayTotal >= STRIKE_FULL_ROUND) {
    return {
      th: `${name.th}ครบ ${STRIKE_FULL_ROUND} ครั้งของวันนี้แล้ว — จบรอบสมบูรณ์ นั่งฟังเสียงหางระฆังจนเงียบสนิทแล้วค่อยลุก`,
      en: `${name.en}: ${STRIKE_FULL_ROUND} strikes complete for today — sit until the last resonance fades before you rise.`,
      zh: `${name.zh}今日已滿 ${STRIKE_FULL_ROUND} 響——圓一輪,待餘音盡息再起身。`,
    };
  }
  const left = STRIKE_FULL_ROUND - dayTotal;
  return {
    th: `${name.th} ${added} ครั้ง รวมวันนี้ ${dayTotal}/${STRIKE_FULL_ROUND} — เหลืออีก ${left} ครั้งจะครบรอบ กลับมาตีต่อได้ในวันเดียวกัน`,
    en: `${name.en} ×${added}, today ${dayTotal}/${STRIKE_FULL_ROUND} — ${left} to go; you may return within the same day.`,
    zh: `${name.zh} ${added} 響,今日 ${dayTotal}/${STRIKE_FULL_ROUND}——尚差 ${left} 響,同日可續。`,
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

export async function recordStrike(userId: string, input: StrikeInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await client.query(
      `SELECT ritual, strikes, day_total, completed_108, local_day,
              hour_key, hour_branch, day_ganzhi, struck_at
         FROM shrine_ritual_strikes
        WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, input.idempotencyKey],
    );
    if (replay.rowCount) {
      await client.query("ROLLBACK");
      const row = replay.rows[0];
      return {
        ok: true as const,
        replayed: true,
        ritual: row.ritual as StrikeRitual,
        ritualName: RITUAL_NAMES[row.ritual as StrikeRitual],
        strikes: row.strikes,
        dayTotal: row.day_total,
        fullRound: STRIKE_FULL_ROUND,
        completed: row.completed_108,
        localDay: row.local_day,
        hourKey: row.hour_key,
        dayGanzhi: row.day_ganzhi,
        message: progressMessage(
          row.ritual as StrikeRitual,
          row.day_total,
          row.strikes,
        ),
        meaning: RITUAL_MEANING[row.ritual as StrikeRitual],
        timing: timingHint(row.ritual as StrikeRitual, row.hour_branch || ""),
      };
    }

    const now = new Date();
    const { hourKey, hourBranch } = jiaobeiHourKey(now, input.tzOffsetMinutes);
    const localDay = localDayString(now, input.tzOffsetMinutes);

    // กันสองเครื่องตีพร้อมกันแล้วยอดวันเพี้ยน — จองคิวตาม (ผู้ใช้ + พิธี + วัน)
    // ใช้กุญแจจองระดับธุรกรรม ปลดเองตอนจบธุรกรรม ไม่ค้างแม้พัง
    // (ห้ามใช้ FOR UPDATE คู่กับฟังก์ชันรวมยอด ฐานข้อมูลไม่ยอม)
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `shrine-strike:${userId}:${input.ritual}:${localDay}`,
    ]);
    const totalRow = await client.query(
      `SELECT COALESCE(MAX(day_total), 0) AS total
         FROM shrine_ritual_strikes
        WHERE user_id = $1 AND ritual = $2 AND local_day = $3`,
      [userId, input.ritual, localDay],
    );
    const before = Number(totalRow.rows[0]?.total || 0);
    const dayTotal = Math.min(before + input.strikes, 100_000);
    const completed = dayTotal >= STRIKE_FULL_ROUND;
    const dayGanzhi = await dayGanzhiOf(now, input.tzOffsetMinutes);

    await client.query(
      `INSERT INTO shrine_ritual_strikes
         (user_id, ritual, strikes, day_total, session_seconds, completed_108,
          deity_id, tz_offset_minutes, local_day, hour_key, hour_branch,
          day_ganzhi, engine_version, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        userId,
        input.ritual,
        input.strikes,
        dayTotal,
        input.sessionSeconds,
        completed,
        input.deityId,
        input.tzOffsetMinutes,
        localDay,
        hourKey,
        hourBranch,
        dayGanzhi,
        "strike-v1",
        input.idempotencyKey,
      ],
    );
    await client.query("COMMIT");

    return {
      ok: true as const,
      replayed: false,
      ritual: input.ritual,
      ritualName: RITUAL_NAMES[input.ritual],
      strikes: input.strikes,
      dayTotal,
      fullRound: STRIKE_FULL_ROUND,
      remaining: Math.max(0, STRIKE_FULL_ROUND - dayTotal),
      completed,
      localDay,
      hourKey,
      hourBranch,
      dayGanzhi,
      message: progressMessage(input.ritual, dayTotal, input.strikes),
      meaning: RITUAL_MEANING[input.ritual],
      timing: timingHint(input.ritual, hourBranch),
      // ไม่มีการสุ่ม — บอกตรง ๆ ว่าตรวจซ้ำได้ด้วยการบวกเลข
      verify: {
        random: false,
        rule: "day_total = sum(strikes) within the same local day; completed = day_total >= 108",
      },
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ธุรกรรมอาจปิดไปแล้ว */
    }
    if (error instanceof StrikeInputError) {
      return { ok: false as const, error: error.message, status: 400 };
    }
    throw error;
  } finally {
    client.release();
  }
}
