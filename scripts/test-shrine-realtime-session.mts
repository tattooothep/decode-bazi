import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createShrineRealtimeSessionHandler,
  type ShrineRealtimeSessionDependencies,
} from "../src/lib/shrine-realtime-session.ts";

const MODEL = "gpt-realtime-2.1-mini";
const VOICE_TO_PROVIDER = "shimmer"; // เสียงจริงที่ขอจากผู้ให้บริการ (แมว)
const VOICE = "marin"; // ฟิลด์ที่ตอบกลับแอพ — ต้องคงเดิมเพื่อรุ่นเก่า
const NOW_SECONDS = 1_900_000_000;
const SERVER_KEY = "sk-server-only-must-not-leak";
const MOBILE_BEARER = "mobile-session-secret";
const ENDPOINT = "https://hourkey.io/api/mobile/v1/shrine/realtime/session";

const validBody = Object.freeze({
  characterId: "temple-cat",
  contextCode: "main-hall.cat-companion",
  conversationId: "cnv_0123456789abcdef0123456789abcdef",
  locale: "th",
});

const allowedCharacters = Object.freeze([
  ["temple-cat", "main-hall.cat-companion", "temple cat"],
  ["guanyin", "main-hall.guanyin.compassion", "Guanyin"],
  ["guanyu", "main-hall.guanyu.integrity", "Guanyu"],
  ["caishen", "main-hall.caishen.stewardship", "Caishen"],
  ["doumu-yuanjun", "main-hall.doumu-yuanjun.celestial-order", "Doumu Yuanjun"],
  ["fuxi", "main-hall.fuxi.patterns", "Fuxi"],
  ["tudigong", "main-hall.tudigong.community", "Tudigong"],
  ["dizang", "main-hall.dizang.vows", "Dizang"],
  ["lu-dongbin", "main-hall.lu-dongbin.self-cultivation", "Lu Dongbin"],
  ["zhang-daoling", "main-hall.zhang-daoling.discipline", "Zhang Daoling"],
  ["budai-maitreya", "main-hall.budai-maitreya.contentment", "Budai Maitreya"],
  ["chenghuang", "main-hall.chenghuang.civic-duty", "Chenghuang"],
  ["mazu", "main-hall.mazu.safe-journeys", "Mazu"],
] as const);

type FetchCall = Readonly<{ init: RequestInit | undefined; url: string }>;

function providerGrant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    expires_at: NOW_SECONDS + 60,
    session: {
      audio: { output: { voice: VOICE_TO_PROVIDER } },
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

function fixture(overrides: Partial<ShrineRealtimeSessionDependencies> = {}) {
  const fetchCalls: FetchCall[] = [];
  const rateLimitKeys: string[] = [];
  const base: ShrineRealtimeSessionDependencies = {
    bearerToken: (incoming) => {
      const authorization = incoming.headers.get("authorization") ?? "";
      return /^Bearer\s+(.+)$/iu.exec(authorization)?.[1]?.trim() || null;
    },
    clientIp: () => "203.0.113.7",
    fetch: async (url, init) => {
      fetchCalls.push({ init, url: String(url) });
      // 3 ส.ค. 69: เสียงต่อองค์ — ตัวปลอมสะท้อนเสียงที่ handler ขอจริง
      const requested = JSON.parse(String(init?.body))
        ?.session?.audio?.output?.voice ?? VOICE;
      return Response.json(providerGrant({
        session: {
          audio: { output: { voice: requested } },
          model: MODEL,
          type: "realtime",
        },
      }));
    },
    nowSeconds: () => NOW_SECONDS,
    openAiApiKey: () => SERVER_KEY,
    providerTimeoutMs: 10_000,
    rateLimit: async (key) => {
      rateLimitKeys.push(key);
      return { ok: true, remaining: 9, retryAfterMs: 0 };
    },
    validateBearer: async () => ({ orgId: "org_7", userId: "usr_9" }),
    ...overrides,
  };
  return {
    fetchCalls,
    handler: createShrineRealtimeSessionHandler(base),
    rateLimitKeys,
  };
}

async function expectJson(
  response: Response,
  status: number,
  body: unknown,
): Promise<void> {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), body);
}

