/** Provider-aware mobile push transport used by every scheduled notification. */
const { createSign } = require("node:crypto");
const { readFileSync } = require("node:fs");

const KEY_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH
  ?? "/root/secrets/hourkey-fcm-service-account.json";
const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const TICKET_SAFETY_SECONDS = 300;
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 10;

let cachedKey = null;
let cachedTicket = null;

function loadKey() {
  if (cachedKey !== null) return cachedKey;
  try {
    const parsed = JSON.parse(readFileSync(KEY_PATH, "utf8"));
    if (!parsed.private_key || !parsed.client_email || !parsed.project_id || !parsed.token_uri) {
      console.error("[push-send] ไฟล์กุญแจไม่ครบ");
      return null;
    }
    cachedKey = parsed;
    return parsed;
  } catch (error) {
    console.error("[push-send] อ่านไฟล์กุญแจไม่ได้", String(error?.message ?? error));
    return null;
  }
}

function isReady() {
  return loadKey() !== null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUrl(raw) {
  const value = String(raw || "/today").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/today";
  return value.slice(0, 300);
}

function categoryOf(message) {
  const value = String(message?.category || "daily").trim();
  return ["security", "saved_date", "daily", "yam", "qimen", "shrine", "goal", "service"].includes(value)
    ? value
    : "daily";
}

function channelOf(category) {
  if (category === "security") return "hourkey-security";
  if (category === "service") return "hourkey-service";
  return "hourkey-reminders";
}

function stringData(message) {
  const data = message?.data && typeof message.data === "object" ? message.data : {};
  const out = {
    categoryId: "hourkey_daily",
    category: categoryOf(message),
    url: safeUrl(message?.url || data.url),
  };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || key === "url") continue;
    out[String(key).slice(0, 80)] = String(value).slice(0, 500);
  }
  return out;
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
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => ({}));
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

async function sendFcmOnce(deviceToken, message) {
  const key = loadKey();
  if (key === null) return { kind: "failed", reason: "no_service_account", retryable: true };
  const ticket = await getTicket();
  if (ticket === null) return { kind: "failed", reason: "no_ticket", retryable: true };
  const category = categoryOf(message);
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ticket}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: {
              title: String(message?.title || "Hourkey").slice(0, 120),
              body: String(message?.body || "").slice(0, 400),
            },
            data: stringData(message),
            android: {
              priority: category === "security" || category === "service" ? "HIGH" : "NORMAL",
              ttl: category === "security" || category === "service" ? "21600s" : "86400s",
              notification: {
                sound: category === "security" || category === "service" ? "default" : undefined,
                channel_id: channelOf(category),
              },
            },
          },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (response.ok) return { kind: "sent", provider: "fcm" };
    const detail = (await response.text()).slice(0, 500);
    const gone = response.status === 404 || detail.includes("UNREGISTERED");
    const retryable = TRANSIENT_HTTP.has(response.status);
    console.error(`[push-send] FCM ${response.status}`, detail);
    return gone
      ? { kind: "gone", provider: "fcm", reason: String(response.status), retryable: false }
      : { kind: "failed", provider: "fcm", reason: `fcm_${response.status}`, retryable };
  } catch (error) {
    return { kind: "failed", provider: "fcm", reason: String(error?.message ?? error), retryable: true };
  }
}

async function sendOne(deviceToken, message) {
  let outcome = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    outcome = await sendFcmOnce(deviceToken, message);
    if (outcome.kind !== "failed" || outcome.retryable !== true || attempt === MAX_ATTEMPTS) return outcome;
    await wait(250 * (2 ** (attempt - 1)));
  }
  return outcome || { kind: "failed", provider: "fcm", reason: "unknown", retryable: true };
}

