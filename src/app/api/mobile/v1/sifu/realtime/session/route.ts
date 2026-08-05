/**
 * POST /api/mobile/v1/sifu/realtime/session · ห้องคุยสดซินแส (4 ส.ค. 2569)
 *
 * เปิด session OpenAI Realtime โดย instructions = prompt+packet ชุดเดียวกับ
 * ซินแสพิมพ์เป๊ะ (ดึงจาก /api/sifu promptOnly · internal trusted) + กติกาเสียง
 * คิดยาม 2 ยาม/นาที ปัดขึ้น · ตัดก่อนเปิด · คืนอัตโนมัติถ้าเปิดไม่สำเร็จ
 */
import { createHash, randomUUID } from "node:crypto";
import { mobileBearerToken, validateMobileBearerToken } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { q, q1 } from "@/lib/db";
import {
  createSifuRealtimeSessionHandler,
  type SifuRealtimeChargeResult,
  type SifuRealtimePromptResult,
} from "@/lib/sifu-realtime-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ข้อความเปิดห้อง — เป็นแค่ค่าในช่อง {{MESSAGE}} ของ prompt เดิม (คำถามแรกมาทางเสียงสด)
 * ไม่ใช่การแก้ prompt: โครง sifu-qa.md + packet + คัมภีร์ ประกอบใน /api/sifu ที่เดียว */
const VOICE_OPENER =
  "(เปิดห้องคุยเสียงสดกับซินแส — ผู้ใช้จะเริ่มถามด้วยเสียงหลังจากนี้ ให้ทักทายสั้น ๆ แล้วรอคำถาม)";

function sifuInternalToken(): string | null {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}

