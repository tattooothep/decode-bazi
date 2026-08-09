/**
 * เทสสัญญา (unit · DI mock) — ห้องคุยสดซินแส /api/mobile/v1/sifu/realtime/session
 * รัน: npx tsx scripts/test-sifu-realtime-session.mts
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildRelayInstructions,
  createSifuRealtimeSessionHandler,
  PROVIDER_INSTRUCTIONS_MAX_CHARS,
  sifuRealtimeYamCost,
  sifuVoiceDirectives,
  type SifuRealtimeSessionDependencies,
} from "../src/lib/sifu-realtime-session.ts";

const MODEL = "gpt-realtime-2.1";
const CLIENT_MODEL = "gpt-realtime-2.1-mini";
const VOICE = "ash";
const NOW_SECONDS = 1_900_000_000;
const SERVER_KEY = "sk-server-only-must-not-leak";
const MOBILE_BEARER = "mobile-session-secret";
const ENDPOINT = "https://hourkey.io/api/mobile/v1/sifu/realtime/session";
const PROFILE_ID = "0b62e5d0-9f4c-4a6d-8f0e-2f9b7c1d3e4a";

/* prompt จำลองที่ "หน้าตาเหมือนชุดจริง" — มี identity-lock + ชื่อคัมภีร์ + FACT LOCK */
const REAL_PROMPT_SAMPLE = [
  "คุณคือซินแสปาจื้ออาวุโส …",
  "FACT LOCK: Day Master = 己 · polarity = yin · element = earth",
  "PILLAR LOCK: 甲子 丙子 己亥 庚午",
  "บรรทัดแรก exact: ⟦ID⟧日干=己⟧",
  "=== คัมภีร์ปฏิกิริยา (bazi-interaction-master) ===",
  "PACKET: เสาปี 甲子 · เสาเดือน 丙子 · เสาวัน 己亥 · เสายาม 庚午",
].join("\n");

/* prompt ชุดจริงขนาดเกินเพดานผู้ให้บริการ → ต้องเข้าโหมด relay */
const OVERSIZE_PROMPT_SAMPLE =
  REAL_PROMPT_SAMPLE + "\n" + "คัมภีร์".repeat(PROVIDER_INSTRUCTIONS_MAX_CHARS);

const validBody = Object.freeze({
  locale: "th",
  minutes: 3,
  profileId: PROFILE_ID,
});

type FetchCall = Readonly<{ init: RequestInit | undefined; url: string }>;

function providerGrant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    expires_at: NOW_SECONDS + 60,
    session: {
      audio: { output: { voice: VOICE } },
      model: MODEL,
      type: "realtime",
    },
    value: "ek_ephemeral_client_only",
    ...overrides,
  };
}

function request(options: Readonly<{
  authorization?: string | null;
  body?: string;
  contentType?: string | null;
  headers?: HeadersInit;
}> = {}): Request {
  const headers = new Headers(options.headers);
  if (options.authorization !== null) {
    headers.set("Authorization", options.authorization ?? `Bearer ${MOBILE_BEARER}`);
  }
  if (options.contentType !== null) {
    headers.set("Content-Type", options.contentType ?? "application/json");
  }
  headers.set("X-Real-IP", "203.0.113.7");
  return new Request(ENDPOINT, {
    body: options.body ?? JSON.stringify(validBody),
    headers,
    method: "POST",
  });
}

function fixture(overrides: Partial<SifuRealtimeSessionDependencies> = {}) {
  const fetchCalls: FetchCall[] = [];
  const chargeCalls: Array<{ userId: string; amount: number; minutes: number }> = [];
  const refundCalls: Array<{ userId: string; amount: number; ref: string }> = [];
  const promptCalls: Array<{ profileId: string; locale: string }> = [];
  const rateLimitKeys: string[] = [];
  const base: SifuRealtimeSessionDependencies = {
    bearerToken: (incoming) => {
      const authorization = incoming.headers.get("authorization") ?? "";
      return /^Bearer\s+(.+)$/iu.exec(authorization)?.[1]?.trim() || null;
    },
    buildSifuVoicePrompt: async (input) => {
      promptCalls.push({ locale: input.locale, profileId: input.profileId });
      return { expectedDm: "己", model: "claude-max-cli", ok: true, prompt: REAL_PROMPT_SAMPLE };
    },
    chargeYam: async (input) => {
      chargeCalls.push({ amount: input.amount, minutes: input.minutes, userId: input.userId });
      return { balanceAfter: 94, ok: true, ref: "sifu_rt:test-ref" };
    },
    clientIp: () => "203.0.113.7",
    fetch: async (url, init) => {
      fetchCalls.push({ init, url: String(url) });
      return Response.json(providerGrant());
    },
    nowSeconds: () => NOW_SECONDS,
    openAiApiKey: () => SERVER_KEY,
    providerTimeoutMs: 10_000,
    rateLimit: async (key) => {
      rateLimitKeys.push(key);
      return { ok: true, remaining: 9, retryAfterMs: 0 };
    },
    refundYam: async (input) => {
      refundCalls.push({ amount: input.amount, ref: input.ref, userId: input.userId });
    },
    validateBearer: async () => ({ orgId: "org_7", userId: "usr_9" }),
    voice: () => VOICE,
    ...overrides,
  };
  return {
    chargeCalls,
    fetchCalls,
    handler: createSifuRealtimeSessionHandler(base),
    promptCalls,
    rateLimitKeys,
    refundCalls,
  };
}

