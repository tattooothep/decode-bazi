/**
 * ส่งแจ้งเตือนตรงไปบริการของกูเกิล ไม่ผ่านคนกลาง
 *
 * ── ทำไมไม่ผ่านคนกลาง ──────────────────────────────────────
 * 30 ก.ค. เจ้าของแจ้งว่าแอพไม่เคยส่งแจ้งเตือนเลยสักครั้ง
 * ตรวจแล้วพบสองเรื่องซ้อนกัน
 *   ① ไฟล์แอพไม่มีกุญแจโครงการ ตัวขอกุญแจเครื่องจึงล้มตั้งแต่บรรทัดแรก
 *   ② เซิร์ฟเวอร์ส่งผ่านบริการกลางของ Expo ซึ่งต้องเอากุญแจไปฝากไว้ที่นั่นอีกที
 *
 * ข้อ ① แก้ด้วยการใส่ไฟล์กุญแจในแอพแล้ว
 * ข้อ ② เลือกส่งตรงแทน เพราะเราคุมเองได้ทั้งเส้น ไม่ต้องพึ่งบัญชีของใคร
 * และไม่ต้องรอให้บริการกลางของคนอื่นทำงาน
 *
 * ── กุญแจอยู่ไหน ───────────────────────────────────────────
 * 🔴 อยู่นอกโปรเจกต์ ที่ /root/secrets/ สิทธิ์อ่านเฉพาะเจ้าของเครื่อง
 * ห้ามย้ายเข้าโปรเจกต์ ห้ามเข้า git ห้ามใส่ในแอพเด็ดขาด
 * ใครได้กุญแจนี้ไป ส่งแจ้งเตือนในนามแอพเราได้ทันที
 *
 * ── ตั๋วมีอายุ ─────────────────────────────────────────────
 * กูเกิลให้ตั๋วครั้งละหนึ่งชั่วโมง เก็บไว้ใช้ซ้ำจนใกล้หมดอายุ
 * ขอใหม่ทุกครั้งที่ส่ง = ช้าและโดนจำกัดจำนวนครั้งโดยไม่จำเป็น
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const KEY_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH
  ?? "/root/secrets/hourkey-fcm-service-account.json";

/** ขอตั๋วใหม่ก่อนหมดอายุจริงเท่านี้ กันกรณีนาฬิกาสองฝั่งไม่ตรงกันเป๊ะ */
const TICKET_SAFETY_SECONDS = 300;

type ServiceAccount = Readonly<{
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
}>;

let cachedKey: ServiceAccount | null = null;
let cachedTicket: { token: string; expiresAtMs: number } | null = null;

function loadKey(): ServiceAccount | null {
  if (cachedKey !== null) return cachedKey;
  try {
    const raw = readFileSync(KEY_PATH, "utf8");
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
      console.error("[fcm] ไฟล์กุญแจไม่ครบ");
      return null;
    }
    cachedKey = parsed;
    return parsed;
  } catch (error) {
    // 🔴 ห้ามเงียบ — ไม่มีกุญแจแล้วไม่มีใครรู้ คือบั๊กที่ไล่ไม่เจอ
    console.error(
      "[fcm] อ่านไฟล์กุญแจไม่ได้",
      String((error as Error)?.message ?? error),
    );
    return null;
  }
}

/** มีกุญแจพร้อมส่งไหม — ให้ตัวเรียกตัดสินใจก่อนเริ่มงาน */
export function isFcmReady(): boolean {
  return loadKey() !== null;
}

/** ขอตั๋วจากกูเกิล (ใช้ซ้ำจนใกล้หมดอายุ) */
async function getTicket(): Promise<string | null> {
  const key = loadKey();
  if (key === null) return null;

  const now = Date.now();
  if (cachedTicket !== null && cachedTicket.expiresAtMs > now) {
    return cachedTicket.token;
  }

  const issuedAt = Math.floor(now / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: key.token_uri,
      exp: issuedAt + 3600,
      iat: issuedAt,
    }),
  ).toString("base64url");

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(key.private_key).toString("base64url");

  try {
    const response = await fetch(key.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claim}.${signature}`,
      }),
    });
    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (typeof data.access_token !== "string") {
      console.error("[fcm] ขอตั๋วไม่สำเร็จ");
      return null;
    }
    const lifetime = (data.expires_in ?? 3600) - TICKET_SAFETY_SECONDS;
    cachedTicket = {
      token: data.access_token,
      expiresAtMs: now + Math.max(60, lifetime) * 1000,
    };
    return cachedTicket.token;
  } catch (error) {
    console.error("[fcm] ขอตั๋วล้ม");
    return null;
  }
}

export type FcmSendResult =
  | { kind: "provider_accepted"; provider: "fcm"; providerMessageId: string }
  /** เครื่องนี้ไม่รับแล้ว (ถอนแอพ/กุญแจหมดอายุ) — ตัวเรียกควรลบทิ้ง */
  | { kind: "gone"; provider: "fcm"; reason: string; retryable: false }
  | { kind: "failed"; provider: "fcm"; reason: string; retryable: true };

/**
 * ส่งหนึ่งข้อความไปหาหนึ่งเครื่อง
 *
 * แยก "เครื่องไม่รับแล้ว" ออกจาก "ส่งไม่สำเร็จ" โดยตั้งใจ
 * อย่างแรกต้องลบกุญแจเครื่องทิ้ง อย่างหลังลองใหม่ได้
 * ถ้าเหมารวมกัน จะลบกุญแจดีทิ้งเพราะเน็ตสะดุดครั้งเดียว
 */
export async function sendFcmToDevice(
  deviceToken: string,
  message: Readonly<{ title: string; body: string; url?: string }>,
): Promise<FcmSendResult> {
  const key = loadKey();
  if (key === null) return { kind: "failed", provider: "fcm", reason: "no_service_account", retryable: true };
  const ticket = await getTicket();
  if (ticket === null) return { kind: "failed", provider: "fcm", reason: "no_ticket", retryable: true };

  const endpoint =
    `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ticket}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: message.title, body: message.body },
          // ข้อมูลแนบ — แอพใช้พาผู้ใช้ไปหน้าที่เกี่ยวข้องเมื่อกดที่การแจ้งเตือน
          data: message.url ? { url: message.url } : {},
          android: {
            priority: "HIGH",
            notification: { sound: "default", channel_id: "default" },
          },
        },
      }),
    });

    if (response.ok) {
      const payload = await response.json().catch(() => ({})) as { name?: unknown };
      const providerMessageId = typeof payload.name === "string" ? payload.name.trim() : "";
      return providerMessageId
        ? { kind: "provider_accepted", provider: "fcm", providerMessageId }
        : { kind: "failed", provider: "fcm", reason: "fcm_missing_message_name", retryable: true };
    }

    const detail = (await response.text()).slice(0, 300);
    // 404/400 ที่บอกว่ากุญแจใช้ไม่ได้ = เครื่องนี้ไม่รับแล้ว ต้องลบทิ้ง
    const gone = response.status === 404
      || detail.includes("UNREGISTERED")
      || detail.includes("INVALID_ARGUMENT");
    console.error(`[fcm] ส่งไม่สำเร็จ ${response.status}`);
    return gone
      ? { kind: "gone", provider: "fcm", reason: `fcm_${response.status}`, retryable: false }
      : { kind: "failed", provider: "fcm", reason: `fcm_${response.status}`, retryable: true };
  } catch (error) {
    return {
      kind: "failed", provider: "fcm", reason: "fcm_transport_error", retryable: true,
    };
  }
}
