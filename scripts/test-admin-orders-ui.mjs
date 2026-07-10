import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SignJWT } from "jose";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(modulePath.startsWith("/") ? pathToFileURL(modulePath).href : modulePath);
const base = process.env.BASE_URL || "http://127.0.0.1:3355";
const client = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), user: env.PGUSER, password: env.PGPASSWORD, database: env.PGDATABASE });
let browser;
let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${message}`);
}

try {
  await client.connect();
  const adminEmail = String(env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).find(Boolean);
  const admin = adminEmail
    ? (await client.query(`SELECT id,email,current_org_id,COALESCE(session_version,0)::int AS sv FROM users WHERE lower(email)=lower($1) LIMIT 1`, [adminEmail])).rows[0]
    : null;
  check(!!admin, "admin account exists");
  const token = await new SignJWT({ userId: admin.id, email: admin.email, orgId: admin.current_org_id, sv: admin.sv })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));

  const api = await fetch(`${base}/api/admin/orders`, { headers: { cookie: `decode_auth=${token}` } });
  const data = await api.json();
  check(api.status === 200 && data.ok && Array.isArray(data.rows), "admin orders API loads");
  check(data.rows.some((row) => row.payment_state === "paid"), "API distinguishes paid orders");
  check(data.rows.some((row) => row.payment_state === "unpaid"), "API distinguishes unpaid orders");
  check(data.rows.some((row) => row.payment_state === "paid" && row.link_state === "complete"), "at least one paid order has complete credit/subscription linkage");

  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "decode_auth", value: token, url: base }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${base}/admin/orders`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    check(response && response.status() < 500, `${viewport.name} orders page loads`);
    await page.waitForFunction(() => document.body.innerText.includes("จ่ายแล้ว · PAID") && document.body.innerText.includes("ยังไม่จ่าย · UNPAID"), null, { timeout: 15_000 });
    const state = await page.evaluate(() => ({
      paid: document.body.innerText.includes("จ่ายแล้ว · PAID"),
      unpaid: document.body.innerText.includes("ยังไม่จ่าย · UNPAID"),
      linked: document.body.innerText.includes("เชื่อมครบ"),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    check(state.paid && state.unpaid && state.linked, `${viewport.name} renders payment and linkage badges`);
    check(state.overflow <= 2 && errors.length === 0, `${viewport.name} orders UI is stable`);
    await page.screenshot({ path: `/tmp/hourkey-admin-orders-${viewport.name}.png`, fullPage: false });
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => null);
  await client.end().catch(() => null);
}

console.log(`admin orders UI: ${passed} checks passed`);
