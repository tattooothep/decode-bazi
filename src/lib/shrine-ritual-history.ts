import { q } from "@/lib/db";
import { STRIKE_FULL_ROUND, type StrikeRitual } from "@/lib/shrine-ritual-strike";
import { qianCard } from "@/lib/shrine-qian-canon";

/**
 * ประวัติพิธีรวม 5 อย่าง — ตีระฆัง · ตีกลอง · เคาะปลา · โยนจอก · เสี่ยงเซียมซี
 *
 * 🔴 ทุกคำสั่งอ่านต้องมี user_id = $1 เสมอ ไม่มีทางเรียกดูของคนอื่นได้
 *    (บทเรียนจากรูรั่วหน้าดูดวง: อย่าให้รหัสรายการจากผู้เรียกเป็นตัวตัดสินสิทธิ์)
 */

export type RitualKind =
  | "bell"
  | "drum"
  | "muyu"
  | "jiaobei"
  | "qian_permit"
  | "qian_draw";

export interface RitualHistoryEntry {
  id: string;
  kind: RitualKind;
  at: string;
  title: { th: string; en: string; zh: string };
  detail: { th: string; en: string; zh: string };
  hourKey: string | null;
  dayGanzhi: string | null;
  verifiable: boolean;
}

const OUTCOME_LABEL: Record<string, { th: string; en: string; zh: string }> = {
  sheng: { th: "ซิ่วปัว (เทพเห็นชอบ)", en: "Shengjiao (approval)", zh: "聖筊" },
  xiao: { th: "ชี่ยวปัว (คำถามยังไม่ชัด)", en: "Xiaojiao (unclear question)", zh: "笑筊" },
  yin: { th: "อิมปัว (ยังไม่ถึงเวลา)", en: "Yinjiao (not yet time)", zh: "陰筊" },
  li: { th: "จอกตั้ง (ยังไม่ตอบ ไม่นับครั้ง)", en: "Lijiao (no answer, not counted)", zh: "立筊" },
};

const STRIKE_TITLE: Record<StrikeRitual, { th: string; en: string; zh: string }> = {
  bell: { th: "ตีระฆัง", en: "Bell striking", zh: "撞鐘" },
  drum: { th: "ตีกลอง", en: "Drum striking", zh: "擊鼓" },
  muyu: { th: "เคาะปลาไม้", en: "Wooden fish", zh: "敲木魚" },
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface HistoryOptions {
  limit: number;
  before: Date | null;
  kinds: readonly RitualKind[] | null;
}

export function parseHistoryOptions(url: URL): HistoryOptions {
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 20;
  const rawBefore = url.searchParams.get("before");
  let before: Date | null = null;
  if (rawBefore) {
    const parsed = new Date(rawBefore);
    if (!Number.isNaN(parsed.getTime())) before = parsed;
  }
  const rawKinds = url.searchParams.get("kind");
  let kinds: RitualKind[] | null = null;
  if (rawKinds) {
    const allowed: RitualKind[] = [
      "bell", "drum", "muyu", "jiaobei", "qian_permit", "qian_draw",
    ];
    const picked = rawKinds
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is RitualKind =>
        (allowed as string[]).includes(value),
      );
    if (picked.length) kinds = picked;
  }
  return { limit, before, kinds };
}

function wants(options: HistoryOptions, ...kinds: RitualKind[]): boolean {
  if (!options.kinds) return true;
  return kinds.some((kind) => options.kinds!.includes(kind));
}

