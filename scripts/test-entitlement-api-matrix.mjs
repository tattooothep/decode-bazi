import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { q } from "../src/lib/db.ts";
import { PRODUCT_PAGE_ENTITLEMENTS } from "../src/lib/product-page-entitlements.ts";

if (process.env.HK_ALLOW_FIXTURE_DB !== "1") {
  throw new Error("Set HK_ALLOW_FIXTURE_DB=1; fixtures are temporary and deleted in finally");
}

const BASE = process.env.HK_MATRIX_BASE || "http://127.0.0.1:3360";
const authSecret = process.env.AUTH_SECRET;
assert.ok(authSecret && authSecret.length >= 16, "AUTH_SECRET env is required");
const secret = new TextEncoder().encode(authSecret);
const now = Date.now();
const fixtures = [
  { plan: "free", tier: "free", trial: new Date(now - 86400000), sub: null },
  { plan: "trial", tier: "free", trial: new Date(now + 7 * 86400000), sub: null },
  { plan: "premium", tier: "premium", trial: null, sub: new Date(now + 20 * 86400000) },
  { plan: "master", tier: "master", trial: null, sub: new Date(now + 20 * 86400000) },
].map((fixture) => ({
  ...fixture,
  id: randomUUID(),
  orgId: randomUUID(),
  profileId: randomUUID(),
  email: `codex.api.matrix.${fixture.plan}.${Date.now()}@example.invalid`,
}));

const pillars = {
  year: { stem: "庚", branch: "午" },
  month: { stem: "己", branch: "丑" },
  day: { stem: "庚", branch: "午" },
  hour: { stem: "壬", branch: "午" },
};

function bangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "Asia/Bangkok", year: "numeric",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function isoDate(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

async function signFixture(fixture) {
  return new SignJWT({ userId: fixture.id, email: fixture.email, orgId: fixture.orgId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

async function request(fixture, path, init = {}, bearer = false) {
  const headers = new Headers(init.headers || {});
  if (bearer) headers.set("Authorization", `Bearer ${fixture.token}`);
  else headers.set("Cookie", `decode_auth=${fixture.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(BASE + path, { ...init, headers });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 400) }; }
  return { response, data };
}

function addDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
}

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

try {
  for (const fixture of fixtures) {
    await q(
      `INSERT INTO users(id,email,name,tier,hour_balance,is_active,email_verified,trial_ends_at,sub_expires_at,current_org_id,created_at)
       VALUES($1,$2,$3,$4,10000,true,true,$5,$6,$7,now())`,
      [fixture.id, fixture.email, `API Matrix ${fixture.plan}`, fixture.tier, fixture.trial, fixture.sub, fixture.orgId]
    ).catch(async () => {
      await q(
        `INSERT INTO users(id,email,name,tier,hour_balance,is_active,email_verified,trial_ends_at,sub_expires_at,created_at)
         VALUES($1,$2,$3,$4,10000,true,true,$5,$6,now())`,
        [fixture.id, fixture.email, `API Matrix ${fixture.plan}`, fixture.tier, fixture.trial, fixture.sub]
      );
    });
    await q(
      `INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,$3,$4,now())`,
      [fixture.orgId, fixture.id, `API Matrix ${fixture.plan}`, `api-matrix-${fixture.id.slice(0, 8)}`]
    ).catch(() => q(`INSERT INTO organizations(id,name) VALUES($1,$2)`, [fixture.orgId, `API Matrix ${fixture.plan}`]));
    await q(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [fixture.orgId, fixture.id]);
    await q(
      `INSERT INTO org_members(id,org_id,user_id,role,status,joined_at,created_at)
       VALUES(gen_random_uuid(),$1,$2,'owner','active',now(),now()) ON CONFLICT DO NOTHING`,
      [fixture.orgId, fixture.id]
    );
    await q(
      `INSERT INTO profiles(id,org_id,created_by_user_id,name,relationship_type,birth_datetime,birth_lat,birth_lng,gender,birth_time_known,day_boundary,is_archived,bazi_pillars,created_at,updated_at)
       VALUES($1,$2,$3,$4,NULL,'1990-01-15T12:00:00+07:00',13.7563,100.5018,'M',true,'23:00',false,$5,now(),now())`,
      [fixture.profileId, fixture.orgId, fixture.id, `Matrix ${fixture.plan}`, JSON.stringify({ pillars, day_boundary: "23:00" })]
    );
    fixture.token = await signFixture(fixture);
  }

  const current = bangkokParts();
  const date = isoDate(current);
  const futureDate = addDays(current, 2);
  const chartBody = JSON.stringify({ date: "1990-01-15", time: "12:00", longitude: 100.5018, gender: "M", birthTimeKnown: true, dayBoundary: "23:00" });
  const todayBody = JSON.stringify({ date, userChart: pillars, yongshen: ["water"], jishen: ["fire"] });
  const other = (id) => ({ id, ...pillars });

  for (const fixture of fixtures) {
    const caps = PRODUCT_PAGE_ENTITLEMENTS[fixture.plan];
    let r = await request(fixture, "/api/account/me");
    check(r.response.status === 200 && r.data.plan === fixture.plan, `${fixture.plan} account plan`);
    check(r.data.product?.trial_days === 14 && r.data.product?.free_signup_yam === 1000, `${fixture.plan} trial contract`);
    check(r.data.caps?.contract_version === "entitlements-v3-20260711", `${fixture.plan} contract version`);
    check(r.data.caps?.fusion_suite === caps.fusion.enabled, `${fixture.plan} fusion enabled alias`);
    check(r.data.caps?.fusion_max_sciences === caps.fusion.max_sciences, `${fixture.plan} fusion max alias`);
    check(r.data.caps?.book_max_sciences === caps.book.max_sciences, `${fixture.plan} book max alias`);
    check(r.data.caps?.luopan_vision_max === caps.luopan.vision_limit, `${fixture.plan} vision alias`);

    r = await request(fixture, "/api/chart", { method: "POST", body: chartBody });
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} chart status`);
    check(r.data.entitlement?.detail === caps.chart.detail && r.data.entitlement?.luck_cycles === caps.chart.luck_cycles, `${fixture.plan} chart shape`);
    check(fixture.plan !== "master" || r.data.entitlement?.technical_detail === true, `${fixture.plan} chart technical`);

    r = await request(fixture, "/api/today/hours", { method: "POST", body: todayBody });
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} today status`);
    check(r.data.hours.filter((hour) => !hour.locked).length === caps.today.detailed_hours, `${fixture.plan} today detailed hours`);
    check(fixture.plan === "master" || r.data.liushi === null, `${fixture.plan} today technical hidden`);

    r = await request(fixture, `/api/today/hours`, { method: "POST", body: JSON.stringify({ ...JSON.parse(todayBody), date: futureDate }) });
    check(r.response.status === (caps.today.day_window >= 2 ? 200 : 403), `${fixture.plan} today date window`);

    r = await request(fixture, `/api/calendar?year=${current.year}&month=${current.month}&dm=庚`);
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} calendar status`);
    check(r.data.entitlement?.ranked_days === caps.calendar.ranked_days && r.data.entitlement?.pdf === caps.calendar.pdf, `${fixture.plan} calendar shape`);
    check((r.data.entitlement?.allowed_intents || []).length === (caps.calendar.intents === "one" ? 1 : 15), `${fixture.plan} calendar intents`);

    r = await request(fixture, "/api/fengshui-snapshot");
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} fengshui status`);
    check(r.data.entitlement?.layers === caps.fengshui.layers, `${fixture.plan} fengshui layer contract`);
    const layerKeys = Object.keys(r.data.layers || {});
    check((caps.fengshui.layers === "professional") === layerKeys.includes("qi_men"), `${fixture.plan} fengshui professional layer`);
    check((caps.fengshui.layers === "full" || caps.fengshui.layers === "professional") === layerKeys.includes("ai_xing"), `${fixture.plan} fengshui full layer`);

    const others = [1, 2, 3, 4].map((index) => other(`other-${index}`));
    r = await request(fixture, "/api/network/score", { method: "POST", body: JSON.stringify({ purpose: "visualization", self: pillars, others }) });
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} network status`);
    const allowedOthers = Math.min(others.length, Math.max(0, caps.network.visualization_profiles - 1));
    check((r.data.entitlement?.locked_profile_ids || []).length === others.length - allowedOthers, `${fixture.plan} network cap`);
    check((fixture.plan === "premium" || fixture.plan === "master") === Object.hasOwn(r.data, "guidance"), `${fixture.plan} network detail shape`);

    r = await request(fixture, "/api/network/score", { method: "POST", body: JSON.stringify({ purpose: "pair_compare", self: pillars, others: [other("pair-1")] }) });
    if (r.response.status !== (fixture.plan === "free" ? 403 : 200)) {
      console.error("pair compare mismatch", fixture.plan, r.response.status, r.data);
    }
    check(r.response.status === (fixture.plan === "free" ? 403 : 200), `${fixture.plan} pair compare`);
    if (fixture.plan === "trial") {
      r = await request(fixture, "/api/network/score", { method: "POST", body: JSON.stringify({ purpose: "pair_compare", self: pillars, others: [other("pair-1")] }) });
      check(r.response.status === 403 && r.data.code === "network_pair_compare_trial_used", "trial pair compare once");
    }

    r = await request(fixture, `/api/mobile/v1/today/hours?date=${date}&profileId=${fixture.profileId}`, {}, true);
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} mobile today bearer`);
    r = await request(fixture, `/api/mobile/v1/calendar?year=${current.year}&month=${current.month}&profileId=${fixture.profileId}`, {}, true);
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} mobile calendar bearer`);
    r = await request(fixture, `/api/mobile/v1/chart?profileId=${fixture.profileId}`, {}, true);
    check(r.response.status === 200 && r.data.entitlement?.plan === fixture.plan, `${fixture.plan} mobile chart bearer`);

    console.log(`API tier PASS · ${fixture.plan}`);
  }
  console.log(`API matrix PASS · ${checks} checks · ${fixtures.length} tiers`);
} finally {
  const userIds = fixtures.map((fixture) => fixture.id);
  const orgIds = fixtures.map((fixture) => fixture.orgId);
  await q(`DELETE FROM hour_transactions WHERE user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await q(`DELETE FROM profiles WHERE created_by_user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await q(`DELETE FROM org_members WHERE user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await q(`UPDATE users SET current_org_id=NULL WHERE id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await q(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [orgIds]).catch(() => {});
  await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]).catch(() => {});
}
