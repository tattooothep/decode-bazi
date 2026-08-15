import assert from "node:assert/strict";

const fcm = await import("../src/lib/fcm-direct.ts");
const originalFetch = globalThis.fetch;
const originalError = console.error;
const logs: string[] = [];
let responseMode: "valid" | "malformed" | "error" | "transport" = "valid";
let sendSignal: AbortSignal | null = null;

try {
  console.error = (...values: unknown[]) => { logs.push(values.map(String).join(" ")); };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.includes("/messages:send")) {
      return new Response(JSON.stringify({ access_token: "fake-access", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    sendSignal = init?.signal instanceof AbortSignal ? init.signal : null;
    if (responseMode === "transport") throw new DOMException("fixture response lost", "AbortError");
    if (responseMode === "valid") {
      return new Response(JSON.stringify({ name: "projects/test/messages/direct-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (responseMode === "malformed") {
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("UNREGISTERED raw-provider-detail-must-not-log", { status: 404 });
  };

  const accepted = await fcm.sendFcmToDevice("fixture-device", { title: "Title", body: "Body", url: "/today" });
  assert.deepEqual(accepted, {
    kind: "provider_accepted",
    provider: "fcm",
    providerMessageId: "projects/test/messages/direct-1",
  });
  assert.ok(sendSignal, "direct FCM provider calls must have an abort timeout");

  responseMode = "malformed";
  const malformed = await fcm.sendFcmToDevice("fixture-device", { title: "Title", body: "Body" });
  assert.deepEqual(malformed, { kind: "uncertain", provider: "fcm", reason: "uncertain_provider_result", retryable: false });

  responseMode = "transport";
  const uncertain = await fcm.sendFcmToDevice("fixture-device", { title: "Title", body: "Body" });
  assert.deepEqual(uncertain, { kind: "uncertain", provider: "fcm", reason: "uncertain_provider_result", retryable: false });

  responseMode = "error";
  const gone = await fcm.sendFcmToDevice("fixture-device", { title: "Title", body: "Body" });
  assert.deepEqual(gone, { kind: "gone", provider: "fcm", reason: "fcm_404", retryable: false });
  assert.equal(logs.some((line) => line.includes("raw-provider-detail-must-not-log")), false);

  console.log("FCM_DIRECT_OK");
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}