export async function ritualHistory(userId: string, options: HistoryOptions) {
  const cutoff = options.before ? options.before.toISOString() : null;
  const fetchLimit = options.limit + 1;
  const entries: RitualHistoryEntry[] = [];

  if (wants(options, "bell", "drum", "muyu")) {
    const rows = await q<{
      id: string;
      ritual: StrikeRitual;
      strikes: number;
      day_total: number;
      completed_108: boolean;
      hour_key: string;
      day_ganzhi: string | null;
      struck_at: Date;
    }>(
      `SELECT id, ritual, strikes, day_total, completed_108, hour_key,
              day_ganzhi, struck_at
         FROM shrine_ritual_strikes
        WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR struck_at < $2::timestamptz)
          AND ($3::text[] IS NULL OR ritual = ANY($3::text[]))
        ORDER BY struck_at DESC
        LIMIT $4`,
      [
        userId,
        cutoff,
        options.kinds
          ? options.kinds.filter((kind) =>
              ["bell", "drum", "muyu"].includes(kind),
            )
          : null,
        fetchLimit,
      ],
    );
    for (const row of rows) {
      const done = row.completed_108;
      entries.push({
        id: row.id,
        kind: row.ritual,
        at: iso(row.struck_at),
        title: STRIKE_TITLE[row.ritual],
        detail: done
          ? {
              th: `${row.strikes} ครั้ง · ครบ ${STRIKE_FULL_ROUND} ครั้งของวันนั้นแล้ว`,
              en: `${row.strikes} strikes · reached ${STRIKE_FULL_ROUND} that day`,
              zh: `${row.strikes} 響 · 當日已滿 ${STRIKE_FULL_ROUND} 響`,
            }
          : {
              th: `${row.strikes} ครั้ง · สะสมวันนั้น ${row.day_total}/${STRIKE_FULL_ROUND}`,
              en: `${row.strikes} strikes · ${row.day_total}/${STRIKE_FULL_ROUND} that day`,
              zh: `${row.strikes} 響 · 當日累計 ${row.day_total}/${STRIKE_FULL_ROUND}`,
            },
        hourKey: row.hour_key,
        dayGanzhi: row.day_ganzhi,
        verifiable: false,
      });
    }
  }

  if (wants(options, "jiaobei")) {
    const rows = await q<{
      id: string;
      outcome: string;
      purpose: string;
      qian_slip_no: number | null;
      attempt_no: number;
      sequence_no: number;
      hour_key: string;
      day_ganzhi: string | null;
      cast_at: Date;
      question_text: string | null;
    }>(
      `SELECT c.id, c.outcome, c.purpose, c.qian_slip_no, c.attempt_no,
              c.sequence_no, c.hour_key, c.day_ganzhi, c.cast_at,
              qn.question_text
         FROM shrine_jiaobei_casts c
         LEFT JOIN shrine_jiaobei_questions qn
                ON qn.id = c.question_id AND qn.user_id = c.user_id
        WHERE c.user_id = $1
          AND ($2::timestamptz IS NULL OR c.cast_at < $2::timestamptz)
        ORDER BY c.cast_at DESC
        LIMIT $3`,
      [userId, cutoff, fetchLimit],
    );
    for (const row of rows) {
      const label = OUTCOME_LABEL[row.outcome] || OUTCOME_LABEL.li;
      const scope =
        row.purpose === "qian_confirm"
          ? {
              th: `ยืนยันใบเซียมซีที่ ${row.qian_slip_no ?? "-"} · ครั้งที่ ${row.sequence_no}/3`,
              en: `Confirming slip ${row.qian_slip_no ?? "-"} · ${row.sequence_no}/3`,
              zh: `印證第 ${row.qian_slip_no ?? "-"} 籤 · ${row.sequence_no}/3`,
            }
          : {
              th: `ถามครั้งที่ ${row.attempt_no}/3${row.question_text ? ` · ${row.question_text}` : ""}`,
              en: `Ask ${row.attempt_no}/3${row.question_text ? ` · ${row.question_text}` : ""}`,
              zh: `第 ${row.attempt_no}/3 問${row.question_text ? ` · ${row.question_text}` : ""}`,
            };
      entries.push({
        id: row.id,
        kind: "jiaobei",
        at: iso(row.cast_at),
        title: {
          th: `โยนจอก — ${label.th}`,
          en: `Moon blocks — ${label.en}`,
          zh: `擲筊 — ${label.zh}`,
        },
        detail: scope,
        hourKey: row.hour_key,
        dayGanzhi: row.day_ganzhi,
        verifiable: true,
      });
    }
  }

  if (wants(options, "qian_permit")) {
    const rows = await q<{
      id: string;
      outcome: string;
      sequence_no: number;
      set_no: number;
      hour_key: string;
      day_ganzhi: string | null;
      cast_at: Date;
    }>(
      `SELECT id, outcome, sequence_no, set_no, hour_key, day_ganzhi, cast_at
         FROM shrine_qian_permit_casts
        WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR cast_at < $2::timestamptz)
        ORDER BY cast_at DESC
        LIMIT $3`,
      [userId, cutoff, fetchLimit],
    );
    for (const row of rows) {
      const label = OUTCOME_LABEL[row.outcome] || OUTCOME_LABEL.li;
      entries.push({
        id: row.id,
        kind: "qian_permit",
        at: iso(row.cast_at),
        title: {
          th: `โยนจอกขออนุญาตเสี่ยงเซียมซี — ${label.th}`,
          en: `Permission cast before drawing — ${label.en}`,
          zh: `求籤前請示擲筊 — ${label.zh}`,
        },
        detail: {
          th: `ชุดที่ ${row.set_no}/5 · ครั้งที่ ${row.sequence_no}/3`,
          en: `Set ${row.set_no}/5 · cast ${row.sequence_no}/3`,
          zh: `第 ${row.set_no}/5 組 · 第 ${row.sequence_no}/3 擲`,
        },
        hourKey: row.hour_key,
        dayGanzhi: row.day_ganzhi,
        verifiable: true,
      });
    }
  }

  if (wants(options, "qian_draw")) {
    const rows = await q<{
      id: string;
      slip_no: number;
      hour_key: string;
      day_ganzhi: string | null;
      drawn_at: Date;
    }>(
      `SELECT id, slip_no, hour_key, day_ganzhi, drawn_at
         FROM shrine_qian_draws
        WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR drawn_at < $2::timestamptz)
        ORDER BY drawn_at DESC
        LIMIT $3`,
      [userId, cutoff, fetchLimit],
    );
    for (const row of rows) {
      let ganzhi = "";
      let firstLineZh = "";
      let firstLineTh = "";
      try {
        const card = qianCard(row.slip_no);
        ganzhi = card.ganzhi;
        firstLineZh = card.poem[0]?.zh || "";
        firstLineTh = card.poem[0]?.th || "";
      } catch {
        /* คัมภีร์อ่านไม่ได้ ก็ยังต้องขึ้นรายการให้เห็น */
      }
      entries.push({
        id: row.id,
        kind: "qian_draw",
        at: iso(row.drawn_at),
        title: {
          th: `เซียมซีใบที่ ${row.slip_no}${ganzhi ? ` (${ganzhi})` : ""}`,
          en: `Fortune slip ${row.slip_no}${ganzhi ? ` (${ganzhi})` : ""}`,
          zh: `第 ${row.slip_no} 籤${ganzhi ? ` (${ganzhi})` : ""}`,
        },
        detail: {
          th: firstLineTh || firstLineZh,
          en: firstLineZh,
          zh: firstLineZh,
        },
        hourKey: row.hour_key,
        dayGanzhi: row.day_ganzhi,
        verifiable: true,
      });
    }
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const page = entries.slice(0, options.limit);
  const nextCursor =
    entries.length > options.limit ? page[page.length - 1]?.at || null : null;

  return {
    ok: true as const,
    entries: page,
    nextCursor,
    empty: page.length === 0,
    emptyMessage: {
      th: "ยังไม่มีประวัติพิธี — เริ่มจากตีระฆังหน้าวิหาร แล้วผลจะมาขึ้นตรงนี้เอง",
      en: "No ritual history yet — start with the bell at the hall, and it will appear here.",
      zh: "尚無禮儀紀錄——先在殿前撞鐘,紀錄便會顯示於此。",
    },
  };
}

/** สรุปยอดรวมไว้ขึ้นหัวหน้าประวัติ */
export async function ritualSummary(userId: string) {
  const rows = await q<{ ritual: string; sessions: string; strikes: string }>(
    `SELECT ritual, COUNT(*)::text AS sessions, SUM(strikes)::text AS strikes
       FROM shrine_ritual_strikes
      WHERE user_id = $1
      GROUP BY ritual`,
    [userId],
  );
  const jiaobei = await q<{ total: string; sheng: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE outcome = 'sheng')::text AS sheng
       FROM shrine_jiaobei_casts WHERE user_id = $1`,
    [userId],
  );
  const permits = await q<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM shrine_qian_permit_casts WHERE user_id = $1`,
    [userId],
  );
  const draws = await q<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM shrine_qian_draws WHERE user_id = $1`,
    [userId],
  );
  const byRitual: Record<string, { sessions: number; strikes: number }> = {};
  for (const row of rows) {
    byRitual[row.ritual] = {
      sessions: Number(row.sessions),
      strikes: Number(row.strikes || 0),
    };
  }
  return {
    strikes: {
      bell: byRitual.bell || { sessions: 0, strikes: 0 },
      drum: byRitual.drum || { sessions: 0, strikes: 0 },
      muyu: byRitual.muyu || { sessions: 0, strikes: 0 },
    },
    jiaobei: {
      total: Number(jiaobei[0]?.total || 0),
      sheng: Number(jiaobei[0]?.sheng || 0),
    },
    qianPermitCasts: Number(permits[0]?.total || 0),
    qianDraws: Number(draws[0]?.total || 0),
  };
}