async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), body);
}

// route จริงต้องใช้ mobile bearer validator แบบ fail-closed + key ฝั่ง server เท่านั้น
{
  const source = await readFile(
    new URL("../src/app/api/mobile/v1/sifu/realtime/session/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /from ["']@\/lib\/mobile-auth["']/u);
  assert.match(source, /validateMobileBearerToken\(token\)/u);
  assert.match(source, /process\.env\.OPENAI_API_KEY/u);
  assert.match(source, /X-Sifu-Fusion-Token/u); // prompt ต้องมาจาก /api/sifu internal เท่านั้น
  assert.match(source, /hour_transactions/u); // ธุรกรรมยามแบบ append
}

// ไม่มี token / token ปลอม / validator พัง → 401 ปิดสนิท ไม่แตะเงิน ไม่แตะ provider
{
  const { chargeCalls, fetchCalls, handler } = fixture();
  await expectJson(await handler(request({ authorization: null })), 401, { error: "unauthorized" });
  assert.equal(fetchCalls.length + chargeCalls.length, 0);
}
for (const validateBearer of [
  async () => null,
  async () => { throw new Error("expired session detail"); },
]) {
  const { chargeCalls, fetchCalls, handler } = fixture({ validateBearer });
  await expectJson(await handler(request()), 401, { error: "unauthorized" });
  assert.equal(fetchCalls.length + chargeCalls.length, 0);
}

// body ต้องเป็น JSON ตามสัญญาเป๊ะ
{
  const { handler } = fixture();
  await expectJson(await handler(request({ contentType: "text/plain" })), 415, { error: "application_json_required" });
  await expectJson(await handler(request({ body: '{"profileId":' })), 400, { error: "voice_body_invalid" });
  await expectJson(
    await handler(request({ body: JSON.stringify({ ...validBody, extra: true }) })),
    400,
    { error: "voice_body_invalid" },
  );
}
for (const [body, error] of [
  [{ ...validBody, profileId: "not-a-uuid" }, "voice_profile_invalid"],
  [{ ...validBody, locale: "fr" }, "voice_locale_invalid"],
  [{ ...validBody, minutes: 0 }, "voice_minutes_invalid"],
  [{ ...validBody, minutes: 11 }, "voice_minutes_invalid"],
  [{ ...validBody, minutes: 2.5 }, "voice_minutes_invalid"],
] as const) {
  const { chargeCalls, fetchCalls, handler } = fixture();
  await expectJson(await handler(request({ body: JSON.stringify(body) })), 400, { error });
  assert.equal(fetchCalls.length + chargeCalls.length, 0);
}

// rate limit 3 มิติ (ip/token/user) กั้นก่อนถึง provider และก่อนตัดยาม
for (const deniedDimension of ["ip", "token", "user"] as const) {
  const { chargeCalls, fetchCalls, handler } = fixture({
    rateLimit: async (key) => ({
      ok: !key.includes(`:${deniedDimension}:`),
      remaining: 0,
      retryAfterMs: 2_100,
    }),
  });
  const response = await handler(request());
  await expectJson(response, 429, { error: "rate_limited" });
  assert.equal(response.headers.get("retry-after"), "3");
  assert.equal(fetchCalls.length + chargeCalls.length, 0);
}

// prompt จริงดึงไม่ได้ → ไม่ตัดยาม ไม่เปิด session · สถานะส่งต่อตรง (เช่น 404 ดวงไม่พบ)
{
  const { chargeCalls, fetchCalls, handler } = fixture({
    buildSifuVoicePrompt: async () => ({ error: "profile_context_unlocked", ok: false, status: 404 }),
  });
  await expectJson(await handler(request()), 404, { error: "profile_context_unlocked" });
  assert.equal(fetchCalls.length + chargeCalls.length, 0);
}

// prompt ที่ไม่มี ⟦ID⟧ = ไม่ใช่ชุดซินแสจริง → ห้ามเปิดห้องเสียง (กันดวงย่อ/prompt เขียนใหม่)
{
  const { chargeCalls, fetchCalls, handler } = fixture({
    buildSifuVoicePrompt: async () => ({ expectedDm: null, model: "x", ok: true, prompt: "short prompt no id lock" }),
  });
  await expectJson(await handler(request()), 502, { error: "sifu_prompt_incomplete" });
  assert.equal(fetchCalls.length + chargeCalls.length, 0);
}

