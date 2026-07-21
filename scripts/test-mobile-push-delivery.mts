import crypto from "node:crypto";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}

const { pool } = await import("../src/lib/db.ts");
const { checkMobilePushReceipts, sendMobilePushToUser } = await import("../src/lib/mobile-push.ts");

const userId = crypto.randomUUID();
const installationId = crypto.randomUUID();
const tokenId = crypto.randomUUID();
const ticketId = crypto.randomUUID();
const email = `mobile-push-delivery-${Date.now()}@example.test`;
const originalFetch = globalThis.fetch;
let checks = 0;

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

try {
  await pool.query(
    `INSERT INTO users(id,email,name,is_active,tier,hour_balance,session_version,created_at)
     VALUES($1,$2,'Push Delivery',true,'free',1000,0,now())`,
    [userId, email]
  );
  await pool.query(
    `INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,platform,locale)
     VALUES($1,$2,$3,'ExponentPushToken[deliveryabcdefghijkl]','android','th')`,
    [tokenId, userId, installationId]
  );

  let sentBody: unknown = null;
  globalThis.fetch = async (_input, init) => {
    sentBody = JSON.parse(String(init?.body || "null"));
    return new Response(JSON.stringify({ data: [{ status: "ok", id: ticketId }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const sent = await sendMobilePushToUser(userId, {
    title: "Hourkey",
    body: "มีข้อความใหม่",
    url: "https://malicious.example/path",
    tag: "support",
  });
  check(sent.accepted === 1 && sent.failed === 0, "Expo transport accepts one native notification");
  const messages = sentBody as Array<{ data?: { url?: string } }>;
  check(messages[0]?.data?.url === "/today", "unsafe notification targets are replaced with an in-app route");
  let row = await pool.query(`SELECT status FROM mobile_push_receipts WHERE ticket_id=$1`, [ticketId]);
  check(row.rows[0]?.status === "pending", "accepted ticket is queued for a delivery receipt check");

  await pool.query(`UPDATE mobile_push_receipts SET available_at=now()-interval '1 minute' WHERE ticket_id=$1`, [ticketId]);
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: { [ticketId]: { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } } },
  }), { status: 200, headers: { "content-type": "application/json" } });
  const receipts = await checkMobilePushReceipts();
  check(receipts.checked === 1 && receipts.removed === 1, "receipt worker handles DeviceNotRegistered");
  row = await pool.query(`SELECT enabled,disabled_at IS NOT NULL AS disabled FROM mobile_push_tokens WHERE id=$1`, [tokenId]);
  check(row.rows[0]?.enabled === false && row.rows[0]?.disabled === true, "unregistered device token is disabled automatically");
  console.log(`${checks} mobile push delivery checks passed`);
} finally {
  globalThis.fetch = originalFetch;
  await pool.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
  await pool.end().catch(() => null);
}
