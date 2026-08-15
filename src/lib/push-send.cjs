/** Provider-aware mobile push transport used by every scheduled notification. */
const { createSign } = require("node:crypto");
const { readFileSync } = require("node:fs");

const KEY_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH
  ?? "/root/secrets/hourkey-fcm-service-account.json";
const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";
const TICKET_SAFETY_SECONDS = 300;
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 10;
const ACTION_CATEGORY_ID = "hourkey_daily";

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

function parseRetryAfterSeconds(raw, nowMs = Date.now()) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^\d+$/u.test(value)) return Math.max(0, Number(value));
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, Math.ceil((dateMs - nowMs) / 1000)) : null;
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

function providerData(message, stringifyValues) {
  const data = message?.data && typeof message.data === "object" ? message.data : {};
  const out = {};
  const sensitiveKeyParts = [
    "token", "auth", "authorization", "secret", "credential", "password", "cookie", "session",
    "apikey", "privatekey", "accesskey", "clientsecret", "bearer",
  ];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]+/gu, "");
    if (normalizedKey.endsWith("key") || sensitiveKeyParts.some((part) => normalizedKey.includes(part))) continue;
    out[String(key).slice(0, 80)] = stringifyValues ? String(value).slice(0, 500) : value;
  }
  if (typeof out.url !== "string") out.url = safeUrl(message?.url || data.url);
  return out;
}

function stringData(message) {
  return providerData(message, true);
}

function providerFor(item) {
  const platform = String(item?.platform || "");
  const nativeType = String(item?.deviceTokenType || "");
  const device = String(item?.deviceToken || "").trim();
  const expo = String(item?.expoToken || "").trim();
  if (device && platform !== "ios" && nativeType !== "apns") return "fcm";
  if (expo) return "expo";
  return null;
}

/** Exact provider body without the credential identifying the target device. */
function prepareMessage(item, provider = providerFor(item)) {
  const category = categoryOf(item);
  const actionCategoryId = category === "security" || item?.transactional === true
    ? null
    : ACTION_CATEGORY_ID;
  if (provider === "fcm") {
    return {
      notification: {
        title: String(item?.title || "Hourkey").slice(0, 120),
        body: String(item?.body || "").slice(0, 400),
      },
      // Expo Notifications' Android native bridge JSON-parses data.body into
      // request.content.data. A single JSON object preserves v/lead/score
      // number types required by the strict mobile payload parser.
      data: {
        body: JSON.stringify(providerData(item, false)),
        ...(actionCategoryId ? { categoryId: actionCategoryId } : {}),
      },
      android: {
        priority: category === "security" || category === "service" ? "HIGH" : "NORMAL",
        ttl: category === "security" || category === "service" ? "21600s" : "86400s",
        notification: {
          sound: category === "security" || category === "service" ? "default" : undefined,
          channel_id: channelOf(category),
        },
      },
    };
  }
  if (provider === "expo") {
    return {
      title: String(item?.title || "Hourkey").slice(0, 120),
      body: String(item?.body || "").slice(0, 400),
      data: providerData(item, false),
      sound: category === "security" || category === "service" ? "default" : null,
      priority: category === "security" || category === "service" ? "high" : "normal",
      ttl: category === "security" || category === "service" ? 21_600 : 86_400,
      channelId: channelOf(category),
      ...(actionCategoryId ? { categoryId: actionCategoryId } : {}),
    };
  }
  return null;
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

async function sendPreparedFcmOnce(deviceToken, providerMessage, retryAuth = true) {
  const key = loadKey();
  if (key === null) return { kind: "failed", reason: "no_service_account", retryable: true };
  const ticket = await getTicket();
  if (ticket === null) return { kind: "failed", reason: "no_ticket", retryable: true };
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ticket}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            ...providerMessage,
          },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const providerMessageId = typeof payload.name === "string" ? payload.name.trim() : "";
      if (!providerMessageId) {
        return { kind: "uncertain", provider: "fcm", reason: "uncertain_provider_result", retryable: false };
      }
      return {
        kind: "provider_accepted",
        provider: "fcm",
        providerMessageId,
      };
    }
    const detail = (await response.text()).slice(0, 500);
    if (retryAuth && (response.status === 401 || response.status === 403)) {
      cachedTicket = null;
      return sendPreparedFcmOnce(deviceToken, providerMessage, false);
    }
    const invalidRegistration = response.status === 400
      && /(?:registration token (?:is )?not valid|invalid registration token|not a valid fcm registration token)/iu.test(detail);
    const gone = response.status === 404 || detail.includes("UNREGISTERED") || invalidRegistration;
    const retryable = TRANSIENT_HTTP.has(response.status);
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
    console.error(`[push-send] FCM ${response.status}`);
    return gone
      ? { kind: "gone", provider: "fcm", reason: String(response.status), retryable: false }
      : { kind: "failed", provider: "fcm", reason: `fcm_${response.status}`, retryable, retryAfterSeconds };
  } catch {
    return { kind: "uncertain", provider: "fcm", reason: "uncertain_provider_result", retryable: false };
  }
}