async function fetchSifuVoicePrompt(input: {
  bearer: string;
  profileId: string;
  locale: string;
  request: Request;
}): Promise<SifuRealtimePromptResult> {
  const token = sifuInternalToken();
  if (!token) return { error: "sifu_prompt_unavailable", ok: false, status: 503 };
  const origin = internalAppOrigin(input.request);
  /* SIFU_REALTIME_PROMPT_MODEL (optional): ไม่ตั้ง = ชุด default เดียวกับซินแสพิมพ์
   * ตั้ง grok-cli/codex-cli = ชุด compact ของ production (packet เต็มเหมือนกัน · คัมภีร์ tier เล็กลง)
   * ใช้เมื่อ instructions ชนเพดาน context ของโมเดลเสียง */
  const promptModel = String(process.env.SIFU_REALTIME_PROMPT_MODEL || "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const upstream = await fetch(new URL("/api/sifu", origin), {
      body: JSON.stringify({
        lang: input.locale,
        message: VOICE_OPENER,
        ...(promptModel ? { model: promptModel } : {}),
        noCache: true,
        profileId: input.profileId,
        promptOnly: true,
      }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Cookie: `decode_auth=${encodeURIComponent(input.bearer)}`,
        "X-Sifu-Fusion": "1",
        "X-Sifu-Fusion-Token": token,
      },
      method: "POST",
      signal: controller.signal,
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok || data.prompt_only !== true || typeof data.prompt !== "string" || !data.prompt) {
      const code = typeof data.error === "string" && data.error ? data.error : "sifu_prompt_unavailable";
      const status = upstream.status === 404 || upstream.status === 400 || upstream.status === 403
        ? upstream.status
        : 502;
      return { error: code === "profile_context_unlocked" ? code : "sifu_prompt_unavailable", ok: false, status };
    }
    return {
      expectedDm: typeof data.expected_dm === "string" ? data.expected_dm : null,
      model: String(data.model || ""),
      ok: true,
      prompt: data.prompt,
    };
  } catch {
    return { error: "sifu_prompt_unavailable", ok: false, status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

/* ตัดยาม atomic + append hour_transactions — pattern เดียวกับ /api/account/spend
 * ref_payment_id unique (uq_hour_tx_ref_payment) = ธุรกรรมตามรอย/คืนได้เป็นรายใบ */
async function chargeYamForRealtime(input: {
  userId: string;
  amount: number;
  minutes: number;
  conversationId: string;
}): Promise<SifuRealtimeChargeResult> {
  /*
   * 🔴 5 ส.ค. 69 อุดยามรั่ว: สายหลุดแล้วแอพต่อใหม่เงียบๆ ใน conversationId
   * เดิม — ถ้าจ่ายไปแล้วใน 12 นาที (จองสูงสุด 10 นาที + เผื่อ) ไม่ตัดซ้ำ
   * (เจ้าของโดน 7 ใบใน 27 วิ = 70 ยาม ก่อนแก้) · โทรใหม่เอง = id ใหม่ = คิดปกติ
   */
  if (input.conversationId) {
    const paid = await q1<{ ref_payment_id: string }>(
      `SELECT ref_payment_id FROM hour_transactions
        WHERE user_id=$1 AND reason='spend_sifu_realtime'
          AND note LIKE '%' || $2 || '%'
          AND created_at > now() - interval '12 minutes'
        ORDER BY created_at DESC LIMIT 1`,
      [input.userId, input.conversationId],
    );
    if (paid) {
      const current = await q1<{ hour_balance: number }>(
        `SELECT COALESCE(hour_balance,0) AS hour_balance FROM users WHERE id=$1`,
        [input.userId],
      );
      return {
        balanceAfter: Number(current?.hour_balance ?? 0),
        ok: true,
        ref: paid.ref_payment_id,
      };
    }
  }
  const ref = `sifu_rt:${randomUUID()}`;
  const row = await q1<{ hour_balance: number }>(
    `UPDATE users SET hour_balance = COALESCE(hour_balance,0) - $2
       WHERE id=$1 AND COALESCE(hour_balance,0) >= $2 RETURNING hour_balance`,
    [input.userId, input.amount],
  );
  if (!row) {
    const current = await q1<{ hour_balance: number }>(
      `SELECT COALESCE(hour_balance,0) AS hour_balance FROM users WHERE id=$1`,
      [input.userId],
    );
    return { balance: Number(current?.hour_balance ?? 0), ok: false };
  }
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_payment_id, ref_feature, note)
       VALUES ($1,$2,'spend_sifu_realtime',$3,$4,'sifu_realtime',$5)`,
    [
      input.userId,
      -input.amount,
      Number(row.hour_balance),
      ref,
      `voice session ${input.minutes} min @ 2 yam/min ${input.conversationId}`.trim(),
    ],
  );
  return { balanceAfter: Number(row.hour_balance), ok: true, ref };
}

async function refundYamForRealtime(input: {
  userId: string;
  amount: number;
  ref: string;
}): Promise<void> {
  const row = await q1<{ hour_balance: number }>(
    `UPDATE users SET hour_balance = COALESCE(hour_balance,0) + $2
       WHERE id=$1 RETURNING hour_balance`,
    [input.userId, input.amount],
  );
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_payment_id, ref_feature, note)
       VALUES ($1,$2,'refund_sifu_realtime',$3,$4,'sifu_realtime','voice session open failed · auto refund')`,
    [
      input.userId,
      input.amount,
      Number(row?.hour_balance ?? 0),
      input.ref ? `${input.ref}_refund` : null,
    ],
  );
}

const handler = createSifuRealtimeSessionHandler({
  bearerToken: mobileBearerToken,
  buildSifuVoicePrompt: (input) => fetchSifuVoicePrompt({
    bearer: input.bearer,
    locale: input.locale,
    profileId: input.profileId,
    request: input.request,
  }),
  chargeYam: chargeYamForRealtime,
  clientIp,
  fetch: (url, init) => globalThis.fetch(url, init),
  nowSeconds: () => Math.floor(Date.now() / 1_000),
  openAiApiKey: () => process.env.OPENAI_API_KEY ?? "",
  providerTimeoutMs: 10_000,
  rateLimit,
  refundYam: refundYamForRealtime,
  validateBearer: async (token) => {
    const session = await validateMobileBearerToken(token);
    return session
      ? { orgId: session.orgId ?? null, userId: session.userId }
      : null;
  },
  voice: () => String(process.env.SIFU_REALTIME_VOICE || "").trim() || "ash",
});

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
