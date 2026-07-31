/**
 * ตัวส่งกลางของแจ้งเตือนมือถือ — ส่งตรงถึงกูเกิล ไม่ผ่านคนกลาง
 *
 * ── ทำไมต้องเปลี่ยน (30 ก.ค. 69) ───────────────────────────
 * ตัวยิงอัตโนมัติ 4 ตัวส่งผ่านบริการกลางของ Expo มาตลอด
 * บันทึกจริงที่ /var/log/mobile-yam-push.log: **480 รอบ ได้ expo_ok=0 ทุกรอบ**
 * ไม่มีรอบไหนสำเร็จเลยสักครั้ง เพราะบริการกลางต้องเอากุญแจโครงการ
 * ไปฝากไว้ที่นั่นอีกที ซึ่งเราไม่เคยทำ (ยืนยันด้วย InvalidCredentials)
 *
 * ท่อส่งตรง `fcm-direct.ts` เขียนไว้ตั้งแต่เช้าวันเดียวกันและ
 * **พิสูจน์แล้วว่าถึงเครื่องจริง** (เจ้าของยืนยัน "เห็นแล้ว เด้งขึ้นมาเลย")
 * แต่ไม่มีตัวยิงไหนเรียกใช้เลย — มีแต่สคริปต์ทดสอบมือ
 *
 * ── ทำไมทำเป็นตัวกลาง ──────────────────────────────────────
 * ตัวยิง 4 ตัวเคยเขียนตัวส่งของตัวเองคนละแบบ
 * ผลคือแก้ที่เดียวไม่พอ ต้องไล่แก้ 4 ที่ทุกครั้ง และมันไม่เคยตรงกัน
 *
 * 🔴 ห้ามล้มเงียบ — ทุกใบต้องรู้ผลว่าถึงหรือไม่ถึง เพราะอะไร
 */

const { createSign } = require("node:crypto");
const { readFileSync } = require("node:fs");

/** กุญแจอยู่นอกโปรเจกต์ สิทธิ์อ่านเฉพาะเจ้าของเครื่อง — ห้ามย้ายเข้า git */
const KEY_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH
  ?? "/root/secrets/hourkey-fcm-service-account.json";

/** ขอตั๋วใหม่ก่อนหมดอายุจริงเท่านี้ กันนาฬิกาสองฝั่งไม่ตรงกันเป๊ะ */
const TICKET_SAFETY_SECONDS = 300;

let cachedKey = null;
let cachedTicket = null;

function loadKey() {
  if (cachedKey !== null) return cachedKey;
  try {
    const parsed = JSON.parse(readFileSync(KEY_PATH, "utf8"));
    if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
      console.error("[push-send] ไฟล์กุญแจไม่ครบ");
      return null;
    }
    cachedKey = parsed;
    return parsed;
  } catch (error) {
    // 🔴 ห้ามเงียบ — ไม่มีกุญแจแล้วไม่มีใครรู้ คือบั๊กที่ไล่ไม่เจอ
    console.error("[push-send] อ่านไฟล์กุญแจไม่ได้", String(error?.message ?? error));
    return null;
  }
}

/** พร้อมส่งไหม — ให้ตัวเรียกตัดสินใจก่อนเริ่มงาน */
function isReady() {
  return loadKey() !== null;
}

async function getTicket() {
  const key = loadKey();
  if (key === null) return null;

  const now = Date.now();
  if (cachedTicket !== null && cachedTicket.expiresAtMs > now) return cachedTicket.token;

  const issuedAt = Math.floor(now / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: key.token_uri,
    exp: issuedAt + 3600,
    iat: issuedAt,
  })).toString("base64url");

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
    const data = await response.json();
    if (typeof data.access_token !== "string") {
      console.error("[push-send] ขอตั๋วไม่สำเร็จ", data.error_description ?? "");
      return null;
    }
    const lifetime = (data.expires_in ?? 3600) - TICKET_SAFETY_SECONDS;
    cachedTicket = { token: data.access_token, expiresAtMs: now + Math.max(60, lifetime) * 1000 };
    return cachedTicket.token;
  } catch (error) {
    console.error("[push-send] ขอตั๋วล้ม", String(error?.message ?? error));
    return null;
  }
}

