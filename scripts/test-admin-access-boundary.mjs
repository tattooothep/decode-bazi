import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return env;
}

const env = loadEnv();
const bases = (process.env.BASES || "http://127.0.0.1:3349,http://127.0.0.1:3350,http://127.0.0.1:3351,http://127.0.0.1:3352")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const client = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
});

let userId;
let orgId;

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

try {
  await client.connect();
  userId = crypto.randomUUID();
  orgId = crypto.randomUUID();
  const email = `admin-boundary-${Date.now()}@decode.test`;
  await client.query(
    `INSERT INTO users
       (id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,session_version,created_at)
     VALUES ($1,$2,'test-only','Admin boundary','th','Asia/Bangkok','dark',true,true,'free',1000,0,now())`,
    [userId, email]
  );
  await client.query(
    `INSERT INTO organizations(id,owner_user_id,name,slug,created_at)
     VALUES ($1,$2,'Admin boundary org',$3,now())`,
    [orgId, userId, `admin-boundary-${Date.now()}`]
  );
  await client.query(
    `INSERT INTO org_members(id,org_id,user_id,role,status,joined_at)
     VALUES (gen_random_uuid(),$1,$2,'owner','active',now())`,
    [orgId, userId]
  );
  await client.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);

  const secret = env.AUTH_SECRET;
  check(typeof secret === "string" && secret.length >= 16, "AUTH_SECRET is usable");
  const token = await new SignJWT({ userId, email, orgId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
  const headers = { cookie: `decode_auth=${token}` };

  const adminPages = ["/admin", "/admin/engine", "/admin/formulas", "/admin/library", "/admin/paraphrase", "/admin/sifu-prompts"];
  for (const base of bases) {
    for (const route of adminPages) {
      const page = await fetch(`${base}${route}`, { headers, redirect: "manual" });
      check([303, 307, 308].includes(page.status), `${base}${route} blocks org owner (${page.status})`);
      check((page.headers.get("location") || "").startsWith("/today"), `${base}${route} redirects non-admin to today`);
    }

    for (const route of ["/api/admin/orders", "/api/admin/settings", "/api/admin/members"]) {
      const response = await fetch(`${base}${route}`, { headers, redirect: "manual" });
      check(response.status === 403, `${base}${route} returns 403`);
    }
  }

  const adminEmail = String(env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).find(Boolean);
  const adminRow = adminEmail
    ? (await client.query(`SELECT id,email,current_org_id,COALESCE(session_version,0)::int AS sv FROM users WHERE lower(email)=lower($1) LIMIT 1`, [adminEmail])).rows[0]
    : null;
  check(!!adminRow, "break-glass admin account exists");
  const adminToken = await new SignJWT({ userId: adminRow.id, email: adminRow.email, orgId: adminRow.current_org_id, sv: adminRow.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
  for (const base of bases) {
    const response = await fetch(`${base}/api/admin/orders`, { headers: { cookie: `decode_auth=${adminToken}` } });
    check(response.status === 200, `${base} keeps break-glass admin access`);
  }
} finally {
  if (userId) {
    await client.query(`DELETE FROM admin_user_roles WHERE user_id=$1`, [userId]).catch(() => null);
    await client.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => null);
    await client.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
  }
  if (orgId) await client.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
  if (userId) await client.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
  await client.end().catch(() => null);
}
