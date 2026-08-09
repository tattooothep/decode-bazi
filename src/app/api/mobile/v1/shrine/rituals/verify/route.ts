import { q1 } from "@/lib/db";
import { guardShrineRequest, shrineJson } from "@/lib/shrine-route-guard";
import { deriveJiaobeiOutcome } from "@/lib/shrine-jiaobei";
import {
  QIAN_DRAW_ALGO,
  QIAN_PERMIT_ALGO,
  deriveQianSlipNo,
} from "@/lib/shrine-qian";

/**
 * ตรวจย้อนผลสุ่มของตัวเอง — คำนวณใหม่จากเมล็ดสุ่มที่เก็บไว้แล้วเทียบกับผลที่บันทึก
 * ต้องเป็นรายการของผู้ที่ล็อกอินอยู่เท่านั้น (มี user_id ในเงื่อนไขทุกคำสั่ง)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(req: Request) {
  const guard = await guardShrineRequest(req, {
    scope: "ritual-verify",
    perIp: 120,
    perBearer: 60,
    perUser: 60,
  });
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "";
  const id = url.searchParams.get("id") || "";
  if (!UUID_PATTERN.test(id)) {
    return shrineJson({ ok: false, error: "invalid_id" }, 400);
  }

  if (kind === "jiaobei" || kind === "qian_permit") {
    const table =
      kind === "jiaobei" ? "shrine_jiaobei_casts" : "shrine_qian_permit_casts";
    const row = await q1<{
      server_seed: string;
      client_nonce: string;
      outcome: string;
      face_left: string;
      face_right: string;
    }>(
      `SELECT server_seed, client_nonce, outcome, face_left, face_right
         FROM ${table} WHERE id = $1 AND user_id = $2`,
      [id, guard.userId],
    );
    if (!row) return shrineJson({ ok: false, error: "not_found" }, 404);
    const recomputed = deriveJiaobeiOutcome(row.server_seed, row.client_nonce);
    const match =
      recomputed.outcome === row.outcome &&
      recomputed.faceLeft === row.face_left &&
      recomputed.faceRight === row.face_right;
    return shrineJson({
      ok: true,
      kind,
      match,
      stored: {
        outcome: row.outcome,
        faces: { left: row.face_left, right: row.face_right },
      },
      recomputed: {
        outcome: recomputed.outcome,
        faces: { left: recomputed.faceLeft, right: recomputed.faceRight },
      },
      verify: {
        serverSeed: row.server_seed,
        clientNonce: row.client_nonce,
        algo: QIAN_PERMIT_ALGO,
      },
      message: match
        ? {
            th: "ตรวจแล้วตรงกัน — ผลนี้คำนวณจากเมล็ดสุ่มที่เก็บไว้ก่อนแสดงผล ไม่ได้แก้ทีหลัง",
            en: "Verified — the result recomputes exactly from the stored seed; nothing was changed after the fact.",
            zh: "驗證相符——結果由存檔隨機種子重算所得,事後未曾更動。",
          }
        : {
            th: "ตรวจแล้วไม่ตรง — แจ้งทีมงานทันที อย่าเพิ่งเชื่อผลนี้",
            en: "Mismatch — report this to the team; do not trust this result.",
            zh: "驗證不符——請即回報,勿採信此結果。",
          },
    });
  }

  if (kind === "qian_draw") {
    const row = await q1<{
      server_seed: string;
      client_nonce: string;
      slip_no: number;
    }>(
      `SELECT server_seed, client_nonce, slip_no
         FROM shrine_qian_draws WHERE id = $1 AND user_id = $2`,
      [id, guard.userId],
    );
    if (!row) return shrineJson({ ok: false, error: "not_found" }, 404);
    const recomputed = deriveQianSlipNo(row.server_seed, row.client_nonce);
    const match = recomputed === row.slip_no;
    return shrineJson({
      ok: true,
      kind,
      match,
      stored: { slipNo: row.slip_no },
      recomputed: { slipNo: recomputed },
      verify: {
        serverSeed: row.server_seed,
        clientNonce: row.client_nonce,
        algo: QIAN_DRAW_ALGO,
      },
      message: match
        ? {
            th: "ตรวจแล้วตรงกัน — เลขใบนี้คำนวณจากเมล็ดสุ่มที่เก็บไว้ ไม่ได้เลือกให้",
            en: "Verified — this slip number recomputes from the stored seed; it was not hand-picked.",
            zh: "驗證相符——籤號由存檔種子重算所得,非人為指定。",
          }
        : {
            th: "ตรวจแล้วไม่ตรง — แจ้งทีมงานทันที",
            en: "Mismatch — report this to the team immediately.",
            zh: "驗證不符——請即回報。",
          },
    });
  }

  if (kind === "bell" || kind === "drum" || kind === "muyu") {
    const row = await q1<{ strikes: number; day_total: number; local_day: string }>(
      `SELECT strikes, day_total, local_day
         FROM shrine_ritual_strikes
        WHERE id = $1 AND user_id = $2 AND ritual = $3`,
      [id, guard.userId, kind],
    );
    if (!row) return shrineJson({ ok: false, error: "not_found" }, 404);
    return shrineJson({
      ok: true,
      kind,
      match: true,
      stored: { strikes: row.strikes, dayTotal: row.day_total, localDay: row.local_day },
      verify: {
        random: false,
        rule: "day_total = sum(strikes) within the same local day",
      },
      message: {
        th: "พิธีนี้ไม่มีการสุ่ม ผลคือการบวกจำนวนครั้งตรง ๆ จึงตรวจซ้ำได้เองทันที",
        en: "No randomness here — the result is a plain sum of strikes, so you can recheck it yourself.",
        zh: "此禮無隨機,結果為響數直接相加,可自行覆核。",
      },
    });
  }

  return shrineJson({ ok: false, error: "invalid_kind" }, 400);
}
