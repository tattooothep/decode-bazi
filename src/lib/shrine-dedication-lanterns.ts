import { randomUUID } from "crypto";
import { pool, q } from "@/lib/db";

// ⑦ โคมถวายชื่อ 30 วัน — จ่ายยามแขวนโคมแดง+ป้ายชื่อทองใต้ชายคาวิหาร
// pattern เดียวกับ src/lib/shrine-offering-shop.ts (r525)

export const DEDICATION_LANTERN_COST_YAM = 10;
export const DEDICATION_LANTERN_DURATION_DAYS = 30;
export const DEDICATION_LANTERN_ACTIVE_LIMIT_PER_USER = 3;
export const DEDICATION_LANTERN_COMMUNITY_LIST_LIMIT = 60;
export const DEDICATION_NAME_MAX_CHARS = 20;
export const DEDICATION_BLESSING_MAX_CHARS = 60;

// อักษรไทย (พยัญชนะ/สระ/วรรณยุกต์/เลขไทย) + ละติน + เลขอารบิก + เว้นวรรค + . - '
// จำกัด charset เพราะป้ายชื่อ 3D ฝั่งแอพ rasterize ด้วย glyph font ชุดนี้เท่านั้น
const DEDICATION_ALLOWED_RE =
  /^[ก-ฺเ-๎๐-๙A-Za-z0-9 .\-']+$/u;
// mark ที่ซ้อนบน/ล่างพยัญชนะ — ไม่นับเป็น "ตัวอักษร" ตอนวัดความยาว
const THAI_COMBINING_RE = /[ัิ-ฺ็-๎]/u;

// คำหยาบพื้นฐาน (เทียบหลัง lowercase + ตัดช่องว่าง)
const DEDICATION_PROFANITY = [
  "ควย", "เหี้ย", "เหี้", "สัส", "สัด", "เย็ด", "หำ", "แตด", "ดอกทอง",
  "มึง", "ไอ้สัตว์", "ระยำ", "ชาติหมา",
  "fuck", "shit", "bitch", "cunt", "dick", "porn", "sex", "whore", "slut",
];

export type DedicationTextRejection =
  | "empty"
  | "too_long"
  | "unsupported_characters"
  | "profanity";

export type DedicationTextResult =
  | Readonly<{ ok: true; text: string; chars: number }>
  | Readonly<{ ok: false; reason: DedicationTextRejection }>;

function countDedicationChars(text: string): number {
  let chars = 0;
  for (const codePoint of text) {
    if (!THAI_COMBINING_RE.test(codePoint)) chars += 1;
  }
  return chars;
}

function containsProfanity(text: string): boolean {
  const flattened = text.toLowerCase().replace(/[\s.\-']+/gu, "");
  return DEDICATION_PROFANITY.some((word) => flattened.includes(word));
}

export function sanitizeDedicationText(
  raw: unknown,
  maxChars: number,
  allowEmpty: boolean,
): DedicationTextResult {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  let text = raw.normalize("NFC");
  // HTML/tag + อักษรควบคุม + zero-width/bidi → ปฏิเสธผ่าน charset whitelist
  text = text.replace(/\s+/gu, " ").trim();
  if (text.length === 0) {
    return allowEmpty
      ? { ok: true, text: "", chars: 0 }
      : { ok: false, reason: "empty" };
  }
  if (!DEDICATION_ALLOWED_RE.test(text)) {
    return { ok: false, reason: "unsupported_characters" };
  }
  const chars = countDedicationChars(text);
  if (chars === 0) return { ok: false, reason: "empty" };
  if (chars > maxChars) return { ok: false, reason: "too_long" };
  if (containsProfanity(text)) return { ok: false, reason: "profanity" };
  return { ok: true, text, chars };
}

export type ShrineDedicationInput = Readonly<{
  dedicationName: string;
  blessing: string;
  idempotencyKey: string;
}>;

function inputInvalid(detail: string): never {
  throw new Error(`shrine_dedication_input_invalid:${detail}`);
}

function strictRecord(
  value: unknown,
  allowedKeys: readonly string[],
  detail: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return inputInvalid(detail);
  }
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw).sort();
  const expected = [...allowedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return inputInvalid(`${detail}_keys`);
  }
  return raw;
}

export function parseShrineDedicationInput(value: unknown): ShrineDedicationInput {
  const raw = strictRecord(
    value,
    ["dedication_name", "blessing", "idempotency_key"],
    "dedication",
  );
  const idempotencyKey = typeof raw.idempotency_key === "string"
    ? raw.idempotency_key.trim()
    : "";
  if (!/^lantern_[0-9a-f]{32}$/u.test(idempotencyKey)) inputInvalid("idempotency_key");
  const name = sanitizeDedicationText(raw.dedication_name, DEDICATION_NAME_MAX_CHARS, false);
  if (!name.ok) inputInvalid(`dedication_name_${name.reason}`);
  const blessing = sanitizeDedicationText(raw.blessing, DEDICATION_BLESSING_MAX_CHARS, true);
  if (!blessing.ok) inputInvalid(`blessing_${blessing.reason}`);
  return Object.freeze({
    dedicationName: name.text,
    blessing: blessing.text,
    idempotencyKey,
  });
}

type LanternRow = {
  id: string;
  user_id: string;
  dedication_name: string;
  blessing: string;
  charged_yam: number;
  balance_after: number;
  idempotency_key: string;
  lantern_slot: number;
  starts_at: string;
  expires_at: string;
};

function publicLantern(row: LanternRow, viewerUserId: string) {
  const mine = row.user_id === viewerUserId;
  return {
    id: row.id,
    dedication_name: row.dedication_name,
    // คำพรเป็นของผู้ถวาย — ไม่เผยแพร่ให้คนอื่นทั้งวัด
    blessing: mine ? row.blessing : null,
    lantern_slot: Number(row.lantern_slot),
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    is_mine: mine,
  };
}

type ListRow = LanternRow & { hour_balance: number | null };

export async function getShrineDedicationLanterns(userId: string) {
  const rows = await q<{
    hour_balance: number;
    lantern: LanternRow | null;
  }>(
    `WITH account AS (
       SELECT hour_balance
         FROM users
        WHERE id=$1 AND deleted_at IS NULL
     ),
     community AS (
       SELECT id,user_id,dedication_name,blessing,charged_yam,balance_after,
              idempotency_key,lantern_slot,starts_at,expires_at
         FROM shrine_dedication_lanterns
        WHERE expires_at > now()
        ORDER BY starts_at DESC, id DESC
        LIMIT $2
     ),
     mine AS (
       SELECT id,user_id,dedication_name,blessing,charged_yam,balance_after,
              idempotency_key,lantern_slot,starts_at,expires_at
         FROM shrine_dedication_lanterns
        WHERE user_id=$1 AND expires_at > now()
     ),
     visible AS (
       SELECT DISTINCT ON (id) *
         FROM (SELECT * FROM community UNION ALL SELECT * FROM mine) AS merged
        ORDER BY id
     )
     SELECT account.hour_balance,
            row_to_json(visible.*) AS lantern
       FROM account
       LEFT JOIN visible ON TRUE`,
    [userId, DEDICATION_LANTERN_COMMUNITY_LIST_LIMIT],
  );
  const account = rows[0];
  if (!account) return null;
  const lanterns = rows
    .flatMap((row) => (row.lantern ? [row.lantern] : []))
    .sort((a, b) => (
      a.starts_at === b.starts_at
        ? (a.id < b.id ? 1 : -1)
        : (a.starts_at < b.starts_at ? 1 : -1)
    ));
  return {
    ok: true as const,
    cost_yam: DEDICATION_LANTERN_COST_YAM,
    duration_days: DEDICATION_LANTERN_DURATION_DAYS,
    max_active_per_user: DEDICATION_LANTERN_ACTIVE_LIMIT_PER_USER,
    name_max_chars: DEDICATION_NAME_MAX_CHARS,
    blessing_max_chars: DEDICATION_BLESSING_MAX_CHARS,
    balance_yam: Number(account.hour_balance) || 0,
    server_time: new Date().toISOString(),
    lanterns: lanterns.map((row) => publicLantern(row, userId)),
  };
}

export async function dedicateShrineLantern(userId: string, input: ShrineDedicationInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`shrine-lantern:${userId}:${input.idempotencyKey}`],
    );
    const existing = await client.query<LanternRow>(
      `SELECT id,user_id,dedication_name,blessing,charged_yam,balance_after,
              idempotency_key,lantern_slot,starts_at,expires_at
         FROM shrine_dedication_lanterns
        WHERE user_id=$1 AND idempotency_key=$2
        LIMIT 1`,
      [userId, input.idempotencyKey],
    );
    const prior = existing.rows[0];
    if (prior) {
      if (
        prior.dedication_name !== input.dedicationName
        || prior.blessing !== input.blessing
      ) {
        await client.query("ROLLBACK");
        return { ok: false as const, error: "idempotency_conflict", status: 409 };
      }
      const balance = await client.query<{ hour_balance: number }>(
        `SELECT hour_balance FROM users WHERE id=$1 AND deleted_at IS NULL`,
        [userId],
      );
      if (!balance.rows[0]) {
        await client.query("ROLLBACK");
        return { ok: false as const, error: "account_not_available", status: 404 };
      }
      await client.query("COMMIT");
      return {
        ok: true as const,
        existing: true,
        charged_yam: Number(prior.charged_yam),
        balance_after: Number(balance.rows[0].hour_balance),
        lantern: publicLantern(prior, userId),
      };
    }

    // slot ทั้งวัดต้อง serialize ไม่งั้นสองคนถวายพร้อมกันได้ราวเดียวกัน
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      ["shrine-lantern-slots"],
    );
    const active = await client.query<{ mine: number; slots: number[] | null }>(
      `SELECT COUNT(*) FILTER (WHERE user_id=$1)::int AS mine,
              array_agg(lantern_slot) AS slots
         FROM shrine_dedication_lanterns
        WHERE expires_at > now()`,
      [userId],
    );
    const mineActive = Number(active.rows[0]?.mine) || 0;
    if (mineActive >= DEDICATION_LANTERN_ACTIVE_LIMIT_PER_USER) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "lantern_limit_reached",
        status: 409,
        max_active_per_user: DEDICATION_LANTERN_ACTIVE_LIMIT_PER_USER,
      };
    }
    const usedSlots = new Set((active.rows[0]?.slots ?? []).map(Number));
    let slot = 0;
    while (usedSlots.has(slot)) slot += 1;

    const updated = await client.query<{ hour_balance: number }>(
      `UPDATE users
          SET hour_balance=hour_balance-$2
        WHERE id=$1 AND deleted_at IS NULL AND hour_balance >= $2
        RETURNING hour_balance`,
      [userId, DEDICATION_LANTERN_COST_YAM],
    );
    if (!updated.rows[0]) {
      const account = await client.query<{ hour_balance: number }>(
        `SELECT hour_balance FROM users WHERE id=$1 AND deleted_at IS NULL`,
        [userId],
      );
      await client.query("ROLLBACK");
      if (!account.rows[0]) {
        return { ok: false as const, error: "account_not_available", status: 404 };
      }
      return {
        ok: false as const,
        error: "insufficient_yam",
        status: 402,
        required_yam: DEDICATION_LANTERN_COST_YAM,
        balance_yam: Number(account.rows[0].hour_balance) || 0,
      };
    }

    const lanternId = randomUUID();
    const balanceAfter = Number(updated.rows[0].hour_balance);
    const inserted = await client.query<LanternRow>(
      `INSERT INTO shrine_dedication_lanterns
       (id,user_id,dedication_name,blessing,charged_yam,balance_after,
        idempotency_key,lantern_slot,starts_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now() + make_interval(days => $9))
       RETURNING id,user_id,dedication_name,blessing,charged_yam,balance_after,
                 idempotency_key,lantern_slot,starts_at,expires_at`,
      [
        lanternId,
        userId,
        input.dedicationName,
        input.blessing,
        DEDICATION_LANTERN_COST_YAM,
        balanceAfter,
        input.idempotencyKey,
        slot,
        DEDICATION_LANTERN_DURATION_DAYS,
      ],
    );
    await client.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,$2,'spend_shrine_dedication_lantern',$3,'shrine',$4,$5)`,
      [
        userId,
        -DEDICATION_LANTERN_COST_YAM,
        balanceAfter,
        `shrine_lantern:${lanternId}`,
        JSON.stringify({
          lanternId,
          slot,
          durationDays: DEDICATION_LANTERN_DURATION_DAYS,
        }),
      ],
    );
    await client.query("COMMIT");
    return {
      ok: true as const,
      existing: false,
      charged_yam: DEDICATION_LANTERN_COST_YAM,
      balance_after: balanceAfter,
      lantern: publicLantern(inserted.rows[0], userId),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}