// The public route must use the repository's fail-closed mobile bearer validator.
{
  const source = await readFile(
    new URL("../src/app/api/mobile/v1/shrine/realtime/session/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /from ["']@\/lib\/mobile-auth["']/u);
  assert.match(source, /validateMobileBearerToken\(token\)/u);
  assert.match(source, /process\.env\.OPENAI_API_KEY/u);
}

// Missing, rejected, and validator-error (expired/revoked lookup) bearers fail closed.
{
  const { handler } = fixture();
  await expectJson(await handler(request({ authorization: null })), 401, {
    error: "unauthorized",
  });
}
for (const validateBearer of [
  async () => null,
  async () => { throw new Error("expired session detail"); },
]) {
  const { fetchCalls, handler } = fixture({ validateBearer });
  await expectJson(await handler(request()), 401, { error: "unauthorized" });
  assert.equal(fetchCalls.length, 0);
}

// Only JSON with the exact bounded mobile contract is accepted.
{
  const { handler } = fixture();
  await expectJson(
    await handler(request({ contentType: "text/plain" })),
    415,
    { error: "application_json_required" },
  );
  await expectJson(
    await handler(request({ body: '{"characterId":' })),
    400,
    { error: "voice_body_invalid" },
  );
  await expectJson(
    await handler(request({ body: JSON.stringify({ ...validBody, extra: true }) })),
    400,
    { error: "voice_body_invalid" },
  );
}

for (const [body, error] of [
  [{ ...validBody, characterId: "unknown-character" }, "voice_character_invalid"],
  [{ ...validBody, contextCode: "outside.cat-companion" }, "voice_context_invalid"],
  [{ ...validBody, contextCode: `main-hall.${"a".repeat(96)}` }, "voice_context_invalid"],
  [{ ...validBody, conversationId: "cnv_not-canonical" }, "voice_conversation_invalid"],
  [{ ...validBody, locale: "fr" }, "voice_locale_invalid"],
] as const) {
  const { fetchCalls, handler } = fixture();
  await expectJson(
    await handler(request({ body: JSON.stringify(body) })),
    400,
    { error },
  );
  assert.equal(fetchCalls.length, 0);
}

// Every approved Main Hall character gets a server-owned, context-bound voice
// policy. A client cannot pair one sculpture with another character's policy.
for (const [characterId, contextCode, instructionMarker] of allowedCharacters) {
  const { fetchCalls, handler } = fixture();
  const response = await handler(request({
    body: JSON.stringify({ ...validBody, characterId, contextCode }),
  }));
  assert.equal(response.status, 200, `${characterId} must be voice-enabled`);
  assert.equal(fetchCalls.length, 1);
  const upstreamBody = JSON.parse(String(fetchCalls[0].init?.body));
  assert.match(upstreamBody.session.instructions, new RegExp(instructionMarker, "iu"));
  assert.match(upstreamBody.session.instructions, /cultural portrayal|temple cat/iu);
  assert.match(upstreamBody.session.instructions, /never claim supernatural certainty/iu);
}

{
  const { fetchCalls, handler } = fixture();
  await expectJson(
    await handler(request({
      body: JSON.stringify({
        ...validBody,
        characterId: "guanyin",
        contextCode: "main-hall.caishen.stewardship",
      }),
    })),
    400,
    { error: "voice_context_invalid" },
  );
  assert.equal(fetchCalls.length, 0);
}

// Both declared and actual UTF-8 body size are bounded at 4 KiB.
{
  const { handler } = fixture();
  await expectJson(
    await handler(request({ headers: { "Content-Length": "4097" } })),
    413,
    { error: "request_too_large" },
  );
  await expectJson(
    await handler(request({ body: JSON.stringify({ ...validBody, padding: "x".repeat(4_096) }) })),
    413,
    { error: "request_too_large" },
  );
}

// Streaming input is cancelled as soon as it crosses the cap, before buffering the rest.
{
  let cancelled = false;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    cancel: () => {
      cancelled = true;
    },
    pull: (controller) => {
      pulls += 1;
      if (pulls <= 3) {
        controller.enqueue(new Uint8Array(2_048).fill(0x61));
      } else {
        controller.close();
      }
    },
  }, { highWaterMark: 0 });
  const incoming = new Request(ENDPOINT, {
    body: stream,
    duplex: "half",
    headers: {
      Authorization: `Bearer ${MOBILE_BEARER}`,
      "Content-Type": "application/json",
      "X-Real-IP": "203.0.113.7",
    },
    method: "POST",
  } as RequestInit & { duplex: "half" });
  const { handler } = fixture();
  await expectJson(await handler(incoming), 413, { error: "request_too_large" });
  assert.equal(cancelled, true);
  assert.equal(pulls, 3);
}