// ยามไม่พอ → 402 พร้อมยอดที่ต้องใช้ · ไม่เรียก provider ไม่มี refund
{
  const { fetchCalls, handler, refundCalls } = fixture({
    chargeYam: async () => ({ balance: 3, ok: false }),
  });
  await expectJson(await handler(request()), 402, {
    balance: 3,
    error: "insufficient_hours",
    required: 6,
  });
  assert.equal(fetchCalls.length + refundCalls.length, 0);
}

// provider ล้มทุกแบบ → 503 + คืนยามเต็มจำนวนด้วย ref เดิม · ไม่รั่ว detail/key
for (const fetcher of [
  async () => Response.json({ error: { message: `provider rejected ${SERVER_KEY}` } }, { status: 429 }),
  async () => { throw new Error(`network failed with ${SERVER_KEY}`); },
  async () => Response.json(providerGrant({ value: "short" })),
  async () => Response.json(providerGrant({ expires_at: NOW_SECONDS + 661 })),
  async () => Response.json(providerGrant({
    session: { audio: { output: { voice: "alloy" } }, model: MODEL, type: "realtime" },
  })),
] as const) {
  const { handler, refundCalls } = fixture({ fetch: fetcher });
  const response = await handler(request());
  assert.doesNotMatch(await response.clone().text(), /provider rejected|network failed|sk-server/iu);
  await expectJson(response, 503, { error: "voice_unavailable" });
  assert.deepEqual(refundCalls, [{ amount: 6, ref: "sifu_rt:test-ref", userId: "usr_9" }]);
}

// provider ช้าเกิน timeout → ยกเลิก + คืนยาม
{
  const { handler, refundCalls } = fixture({
    fetch: async (_url, init) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json(providerGrant())), 50);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("provider timeout"));
      }, { once: true });
    }),
    providerTimeoutMs: 5,
  });
  await expectJson(await handler(request()), 503, { error: "voice_unavailable" });
  assert.equal(refundCalls.length, 1);
}

// สำเร็จ: กติกาเสียงต้องนำหน้า prompt ชุดจริง · ตัดยามถูกอัตรา
{
  const { chargeCalls, fetchCalls, handler, promptCalls, rateLimitKeys, refundCalls } = fixture();
  const response = await handler(request());
  await expectJson(response.clone(), 200, {
    balanceAfter: 94,
    clientSecret: "ek_ephemeral_client_only",
    expiresAt: NOW_SECONDS + 60,
    minutes: 3,
    mode: "direct",
    model: CLIENT_MODEL,
    providerModel: MODEL,
    ratePerMinuteYam: 2,
    voice: VOICE,
    yamSpent: 6,
  });
  const publicBody = await response.text();
  assert.doesNotMatch(publicBody, new RegExp(SERVER_KEY, "u"));
  assert.doesNotMatch(publicBody, /org_7|usr_9|⟦ID⟧/u); // prompt ห้ามรั่วกลับแอพ

  assert.deepEqual(promptCalls, [{ locale: "th", profileId: PROFILE_ID }]);
  assert.deepEqual(chargeCalls, [{ amount: 6, minutes: 3, userId: "usr_9" }]);
  assert.equal(refundCalls.length, 0);

  assert.equal(fetchCalls.length, 1);
  const call = fetchCalls[0];
  assert.equal(call.url, "https://api.openai.com/v1/realtime/client_secrets");
  const headers = new Headers(call.init?.headers);
  assert.equal(headers.get("authorization"), `Bearer ${SERVER_KEY}`);
  assert.match(headers.get("openai-safety-identifier") ?? "", /^[0-9a-f]{64}$/u);

  const upstreamBody = JSON.parse(String(call.init?.body));
  assert.equal(upstreamBody.session.model, MODEL);
  assert.deepEqual(upstreamBody.session.output_modalities, ["audio"]);
  assert.equal(upstreamBody.session.audio.output.voice, VOICE);
  assert.equal(upstreamBody.session.audio.input.transcription.language, "th");
  assert.equal(upstreamBody.session.audio.input.transcription.model, "gpt-4o-transcribe");
  assert.match(upstreamBody.session.audio.input.transcription.prompt, /ภาษาไทย/u);
  assert.equal(upstreamBody.session.audio.input.turn_detection.interrupt_response, false);
  assert.equal(upstreamBody.session.audio.input.turn_detection.silence_duration_ms, 1_100);
  // กติกาความชัดเจนต้องอยู่หัว instructions และ prompt จริงต้องอยู่ครบทั้งก้อน
  assert.equal(
    upstreamBody.session.instructions,
    sifuVoiceDirectives("th") + "\n" + REAL_PROMPT_SAMPLE,
  );
  assert.match(upstreamBody.session.instructions, /ยังไม่ได้ถาม/u);
  assert.match(upstreamBody.session.instructions, /ห้ามทำนาย ห้ามเดาเจตนา/u);
  assert.match(upstreamBody.session.instructions, /⟦ID⟧日干=己⟧/u);
  assert.match(upstreamBody.session.instructions, /bazi-interaction-master/u);
  assert.match(upstreamBody.session.instructions, /FACT LOCK/u);
  assert.match(upstreamBody.session.instructions, /กติกาห้องคุยเสียงสด/u);

  assert.equal(rateLimitKeys.length, 3);
  assert.match(rateLimitKeys[0], /:ip:/u);
  assert.match(rateLimitKeys[1], /:token:[0-9a-f]{64}$/u);
  assert.match(rateLimitKeys[2], /:user:/u);
  assert.equal(rateLimitKeys.some((key) => key.includes(MOBILE_BEARER)), false);
}

