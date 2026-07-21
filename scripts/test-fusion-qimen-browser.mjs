import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
const outputDir = process.env.OUTPUT_DIR || "/tmp/hourkey-fusion-qimen";
fs.mkdirSync(outputDir, { recursive: true });

const plans = ["free", "trial", "premium", "master"];
const client = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), user: env.PGUSER, password: env.PGPASSWORD, database: env.PGDATABASE });
const fixtures = [];
let browser;
let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${message}`);
}

try {
  await client.connect();
  for (const plan of plans) {
    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const email = `fq-browser-${plan}-${Date.now()}@decode.test`;
    await client.query(
      `INSERT INTO users(id,email,password_hash,name,tier,hour_balance,trial_ends_at,sub_expires_at,locale,timezone,theme,email_verified,is_active,session_version,created_at)
       VALUES($1,$2,'test-only',$3,$4,10000,$5,$6,'th','Asia/Bangkok','dark',true,true,0,now())`,
      [
        userId,
        email,
        `FQ ${plan}`,
        plan === "premium" || plan === "master" ? plan : "free",
        plan === "trial" ? new Date(Date.now() + 7 * 86400000) : new Date(Date.now() - 86400000),
        plan === "premium" || plan === "master" ? new Date(Date.now() + 7 * 86400000) : null,
      ]
    );
    await client.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,$3,$4,now())`, [orgId, userId, `FQ ${plan}`, orgId.slice(0, 8)]);
    await client.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now())`, [orgId, userId]);
    await client.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
    const token = await new SignJWT({ userId, email, orgId, sv: 0 })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m")
      .sign(new TextEncoder().encode(env.AUTH_SECRET));
    fixtures.push({ plan, userId, orgId, token });
  }

  browser = await chromium.launch({ headless: true });
  for (const fixture of fixtures) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: "decode_auth", value: fixture.token, url: base }]);

    const qimen = await context.newPage();
    const qimenErrors = [];
    qimen.on("pageerror", (error) => qimenErrors.push(error.message));
    const qimenResponse = await qimen.goto(`${base}/qimen`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    check(qimenResponse && qimenResponse.status() < 500, `${fixture.plan} Qi Men loads`);
    await qimen.waitForFunction(() => window.HK_PRODUCT?.ready === true && !!window.HK_QIMEN_PAGE_CAPS, null, { timeout: 15_000 });
    await qimen.waitForTimeout(2200);
    const qs = await qimen.evaluate(() => ({
      plan: window.HK_PRODUCT?.plan,
      detail: window.HK_QIMEN_PAGE_CAPS?.detail,
      dateLocked: ["t-year", "t-month", "t-day"].every((id) => document.getElementById(id)?.dataset.locked === "1"),
      hourLocked: document.getElementById("t-hour")?.dataset.locked === "1",
      detailLocked: document.getElementById("panel-detail")?.dataset.locked === "1",
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    const expectedDetail = { free: "basic", trial: "beginner", premium: "pro", master: "technical" }[fixture.plan];
    check(qs.plan === fixture.plan && qs.detail === expectedDetail, `${fixture.plan} Qi Men receives ${expectedDetail} caps`);
    check(qs.dateLocked === ["free", "trial"].includes(fixture.plan), `${fixture.plan} Qi Men date lock matches plan`);
    check(qs.hourLocked === (fixture.plan === "free"), `${fixture.plan} Qi Men hour lock matches plan`);
    check(qs.detailLocked === (fixture.plan === "free"), `${fixture.plan} Qi Men detail preview matches plan`);
    check(qs.overflow <= 2 && qimenErrors.length === 0, `${fixture.plan} Qi Men mobile UI is stable`);
    await qimen.screenshot({ path: path.join(outputDir, `${fixture.plan}-qimen.png`) });
    await qimen.close();

    const fusion = await context.newPage();
    const fusionErrors = [];
    fusion.on("pageerror", (error) => fusionErrors.push(error.message));
    const fusionResponse = await fusion.goto(`${base}/master-fusion`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    check(fusionResponse && fusionResponse.status() < 500, `${fixture.plan} Fusion loads`);
    await fusion.waitForFunction(() => {
      const badge = document.getElementById("gate-badge");
      return badge && (badge.textContent.includes("LOCKED") || badge.textContent.includes("ADD CHART"));
    }, null, { timeout: 15_000 });
    const fsState = await fusion.evaluate(() => ({
      badge: document.getElementById("gate-badge")?.textContent || "",
      sendDisabled: document.getElementById("send")?.disabled === true,
      profile: document.getElementById("profile")?.value || "",
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    check(fixture.plan === "free" ? fsState.badge.includes("LOCKED") : fsState.badge.includes("ADD CHART"), `${fixture.plan} Fusion gate is explicit`);
    check(fsState.sendDisabled && fsState.profile === "", `${fixture.plan} Fusion cannot run without a real subject`);
    check(fsState.overflow <= 2 && fusionErrors.length === 0, `${fixture.plan} Fusion mobile UI is stable`);
    await fusion.screenshot({ path: path.join(outputDir, `${fixture.plan}-fusion.png`) });
    await fusion.close();
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => null);
  for (const fixture of fixtures.reverse()) {
    await client.query(`DELETE FROM org_members WHERE user_id=$1`, [fixture.userId]).catch(() => null);
    await client.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [fixture.userId]).catch(() => null);
    await client.query(`DELETE FROM organizations WHERE id=$1`, [fixture.orgId]).catch(() => null);
    await client.query(`DELETE FROM users WHERE id=$1`, [fixture.userId]).catch(() => null);
  }
  await client.end().catch(() => null);
}

console.log(`fusion-qimen browser: ${passed} checks passed`);