// IP, bearer fingerprint, and user buckets all gate the provider call.
for (const deniedDimension of ["ip", "token", "user"] as const) {
  const { fetchCalls, handler } = fixture({
    rateLimit: async (key) => ({
      ok: !key.includes(`:${deniedDimension}:`),
      remaining: 0,
      retryAfterMs: 2_100,
    }),
  });
  const response = await handler(request());
  await expectJson(response, 429, { error: "rate_limited" });
  assert.equal(response.headers.get("retry-after"), "3");
  assert.equal(fetchCalls.length, 0);
}

// A missing server credential and all provider failures collapse to one stable error.
{
  const { handler } = fixture({ openAiApiKey: () => "  " });
  await expectJson(await handler(request()), 503, { error: "voice_unavailable" });
}
for (const fetcher of [
  async () => Response.json(
    { error: { message: `provider rejected ${SERVER_KEY}` } },
    { status: 429 },
  ),
  async () => { throw new Error(`network failed with ${SERVER_KEY}`); },
  async () => new Response("{", {
    headers: { "Content-Type": "application/json" },
    status: 200,
  }),
] as const) {
  const { handler } = fixture({ fetch: fetcher });
  const response = await handler(request());
  assert.doesNotMatch(await response.clone().text(), /provider|network|sk-server/iu);
  await expectJson(response, 503, { error: "voice_unavailable" });
}

// The backend cancels a slow provider mint even while the mobile client remains connected.
{
  const { handler } = fixture({
    fetch: async (_url, init) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json(providerGrant())), 50);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error(`provider timeout exposed ${SERVER_KEY}`));
      }, { once: true });
    }),
    providerTimeoutMs: 5,
  });
  const response = await handler(request());
  assert.doesNotMatch(await response.clone().text(), /provider|timeout|sk-server/iu);
  await expectJson(response, 503, { error: "voice_unavailable" });
}