function expoHeaders() {
  const accessToken = String(process.env.EXPO_PUSH_ACCESS_TOKEN || "").trim();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function sendExpoOnce(expoToken, message, db, tokenId) {
  const category = categoryOf(message);
  try {
    const response = await fetch(EXPO_SEND_URL, {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify({
        to: expoToken,
        title: String(message?.title || "Hourkey").slice(0, 120),
        body: String(message?.body || "").slice(0, 400),
        data: stringData(message),
        sound: category === "security" || category === "service" ? "default" : null,
        priority: category === "security" || category === "service" ? "high" : "normal",
        ttl: category === "security" || category === "service" ? 21_600 : 86_400,
        channelId: channelOf(category),
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      return { kind: "failed", provider: "expo", reason: `expo_${response.status}:${detail}`, retryable: TRANSIENT_HTTP.has(response.status) };
    }
    const payload = await response.json().catch(() => ({}));
    const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (ticket?.status === "ok" && typeof ticket.id === "string") {
      if (db && tokenId) {
        await db.query(
          `INSERT INTO mobile_push_receipts(ticket_id,token_id) VALUES($1,$2)
           ON CONFLICT(ticket_id) DO NOTHING`,
          [ticket.id, tokenId],
        ).catch((error) => console.error("[push-send] เก็บ Expo receipt ไม่สำเร็จ", error.message));
      }
      return { kind: "sent", provider: "expo", ticketId: ticket.id };
    }
    const code = String(ticket?.details?.error || "");
    if (code === "DeviceNotRegistered") return { kind: "gone", provider: "expo", reason: code, retryable: false };
    return { kind: "failed", provider: "expo", reason: code || String(ticket?.message || "expo_rejected"), retryable: code !== "InvalidCredentials" };
  } catch (error) {
    return { kind: "failed", provider: "expo", reason: String(error?.message ?? error), retryable: true };
  }
}

async function sendExpo(expoToken, message, db, tokenId) {
  let outcome = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    outcome = await sendExpoOnce(expoToken, message, db, tokenId);
    if (outcome.kind !== "failed" || outcome.retryable !== true || attempt === MAX_ATTEMPTS) return outcome;
    await wait(250 * (2 ** (attempt - 1)));
  }
  return outcome || { kind: "failed", provider: "expo", reason: "unknown", retryable: true };
}

async function disableGoneToken(db, item) {
  if (!db) return;
  if (item?.tokenId) {
    await db.query(
      `UPDATE mobile_push_tokens SET enabled = false, disabled_at=now(), updated_at=now() WHERE id = $1`,
      [item.tokenId],
    ).catch((error) => console.error("[push-send] ปิดกุญแจที่ตายไม่สำเร็จ", error.message));
    return;
  }
  const device = String(item?.deviceToken || "").trim();
  const expo = String(item?.expoToken || "").trim();
  if (device) {
    await db.query(
      `UPDATE mobile_push_tokens SET enabled = false, disabled_at=now(), updated_at=now() WHERE device_push_token = $1`,
      [device],
    ).catch((error) => console.error("[push-send] ปิดกุญแจที่ตายไม่สำเร็จ", error.message));
  } else if (expo) {
    await db.query(
      `UPDATE mobile_push_tokens SET enabled = false, disabled_at=now(), updated_at=now() WHERE expo_push_token = $1`,
      [expo],
    ).catch((error) => console.error("[push-send] ปิดกุญแจที่ตายไม่สำเร็จ", error.message));
  }
}

async function runItem(item, options) {
  const platform = String(item?.platform || "");
  const nativeType = String(item?.deviceTokenType || "");
  const device = String(item?.deviceToken || "").trim();
  const expo = String(item?.expoToken || "").trim();

  const directFcm = device && platform !== "ios" && nativeType !== "apns";
  if (!directFcm && !expo) return { kind: "no_token", provider: "none", reason: "no_deliverable_token", retryable: false };
  if (options?.dry === true) return { kind: "sent", provider: "dry" };
  if (directFcm) return sendOne(device, item);
  if (expo) return sendExpo(expo, item, options?.db ?? null, item?.tokenId || null);
  return { kind: "no_token", provider: "none", reason: "no_deliverable_token", retryable: false };
}

/**
 * @param {Array<object>} items
 * @returns {Promise<{sent:number,failed:number,gone:number,noToken:number,dry:number,outcomes:Array<object>}>}
 */
async function sendAll(items, options) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { sent: 0, failed: 0, gone: 0, noToken: 0 };
  const result = { sent: 0, failed: 0, gone: 0, noToken: 0, outcomes: new Array(list.length) };
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      const item = list[index];
      const outcome = await runItem(item, options);
      result.outcomes[index] = outcome;
      if (outcome.kind === "sent") result.sent += 1;
      else if (outcome.kind === "gone") {
        result.gone += 1;
        await disableGoneToken(options?.db ?? null, item);
      } else if (outcome.kind === "no_token") result.noToken += 1;
      else result.failed += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()));
  return result;
}

module.exports = {
  EXPO_SEND_URL,
  KEY_PATH,
  categoryOf,
  isReady,
  safeUrl,
  sendAll,
  sendExpo,
  sendOne,
  stringData,
};
