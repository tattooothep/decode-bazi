import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { SignJWT } from "jose";

const BASE = process.env.HK_GATE_BASE || "http://127.0.0.1:3353";
const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error("AUTH_SECRET required");

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

function bangkokNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function otherShichen(time) {
  const hour = Number(time.slice(0, 2));
  return `${String((hour + 4) % 24).padStart(2, "0")}:00`;
}

async function request(token, path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Cookie: `decode_auth=${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function main() {
  const client = new pg.Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await client.connect();
  const rows = [];
  try {
    for (const plan of ["free", "trial", "premium", "master"]) {
      const userId = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const email = `gate-${plan}-${Date.now()}-${Math.random().toString(36).slice(2)}@hourkey.test`;
      await client.query(
        `INSERT INTO users (id,email,password_hash,name,tier,hour_balance,trial_ends_at,sub_expires_at,locale,timezone,theme,email_verified,is_active,created_at)
         VALUES ($1,$2,'x',$3,$4,1000,$5,$6,'th','Asia/Bangkok','dark',true,true,now())`,
        [
          userId, email, `Gate ${plan}`,
          plan === "premium" || plan === "master" ? plan : "free",
          plan === "trial" ? new Date(Date.now() + 7 * 86400000) : new Date(Date.now() - 86400000),
          plan === "premium" || plan === "master" ? new Date(Date.now() + 7 * 86400000) : null,
        ]
      );
      await client.query(
        `INSERT INTO organizations (id,owner_user_id,name,slug,created_at) VALUES ($1,$2,$3,$4,now())`,
        [orgId, userId, `Gate ${plan}`, orgId.slice(0, 8)]
      );
      await client.query(
        `INSERT INTO org_members (id,org_id,user_id,role,status,joined_at,created_at)
         VALUES (gen_random_uuid(),$1,$2,'owner','active',now(),now())`,
        [orgId, userId]
      );
      await client.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
      const token = await new SignJWT({ userId, email, orgId, sv: 0 })
        .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m")
        .sign(new TextEncoder().encode(secret));
      rows.push({ plan, userId, orgId, token });
    }

    const now = bangkokNow();
    const byPlan = Object.fromEntries(rows.map((row) => [row.plan, row]));
    const q = async (plan, date = now.date, time = now.time) => request(
      byPlan[plan].token,
      `/api/qimen?date=${date}&time=${time}&school=chaibu`
    );

    const free = await q("free");
    check("Free current Qi Men succeeds", free.status === 200, String(free.status));
    check("Free response is basic", free.body.product?.qimen?.detail === "basic");
    check("Free response strips beginner detail", !free.body.data?.palaces?.[0]?.beginner_reading);
    const freeHour = await q("free", now.date, otherShichen(now.time));
    check("Free other hour denied", freeHour.status === 403 && freeHour.body.code === "qimen_hour_locked");

    const trial = await q("trial", now.date, otherShichen(now.time));
    check("Trial all-hours Qi Men succeeds", trial.status === 200, String(trial.status));
    check("Trial response is beginner", trial.body.product?.qimen?.detail === "beginner");
    check("Trial keeps beginner reading", !!trial.body.data?.palaces?.[0]?.beginner_reading);
    check("Trial strips advanced layer", !trial.body.data?.advanced_qimen_layers);
    const trialTomorrow = await q("trial", shiftDate(now.date, 1), now.time);
    check("Trial outside today denied", trialTomorrow.status === 403 && trialTomorrow.body.code === "qimen_time_window_locked");

    const premium = await q("premium");
    check("Premium Qi Men succeeds", premium.status === 200, String(premium.status));
    check("Premium response is pro", premium.body.product?.qimen?.detail === "pro");
    check("Premium keeps advanced layer", !!premium.body.data?.advanced_qimen_layers);
    check("Premium strips technical source trace", !premium.body.data?.chart?.qimen_source_trace);
    const premiumFar = await q("premium", shiftDate(now.date, 91), now.time);
    check("Premium over 90 days denied", premiumFar.status === 403 && premiumFar.body.code === "qimen_time_window_locked");

    const master = await q("master");
    check("Master Qi Men succeeds", master.status === 200, String(master.status));
    check("Master response is technical", master.body.product?.qimen?.detail === "technical");
    check("Master keeps technical source trace", !!master.body.data?.chart?.qimen_source_trace);

    const fusionFree = await request(byPlan.free.token, "/api/sifu/fusion5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestBirths: [{ name: "Gate", birthDate: "1990-01-02", birthTime: "12:00", gender: "M", lat: 13.7563, lng: 100.5018 }],
        sciences: ["bazi", "western"], question: "ทดสอบสิทธิ์", lang: "th",
      }),
    });
    check("Free Fusion direct API denied", fusionFree.status === 403 && fusionFree.body.code === "fusion_suite_locked");

    const fusionUi = fs.readFileSync(new URL("../public/master-fusion.html", import.meta.url), "utf8");
    const qimenUi = fs.readFileSync(new URL("../public/js/hk-product-caps.js", import.meta.url), "utf8");
    check("Fusion UI checks suite gate", fusionUi.includes("fusionSuiteAllowed()"));
    check("Qi Men UI uses v2 page caps", qimenUi.includes("caps.pages && caps.pages.qimen"));
    check("Qi Men UI shows preview lock", qimenUi.includes("lockPreviewEl(detailPanel, \"Trial\")"));
  } finally {
    for (const row of rows.reverse()) {
      await client.query(`DELETE FROM org_members WHERE user_id=$1`, [row.userId]).catch(() => {});
      await client.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [row.userId]).catch(() => {});
      await client.query(`DELETE FROM organizations WHERE id=$1`, [row.orgId]).catch(() => {});
      await client.query(`DELETE FROM users WHERE id=$1`, [row.userId]).catch(() => {});
    }
    await client.end();
  }
  console.log(`fusion-qimen entitlements: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
