/**
 * ด่านตรวจตัวส่งกลาง — ต้องส่งตรง ไม่ผ่านคนกลางที่ไม่เคยสำเร็จ
 *
 * บันทึกจริง: ตัวยิงเดิมส่งผ่านบริการกลาง 480 รอบ ได้ expo_ok=0 ทุกรอบ
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../src/lib/push-send.cjs");

let passed = 0;
function check(label: string, run: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(run()).then(() => {
    passed += 1;
    console.log(`  ✅ ${label}`);
  });
}

console.log("── กุญแจต้องอยู่นอกโปรเจกต์ ──");

await check("🔴 กุญแจต้องไม่อยู่ในโปรเจกต์และไม่อยู่ใน git", () => {
  assert.ok(S.KEY_PATH.startsWith("/root/secrets/"), `กุญแจอยู่ที่ ${S.KEY_PATH}`);
  assert.ok(!S.KEY_PATH.includes("/decode-app/"), "กุญแจอยู่ในโปรเจกต์ = หลุดเข้า git ได้");
});

await check("อ่านกุญแจได้จริง (ถ้าไม่ได้ ตัวยิงจะส่งไม่ออกทั้งระบบ)", () => {
  assert.equal(S.isReady(), true, "อ่านกุญแจไม่ได้");
});

console.log("── นับผลให้ครบ ห้ามเงียบ ──");

await check("🔴 เครื่องที่ยังไม่มีกุญแจส่งตรง ต้องนับแยก ไม่ใช่เงียบ", async () => {
  // ผู้ใช้ที่ยังไม่ได้ลงแอพรุ่นใหม่จะอยู่กลุ่มนี้ ต้องเห็นตัวเลข
  const r = await S.sendAll([
    { deviceToken: "", title: "ก", body: "ข" },
    { deviceToken: "   ", title: "ก", body: "ข" },
  ], { dry: true });
  assert.equal(r.noToken, 2, `นับได้ ${r.noToken} ควรเป็น 2`);
  assert.equal(r.sent, 0);
});

await check("ชุดว่างต้องไม่ล้ม", async () => {
  const r = await S.sendAll([], { dry: true });
  assert.deepEqual(r, { sent: 0, failed: 0, gone: 0, noToken: 0 });
  const r2 = await S.sendAll(null as never, { dry: true });
  assert.equal(r2.sent, 0);
});

await check("โหมดไม่ส่งจริงต้องไม่ยิงออกไปจริง", async () => {
  const r = await S.sendAll([{ deviceToken: "ปลอม", title: "ก", body: "ข" }], { dry: true });
  assert.equal(r.sent, 1, "โหมดทดสอบควรนับว่าจะส่ง");
  assert.equal(r.failed, 0, "โหมดทดสอบไม่ควรยิงจริงแล้วล้ม");
});

await check("provider adapter เก็บ message ID/ticket และไม่เรียก HTTP success ว่า delivered", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: unknown }> = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      let requestBody: unknown = null;
      if (init?.body) {
        try { requestBody = JSON.parse(String(init.body)); }
        catch { requestBody = String(init.body); }
      }
      requests.push({ url, body: requestBody });
      if (url.includes("/messages:send")) {
        return new Response(JSON.stringify({ name: "projects/test/messages/provider-id" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("getReceipts")) {
        return new Response(JSON.stringify({ data: { "expo-provider-ticket": { status: "ok" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("exp.host")) {
        return new Response(JSON.stringify({ data: { status: "ok", id: "expo-provider-ticket" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ access_token: "fake-access", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const fcmMessage = S.prepareMessage({ title: "Exact", body: "FCM", category: "daily", url: "/today" }, "fcm");
    const fcm = await S.sendPrepared({ provider: "fcm", deviceToken: "credential-only-at-send", providerMessage: fcmMessage });
    assert.equal(fcm.kind, "provider_accepted");
    assert.equal(fcm.providerMessageId, "projects/test/messages/provider-id");
    assert.equal(JSON.stringify(fcmMessage).includes("credential-only-at-send"), false);

    const expoMessage = S.prepareMessage({ title: "Exact", body: "Expo", category: "daily", url: "/today" }, "expo");
    const expo = await S.sendPrepared({ provider: "expo", expoToken: "ExponentPushToken[credential-only-at-send]", providerMessage: expoMessage });
    assert.equal(expo.kind, "provider_accepted");
    assert.equal(expo.providerTicketId, "expo-provider-ticket");
    const receipts = await S.pollExpoReceipts(["expo-provider-ticket"]);
    assert.equal(receipts["expo-provider-ticket"].kind, "delivered");
    assert.ok(requests.some((request) => request.url.includes("/messages:send")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check("Retry-After จาก provider ถูกแปลงเป็นวินาทีสำหรับ durable backoff", () => {
  assert.equal(S.parseRetryAfterSeconds("17"), 17);
  assert.equal(S.parseRetryAfterSeconds("invalid"), null);
});

console.log("── ตัวยิงต้องเลิกใช้คนกลาง ──");

const CRONS = [
  "scripts/mobile-yam-push-cron.cjs",
  "scripts/mobile-daily-fortune-push-cron.cjs",
  "scripts/mobile-monthly-report-push-cron.cjs",
  "scripts/mobile-network-morning-push-cron.cjs",
  "scripts/mobile-auspicious-push-cron.cjs",
  "scripts/mobile-personal-reminders-cron.cjs",
];

await check("🔴 ห้ามเหลือการยิงไปบริการกลางในตัวยิงตัวไหนเลย", () => {
  for (const path of CRONS) {
    const src = readFileSync(path, "utf8");
    assert.ok(
      !/exp\.host\/--\/api\/v2\/push\/send/.test(src),
      `${path}: ยังยิงไปบริการกลางที่ไม่เคยสำเร็จ 480 รอบ`,
    );
  }
});

await check("🔴 ตัวยิงทุกตัวต้องเรียกตัวส่งกลาง", () => {
  for (const path of CRONS) {
    const src = readFileSync(path, "utf8");
    assert.ok(/push-send|mobile-notification-delivery/.test(src), `${path}: ไม่ได้เรียกตัวส่งกลาง`);
  }
});

await check("🔴 ตัวยิงทุกตัวต้องผ่านตัวคุมก่อนส่ง", () => {
  for (const path of CRONS) {
    const src = readFileSync(path, "utf8");
    assert.ok(/guard\.mayNotify\(/.test(src), `${path}: ไม่ได้ผ่านตัวคุม`);
  }
});

console.log("── เครื่องตายต้องลบทิ้ง ──");

await check("🔴 ต้องมีทางปิดกุญแจเครื่องที่ไม่รับแล้ว", () => {
  const src = readFileSync("src/lib/push-send.cjs", "utf8");
  assert.ok(/UPDATE mobile_push_tokens SET enabled = false/.test(src),
    "เครื่องถอนแอพแล้วยังยิงไปเรื่อยๆ");
  // แต่ต้องแยก "ไม่รับแล้ว" ออกจาก "เน็ตสะดุด" ไม่งั้นลบกุญแจดีทิ้ง
  assert.ok(/kind: "gone"/.test(src) && /kind: "failed"/.test(src),
    "เหมารวมทุกความล้มเหลว = ลบกุญแจดีทิ้งเพราะเน็ตสะดุดครั้งเดียว");
});

console.log(`\n✅ ผ่านทั้งหมด ${passed} ข้อ`);