// The provider timeout remains active after headers while the response body is read.
{
  let bodyCancelled = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let pulls = 0;
  const providerBody = new ReadableStream<Uint8Array>({
    cancel: () => {
      bodyCancelled = true;
      if (closeTimer) clearTimeout(closeTimer);
    },
    pull: (controller) => {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(providerGrant())));
      } else {
        closeTimer = setTimeout(() => controller.close(), 50);
      }
    },
  }, { highWaterMark: 0 });
  const { handler } = fixture({
    fetch: async () => new Response(providerBody, {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
    providerTimeoutMs: 5,
  });
  const response = await handler(request());
  await expectJson(response, 503, { error: "voice_unavailable" });
  assert.equal(bodyCancelled, true);
}

// Oversized provider bodies are cancelled before the remainder is buffered.
{
  let bodyCancelled = false;
  let pulls = 0;
  const providerBody = new ReadableStream<Uint8Array>({
    cancel: () => {
      bodyCancelled = true;
    },
    pull: (controller) => {
      pulls += 1;
      if (pulls <= 5) {
        controller.enqueue(new Uint8Array(4_096).fill(0x61));
      } else {
        controller.close();
      }
    },
  }, { highWaterMark: 0 });
  const { handler } = fixture({
    fetch: async () => new Response(providerBody, {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  });
  await expectJson(await handler(request()), 503, { error: "voice_unavailable" });
  assert.equal(bodyCancelled, true);
  assert.equal(pulls, 5);
}

// Malformed, expired, over-long, wrong-model, and wrong-voice grants are rejected.
const invalidProviderGrants: readonly unknown[] = [
  null,
  {},
  providerGrant({ value: "short" }),
  providerGrant({ value: `ek_${"x".repeat(2_100)}` }),
  providerGrant({ expires_at: NOW_SECONDS }),
  providerGrant({ expires_at: NOW_SECONDS + 10 }),
  // 4 ส.ค. 69: ขอบขยายเป็น +660 (เผื่อนาฬิกาคลาด) เคสนี้จึงต้องเกิน 660
  providerGrant({ expires_at: NOW_SECONDS + 661 }),
  providerGrant({ expires_at: NOW_SECONDS + 60.5 }),
  providerGrant({ session: null }),
  providerGrant({
    session: {
      audio: { output: { voice: VOICE } },
      model: "gpt-realtime-2",
      type: "realtime",
    },
  }),
  providerGrant({
    session: {
      audio: { output: { voice: "alloy" } },
      model: MODEL,
      type: "realtime",
    },
  }),
];
for (const grant of invalidProviderGrants) {
  const { handler } = fixture({
    fetch: async () => Response.json(grant),
  });
  await expectJson(await handler(request()), 503, { error: "voice_unavailable" });
}

// Success mints the documented session, returns only the client grant, and never caches.
{
  const { fetchCalls, handler, rateLimitKeys } = fixture();
  const response = await handler(request());
  await expectJson(response.clone(), 200, {
    clientSecret: "ek_ephemeral_client_only",
    expiresAt: NOW_SECONDS + 60,
    model: MODEL,
    voice: VOICE,
    // 3 ส.ค. 69: ฟิลด์ใหม่สำหรับรุ่นที่รับเสียงรายองค์ได้
    characterVoice: VOICE_TO_PROVIDER,
  });
  const publicBody = await response.text();
  assert.doesNotMatch(publicBody, new RegExp(SERVER_KEY, "u"));
  assert.doesNotMatch(publicBody, /rt_session_private|org_7|usr_9/u);

  assert.equal(fetchCalls.length, 1);
  const call = fetchCalls[0];
  assert.equal(call.url, "https://api.openai.com/v1/realtime/client_secrets");
  assert.equal(call.init?.method, "POST");
  assert.equal(call.init?.cache, "no-store");
  const headers = new Headers(call.init?.headers);
  assert.equal(headers.get("authorization"), `Bearer ${SERVER_KEY}`);
  assert.equal(headers.get("content-type"), "application/json");
  assert.match(headers.get("openai-safety-identifier") ?? "", /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(headers.get("openai-safety-identifier") ?? "", /org_7|usr_9/u);

  const upstreamBody = JSON.parse(String(call.init?.body));
  assert.equal(upstreamBody.session.type, "realtime");
  assert.equal(upstreamBody.session.model, MODEL);
  assert.deepEqual(upstreamBody.session.output_modalities, ["audio"]);
  assert.deepEqual(upstreamBody.session.audio.input.format, {
    rate: 24_000,
    type: "audio/pcm",
  });
  assert.equal(upstreamBody.session.audio.input.transcription.model, "gpt-4o-mini-transcribe");
  assert.equal(upstreamBody.session.audio.input.transcription.language, "th");
  assert.deepEqual(upstreamBody.session.audio.input.turn_detection, {
    create_response: true,
    interrupt_response: true,
    prefix_padding_ms: 300,
    silence_duration_ms: 500,
    threshold: 0.5,
    type: "server_vad",
  });
  assert.deepEqual(upstreamBody.session.audio.output.format, {
    rate: 24_000,
    type: "audio/pcm",
  });
  assert.equal(upstreamBody.session.audio.output.voice, VOICE_TO_PROVIDER);
  assert.match(upstreamBody.session.instructions, /Thai/u);
  assert.match(upstreamBody.session.instructions, /never claim supernatural certainty/iu);

  // 🔴 4 ส.ค.: เจ้าของสั่งถอดเพดานรายวันออก — คุยได้อิสระต่อเนื่อง ห้ามมีอะไรขัด
  // เหลือ 3 ด่านกันบอทเท่านั้น และตั้งสูงจนคนใช้จริงไม่มีทางชน
  assert.equal(rateLimitKeys.length, 3);
  assert.match(rateLimitKeys[0], /:ip:/u);
  assert.match(rateLimitKeys[1], /:token:[0-9a-f]{64}$/u);
  assert.match(rateLimitKeys[2], /:user:/u);
  assert.equal(rateLimitKeys.some((key) => key.includes(":daily:")), false);
  assert.equal(rateLimitKeys.some((key) => key.includes(MOBILE_BEARER)), false);
}

console.log("shrine realtime session contract passed");