// ไม่ส่ง minutes → default 5 นาที = 10 ยาม · locale zh → transcription zh
{
  const { chargeCalls, fetchCalls, handler } = fixture();
  const response = await handler(request({
    body: JSON.stringify({ locale: "zh", profileId: PROFILE_ID }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(chargeCalls, [{ amount: 10, minutes: 5, userId: "usr_9" }]);
  const upstreamBody = JSON.parse(String(fetchCalls[0].init?.body));
  assert.equal(upstreamBody.session.audio.input.transcription.language, "zh");
  assert.match(upstreamBody.session.instructions, /Chinese/u);
}

// prompt ชุดจริงใหญ่เกินเพดานผู้ให้บริการ → ใช้บัตรดวงย่อ แต่ต้องรายงาน direct
// เพราะตั๋วไม่ประกาศ ask_sifu tool (ห้ามหลอกแอพให้รอ relay ที่ไม่มีอยู่จริง)
{
  const { chargeCalls, fetchCalls, handler } = fixture({
    buildSifuVoicePrompt: async () => ({
      expectedDm: "己",
      model: "claude-max-cli",
      ok: true,
      prompt: OVERSIZE_PROMPT_SAMPLE,
    }),
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.mode, "direct");
  assert.equal(body.model, CLIENT_MODEL);
  assert.equal(body.providerModel, MODEL);
  assert.equal("relay" in body, false);
  assert.deepEqual(chargeCalls, [{ amount: 6, minutes: 3, userId: "usr_9" }]);
  const upstreamBody = JSON.parse(String(fetchCalls[0].init?.body));
  const instructions = String(upstreamBody.session.instructions);
  assert.ok(instructions.length <= PROVIDER_INSTRUCTIONS_MAX_CHARS, "compact instructions ต้องไม่เกินเพดาน");
  assert.match(instructions, /⟦ID⟧日干=己⟧/u);
  assert.match(instructions, /FACT LOCK: Day Master = 己/u); // บรรทัดจริงจาก packet ไม่ใช่แต่งใหม่
  assert.match(instructions, /PILLAR LOCK: 甲子 丙子 己亥 庚午/u);
  assert.match(instructions, /ยังไม่ได้ถาม/u);
  assert.match(instructions, /ห้ามทำนายหรือเดาเจตนา/u);
  assert.equal("tools" in upstreamBody.session, false);
  assert.equal("tool_choice" in upstreamBody.session, false);
  assert.equal(
    instructions,
    buildRelayInstructions({ expectedDm: "己", locale: "th", prompt: OVERSIZE_PROMPT_SAMPLE }),
  );
}

// prompt ใหญ่แต่คัดบรรทัด lock ไม่ครบ → 502 ไม่ตัดยาม ไม่เปิดห้อง (ห้ามเปิดแบบข้อมูลพร่อง)
{
  const oversizeNoPillar = OVERSIZE_PROMPT_SAMPLE.replace(/^PILLAR LOCK[^\n]*\n/mu, "");
  const { chargeCalls, fetchCalls, handler } = fixture({
    buildSifuVoicePrompt: async () => ({
      expectedDm: "己",
      model: "claude-max-cli",
      ok: true,
      prompt: oversizeNoPillar,
    }),
  });
  await expectJson(await handler(request()), 502, { error: "sifu_prompt_incomplete" });
  assert.equal(fetchCalls.length + chargeCalls.length, 0);
}

// อัตรา 2 ยาม/นาที ปัดขึ้น
assert.equal(sifuRealtimeYamCost(1), 2);
assert.equal(sifuRealtimeYamCost(5), 10);
assert.equal(sifuRealtimeYamCost(10), 20);

console.log("sifu realtime session contract passed");
