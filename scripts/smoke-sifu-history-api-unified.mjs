import { request as httpRequest } from "node:http";
import nextEnv from "@next/env";
import { SignJWT } from "jose";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const BASE_URL = process.env.SIFU_HISTORY_PROOF_BASE_URL || "http://127.0.0.1:3349";

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
});

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(new URL(url), {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      timeout: 120_000,
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => {
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 400) }; }
        resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, data });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

const sample = await pool.query(`
  SELECT m.user_id, u.email, m.org_id, m.profile_id
    FROM research_ai_messages m
    LEFT JOIN users u ON u.id=m.user_id
   WHERE m.profile_id IS NOT NULL
     AND m.user_id IS NOT NULL
     AND m.feature='sifu_group'
   ORDER BY m.created_at DESC
   LIMIT 1
`);

if (!sample.rows[0]) {
  console.log(JSON.stringify({ ok: true, skipped: "no sifu_group sample row" }, null, 2));
  await pool.end();
  process.exit(0);
}

const row = sample.rows[0];
const token = await new SignJWT({
  userId: row.user_id,
  email: row.email || "smoke@example.local",
  orgId: row.org_id,
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

const qs = `profileId=${encodeURIComponent(row.profile_id)}&limit=120`;
const desktop = await getJson(`${BASE_URL}/api/sifu/history?${qs}`, {
  Cookie: `decode_auth=${token}`,
});
const mobile = await getJson(`${BASE_URL}/api/mobile/v1/sifu/history?${qs}`, {
  Authorization: `Bearer ${token}`,
});

const desktopRows = Array.isArray(desktop.data.history) ? desktop.data.history : [];
const mobileRows = Array.isArray(mobile.data.history) ? mobile.data.history : [];
const features = (rows) => rows.reduce((acc, r) => {
  acc[r.feature || "unknown"] = (acc[r.feature || "unknown"] || 0) + 1;
  return acc;
}, {});
const desktopIds = desktopRows.map(r => r.id).join("|");
const mobileIds = mobileRows.map(r => r.id).join("|");
const pass = desktop.ok && mobile.ok && desktopRows.length === mobileRows.length && desktopIds === mobileIds && desktopRows.some(r => r.feature === "sifu_group");

console.log(JSON.stringify({
  pass,
  profile_id: row.profile_id,
  desktop: { status: desktop.status, count: desktopRows.length, features: features(desktopRows) },
  mobile: { status: mobile.status, count: mobileRows.length, features: features(mobileRows), source: mobile.data.source },
  same_order: desktopIds === mobileIds,
}, null, 2));

await pool.end();
process.exit(pass ? 0 : 1);