/**
 * ส่งหนึ่งใบไปหนึ่งเครื่อง
 *
 * แยก "เครื่องไม่รับแล้ว" ออกจาก "ส่งไม่สำเร็จ" โดยตั้งใจ
 * อย่างแรกต้องลบกุญแจเครื่องทิ้ง อย่างหลังลองใหม่ได้
 * เหมารวมกัน = ลบกุญแจดีทิ้งเพราะเน็ตสะดุดครั้งเดียว
 */
async function sendOne(deviceToken, message) {
  const key = loadKey();
  if (key === null) return { kind: "failed", reason: "no_service_account" };
  const ticket = await getTicket();
  if (ticket === null) return { kind: "failed", reason: "no_ticket" };

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ticket}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: message.title, body: message.body },
            data: message.url ? { url: String(message.url) } : {},
            android: {
              priority: "HIGH",
              notification: { sound: "default", channel_id: "default" },
            },
          },
        }),
      },
    );
    if (response.ok) return { kind: "sent" };

    const detail = (await response.text()).slice(0, 300);
    const gone = response.status === 404
      || detail.includes("UNREGISTERED")
      || detail.includes("INVALID_ARGUMENT");
    console.error(`[push-send] ส่งไม่สำเร็จ ${response.status}`, detail);
    return gone
      ? { kind: "gone", reason: String(response.status) }
      : { kind: "failed", reason: String(response.status) };
  } catch (error) {
    return { kind: "failed", reason: String(error?.message ?? error) };
  }
}

/**
 * ส่งทั้งชุด — ตัวยิงทุกตัวเรียกตัวนี้
 *
 * @param {Array<{deviceToken:string, userId?:string, title:string, body:string, url?:string}>} items
 * @param {{db?:object, dry?:boolean}} [options] ส่ง db มาด้วยจะลบกุญแจที่ตายให้เอง
 * @returns {Promise<{sent:number, failed:number, gone:number, noToken:number}>}
 */
async function sendAll(items, options) {
  const list = Array.isArray(items) ? items : [];
  const result = { sent: 0, failed: 0, gone: 0, noToken: 0 };
  if (list.length === 0) return result;

  const db = options?.db ?? null;
  const dry = options?.dry === true;

  for (const item of list) {
    const token = String(item?.deviceToken || "").trim();
    if (token === "") {
      // 🔴 เครื่องที่ยังไม่มีกุญแจแบบส่งตรง — ต้องนับ ไม่ใช่เงียบ
      // ผู้ใช้ที่ยังไม่ได้ลงแอพรุ่นใหม่จะอยู่กลุ่มนี้ ต้องเห็นตัวเลข
      result.noToken += 1;
      continue;
    }
    if (dry) { result.sent += 1; continue; }

    const outcome = await sendOne(token, item);
    if (outcome.kind === "sent") { result.sent += 1; continue; }
    if (outcome.kind === "gone") {
      result.gone += 1;
      // เครื่องนี้ไม่รับแล้ว (ถอนแอพ/กุญแจหมดอายุ) — ลบทิ้ง ไม่งั้นจะยิงไปเรื่อยๆ
      if (db !== null) {
        await db.query(
          `UPDATE mobile_push_tokens SET enabled = false WHERE device_push_token = $1`,
          [token],
        ).catch((e) => console.error("[push-send] ปิดกุญแจที่ตายไม่สำเร็จ", e.message));
      }
      continue;
    }
    result.failed += 1;
  }
  return result;
}

module.exports = { isReady, sendOne, sendAll, KEY_PATH };
