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

const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(playwrightModule.startsWith("/") ? pathToFileURL(playwrightModule).href : playwrightModule);
const base = process.env.BASE_URL || "http://127.0.0.1:3354";
const outputDir = process.env.OUTPUT_DIR || "/tmp/hourkey-identity-matrix";
fs.mkdirSync(outputDir, { recursive: true });

const routes = [
  "/chart",
  "/today",
  "/calendar",
  "/network",
  "/master",
  "/datepick",
  "/qimen",
  "/master-fusion",
  "/uranian",
  "/luopan",
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];
const sentinel = `LEAK_SENTINEL_NIGHT_${Date.now()}`;
const staleProfileId = crypto.randomUUID();
const staleBirth = {
  name: sentinel,
  date: "1984-12-31",
  time: "06:15",
  place: "STALE_ACCOUNT_PLACE",
  longitude: 100.5018,
  latitude: 13.7563,
  gender: "M",
  profileId: staleProfileId,
  birthTimeKnown: true,
};

const client = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
});
let userId;
let orgId;
let passed = 0;

function check(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${message}`);
}

let browser;
try {
  await client.connect();
  userId = crypto.randomUUID();
  orgId = crypto.randomUUID();
  const email = `identity-browser-${Date.now()}@decode.test`;
  await client.query(
    `INSERT INTO users
       (id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,session_version,created_at)
     VALUES ($1,$2,'test-only','Identity browser','th','Asia/Bangkok','dark',true,true,'free',1000,0,now())`,
    [userId, email]
  );
  await client.query(
    `INSERT INTO organizations(id,owner_user_id,name,slug,created_at)
     VALUES ($1,$2,'Identity browser org',$3,now())`,
    [orgId, userId, `identity-browser-${Date.now()}`]
  );
  await client.query(
    `INSERT INTO org_members(id,org_id,user_id,role,status,joined_at)
     VALUES (gen_random_uuid(),$1,$2,'owner','active',now())`,
    [orgId, userId]
  );
  await client.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);

  const token = await new SignJWT({ userId, email, orgId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));

  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport });
      await context.addCookies([{ name: "decode_auth", value: token, url: base }]);
      const page = await context.newPage();
      await page.addInitScript(({ birth, profileId }) => {
        localStorage.setItem("hk_birth", JSON.stringify(birth));
        localStorage.setItem("hk_profile_name", birth.name);
        localStorage.setItem("hk_profile_id", profileId);
        localStorage.setItem("hk_user_yongshen", JSON.stringify([{ element: "fire" }]));
        localStorage.setItem("hk_view_as_xfer", JSON.stringify({ ...birth, id: profileId, birthDate: birth.date, birthTime: birth.time, ts: Date.now() }));
        sessionStorage.setItem("hk_birth", JSON.stringify(birth));
        sessionStorage.setItem("hk_view_as", JSON.stringify({ ...birth, id: profileId, birthDate: birth.date, birthTime: birth.time }));
      }, { birth: staleBirth, profileId: staleProfileId });

      const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      check(response && response.status() < 500, `${viewport.name} ${route} loads without server error`);
      await page.waitForTimeout(2200);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      check(!bodyText.includes(sentinel), `${viewport.name} ${route} does not render stale account name`);
      check(!bodyText.includes("STALE_ACCOUNT_PLACE"), `${viewport.name} ${route} does not render stale birth place`);

      if (route === "/chart") {
        check(await page.locator("#hk-no-profile").count() === 1, `${viewport.name} chart shows no-profile state`);
      }
      if (route === "/today") {
        check(await page.locator("#t-no-profile").count() === 1, `${viewport.name} today shows no-profile state`);
        check(await page.locator("#hk-basic-bazi").evaluate((el) => getComputedStyle(el).display === "none"), `${viewport.name} today hides natal BaZi`);
        check(await page.locator(".hero").evaluate((el) => getComputedStyle(el).display === "none"), `${viewport.name} today hides personal verdict`);
      }
      if (route === "/calendar") {
        check(await page.locator('#overlay-toggle button[data-mode="personal"]').isDisabled(), `${viewport.name} calendar disables personal overlay`);
      }
      if (route === "/master-fusion") {
        check(await page.locator("#profile").inputValue().catch(() => "") === "", `${viewport.name} fusion has no default profile`);
      }
      if (route === "/uranian") {
        check(await page.locator("#profileSel").inputValue().catch(() => "") === "", `${viewport.name} uranian has no default profile`);
      }

      const filename = `${viewport.name}-${route.slice(1).replaceAll("/", "-") || "home"}.png`;
      await page.screenshot({ path: path.join(outputDir, filename), fullPage: false });
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close().catch(() => null);
  if (userId) {
    await client.query(`DELETE FROM admin_user_roles WHERE user_id=$1`, [userId]).catch(() => null);
    await client.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => null);
    await client.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
  }
  if (orgId) await client.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
  if (userId) await client.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
  await client.end().catch(() => null);
}

console.log(`identity browser matrix: ${passed} checks passed`);