async function sendFcmOnce(deviceToken, message) {
  const outcome = await sendPreparedFcmOnce(deviceToken, prepareMessage(message, "fcm"));
  return outcome.kind === "provider_accepted" ? { ...outcome, kind: "sent" } : outcome;
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

async function sendPreparedExpoOnce(expoToken, providerMessage) {
  try {
    const response = await fetch(EXPO_SEND_URL, {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify({
        to: expoToken,
        ...providerMessage,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return {
        kind: "failed",
        provider: "expo",
        reason: `expo_${response.status}`,
        retryable: TRANSIENT_HTTP.has(response.status),
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
      };
    }
    const payload = await response.json().catch(() => ({}));
    const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (ticket?.status === "ok") {
      const providerTicketId = typeof ticket.id === "string" ? ticket.id.trim() : "";
      return providerTicketId
        ? { kind: "provider_accepted", provider: "expo", providerTicketId }
        : { kind: "uncertain", provider: "expo", reason: "uncertain_provider_result", retryable: false };
    }
    const code = String(ticket?.details?.error || "");
    if (code === "DeviceNotRegistered") return { kind: "gone", provider: "expo", reason: code, retryable: false };
    if (ticket?.status === "error") {
      return { kind: "failed", provider: "expo", reason: code || String(ticket?.message || "expo_rejected"), retryable: code !== "InvalidCredentials" };
    }
    return { kind: "uncertain", provider: "expo", reason: "uncertain_provider_result", retryable: false };
  } catch {
    return { kind: "uncertain", provider: "expo", reason: "uncertain_provider_result", retryable: false };
  }
}

async function sendExpoOnce(expoToken, message, db, tokenId) {
  const outcome = await sendPreparedExpoOnce(expoToken, prepareMessage(message, "expo"));
  if (outcome.kind === "provider_accepted") {
    if (db && tokenId && outcome.providerTicketId) {
      await db.query(
        `INSERT INTO mobile_push_receipts(ticket_id,token_id) VALUES($1,$2)
         ON CONFLICT(ticket_id) DO NOTHING`,
        [outcome.providerTicketId, tokenId],
      ).catch(() => console.error("[push-send] เก็บ Expo receipt ไม่สำเร็จ"));
    }
    return { ...outcome, kind: "sent", ticketId: outcome.providerTicketId };
  }
  return outcome;
}

async function sendPrepared(target) {
  if (target?.provider === "fcm") {
    const deviceToken = String(target?.deviceToken || "").trim();
    if (!deviceToken) return { kind: "gone", provider: "fcm", reason: "target_unavailable", retryable: false };
    return sendPreparedFcmOnce(deviceToken, target.providerMessage);
  }
  if (target?.provider === "expo") {
    const expoToken = String(target?.expoToken || "").trim();
    if (!expoToken) return { kind: "gone", provider: "expo", reason: "target_unavailable", retryable: false };
    return sendPreparedExpoOnce(expoToken, target.providerMessage);
  }
  return { kind: "gone", provider: "none", reason: "target_unavailable", retryable: false };
}

async function pollExpoReceipts(ticketIds) {
  const ids = [...new Set((ticketIds || []).map(String).filter(Boolean))];
  if (ids.length === 0) return {};
  const response = await fetch(EXPO_RECEIPT_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`expo_receipt_http_${response.status}`);
  const payload = await response.json().catch(() => ({}));
  const normalized = {};
  for (const id of ids) {
    const receipt = payload?.data?.[id];
    if (!receipt) continue;
    if (receipt.status === "ok") normalized[id] = { kind: "provider_receipt_ok" };
    else {
      const reason = String(receipt?.details?.error || receipt?.message || "expo_receipt_error").slice(0, 300);
      normalized[id] = {
        kind: "error",
        reason,
        retryable: reason !== "DeviceNotRegistered" && reason !== "InvalidCredentials",
      };
    }
  }
  return normalized;
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
  EXPO_RECEIPT_URL,
  EXPO_SEND_URL,
  KEY_PATH,
  categoryOf,
  isReady,
  pollExpoReceipts,
  parseRetryAfterSeconds,
  prepareMessage,
  providerFor,
  safeUrl,
  sendAll,
  sendExpo,
  sendOne,
  sendPrepared,
  stringData,
};
