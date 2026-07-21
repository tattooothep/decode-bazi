import crypto from "node:crypto";
import fs from "node:fs";
import { SignJWT } from "jose";
import pg from "pg";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const base = process.env.BASE_URL || "http://127.0.0.1:3370";
const db = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const userA = crypto.randomUUID(), userB = crypto.randomUUID(), orgId = crypto.randomUUID();
const profileA = crypto.randomUUID(), profileB = crypto.randomUUID();
const incompleteProfile = crypto.randomUUID();
const emailA = `mobile-direction-a-${runId}@example.test`, emailB = `mobile-direction-b-${runId}@example.test`;
let houseId = null;
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks++;
  console.log(`PASS ${message}`);
}

async function token(userId, email) {
  return new SignJWT({ userId, email, orgId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));
}

async function api(path, auth, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${auth}`, "content-type": "application/json", ...(options.headers || {}) },
  });
  return { response, data: await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  const trialEnd = new Date(Date.now() + 7 * 86400000);
  for (const [id, email, name] of [[userA, emailA, "Mobile A"], [userB, emailB, "Mobile B"]]) {
    await db.query(
      `INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,trial_ends_at,session_version,created_at)
       VALUES($1,$2,'test-only',$3,'th','Asia/Bangkok','dark',true,true,'free',1000,$4,0,now())`,
      [id, email, name, trialEnd]
    );
  }
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Mobile Direction Fixture',$3,now())`, [orgId, userA, `mobile-direction-${runId}`]);
  await db.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now()),(gen_random_uuid(),$1,$3,'member','active',now())`, [orgId, userA, userB]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=ANY($2::uuid[])`, [orgId, [userA, userB]]);
  const pillars = { pillars: { year: { stem: "庚", branch: "午" }, month: { stem: "己", branch: "丑" }, day: { stem: "甲", branch: "子" }, hour: { stem: "戊", branch: "辰" } } };
  await db.query(
    `INSERT INTO profiles(id,org_id,created_by_user_id,name,relationship_type,birth_datetime,birth_lat,birth_lng,gender,birth_time_known,day_boundary,is_archived,bazi_pillars,created_at,updated_at)
     VALUES($1,$3,$4,'Owner A',NULL,'1990-01-15T12:00:00+07:00',13.7563,100.5018,'M',true,'23:00',false,$5,now(),now()),
           ($2,$3,$6,'Owner B',NULL,'1991-02-16T12:00:00+07:00',13.7563,100.5018,'F',true,'23:00',false,$5,now(),now())`,
    [profileA, profileB, orgId, userA, JSON.stringify(pillars), userB]
  );
  const [tokenA, tokenB] = await Promise.all([token(userA, emailA), token(userB, emailB)]);

  let result = await api("/api/mobile/v1/luopan/bootstrap", tokenA);
  check(result.response.status === 200 && result.data.profiles.length === 1 && result.data.profiles[0].id === profileA, "bootstrap returns only profiles created by the mobile account");
  check(result.data.ring_reference?.mountains_24?.length === 24 && result.data.ring_reference.mountains_24[0].name === "壬", "bootstrap returns the canonical 24-Mountain ring reference");
  check(result.data.entitlement.plan === "trial" && result.data.entitlement.house_limit === 3, "bootstrap uses the shared trial entitlement contract");

  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  result = await api(`/api/mobile/v1/today/directions?date=${date}&time=${time}&timezone=Asia%2FBangkok&latitude=13.7563&longitude=100.5018&profileId=${profileA}`, tokenA);
  check(result.response.status === 200 && result.data.profile_context?.profileId === profileA, "mobile directions personalizes with the selected server-owned profile");
  check(result.data.request_context?.location_source === "mobile_explicit" && result.data.request_context?.latitude === 13.7563, "mobile directions records explicit time and location provenance");
  check(Array.isArray(result.data.personal_directions) && result.data.personal_directions.length === 8, "mobile directions returns all 8 personal directions");

  result = await api(`/api/mobile/v1/today/directions?date=${date}&time=${time}&timezone=Asia%2FBangkok&latitude=13.7563&longitude=100.5018&profileId=${profileB}`, tokenA);
  check(result.response.status === 404, "same-organization account cannot select another creator's profile");
  result = await api(`/api/mobile/v1/today/directions?date=${date}&time=${time}&timezone=Asia%2FBangkok&profileId=${profileA}`, tokenA);
  check(result.response.status === 422 && result.data.code === "location_required", "mobile directions never falls back silently to Bangkok");

  result = await api(`/api/mobile/v1/chart/${profileA}`, tokenA);
  check(result.response.status === 200 && result.data.entitlement?.plan === "trial" && result.data.analysis?.element_counts, "mobile chart returns plan-shaped elements, useful-element context, and luck data");
  result = await api(`/api/mobile/v1/chart/${profileB}`, tokenA);
  check(result.response.status === 404, "same-organization account cannot open another creator's chart");
  result = await api(`/api/mobile/v1/profiles/${profileA}`, tokenA);
  check(result.response.status === 200, "mobile profile route accepts a standard UUID");
  result = await api(`/api/mobile/v1/profiles/${profileB}`, tokenA);
  check(result.response.status === 404, "mobile profile route does not expose another creator's profile");
  await db.query(
    `INSERT INTO profiles(id,org_id,created_by_user_id,name,relationship_type,birth_datetime,birth_lng,gender,birth_time_known,day_boundary,is_archived,created_at,updated_at)
     VALUES($1,$2,$3,'Incomplete mobile chart','test','1992-03-17T12:00:00+07:00',NULL,NULL,true,'23:00',false,now(),now())`,
    [incompleteProfile, orgId, userA]
  );
  await db.query(`UPDATE profiles SET birth_lng=NULL,gender=NULL WHERE id=$1`, [incompleteProfile]);
  const incompleteRow = await db.query(`SELECT birth_lng,gender FROM profiles WHERE id=$1`, [incompleteProfile]);
  check(incompleteRow.rows[0]?.birth_lng == null && incompleteRow.rows[0]?.gender == null, "incomplete chart fixture has no hidden location or gender default");
  result = await api(`/api/mobile/v1/chart/${incompleteProfile}`, tokenA);
  check(result.response.status === 422 && result.data.error === "incomplete_birth_data", "mobile chart never substitutes Bangkok or male when birth data is incomplete");

  await db.query(`UPDATE users SET session_version=1 WHERE id=$1`, [userA]);
  result = await api("/api/mobile/v1/luopan/bootstrap", tokenA);
  check(result.response.status === 401, "revoked mobile bearer token is rejected");
  await db.query(`UPDATE users SET session_version=0,is_active=false WHERE id=$1`, [userA]);
  result = await api("/api/mobile/v1/luopan/bootstrap", tokenA);
  check(result.response.status === 401, "suspended account bearer token is rejected");
  await db.query(`UPDATE users SET is_active=true WHERE id=$1`, [userA]);

  const stableSensor = { method: "sensor", north_reference: "magnetic", heading_deg: 180, accuracy_class: 3, sample_count: 60, circular_std_deg: 1.1, repeat_spread_deg: 1.8, max_tilt_deg: 3, period: 8 };
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify(stableSensor) });
  check(result.response.status === 200 && result.data.core.period === 8 && result.data.core.facing.name === "午", "verified sensor measurement returns the requested house period and correct facing mountain");
  check(result.data.core.three_plates?.earth?.name === "午" && result.data.core.three_plates?.human?.name === "丁" && result.data.core.three_plates?.heaven?.name === "午", "analysis returns the classical Earth, Human, and Heaven plate readings");
  check(result.data.verdict_scope === "verified_core_only" && result.data.excluded_unverified_layers.includes("pseudo_time_star"), "mobile verdict excludes approximate layers");
  check(!result.data.core.xuan_kong.water && !result.data.core.professional && result.data.entitlement.mode === "core", "trial payload omits paid Luo Pan flight and professional layers");
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ method:"manual",north_reference:"manual",heading_deg:180,period:8 }) });
  check(result.response.status === 200 && result.data.measurement.uncertaintyDeg === 1, "manual center-of-mountain measurement uses bounded manual uncertainty");
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ method:"manual",north_reference:"manual",heading_deg:187.5,period:8 }) });
  check(result.response.status === 422 && result.data.measurement.reasons.includes("mountain_boundary_uncertain"), "manual measurement still fails closed at a 24-Mountain boundary");
  result = await api("/api/mobile/v1/luopan/rings?degree=0", tokenA);
  check(result.response.status === 200 && result.data.sections.hex64 === "locked" && !result.data.hex64, "trial focused rings expose locks without private specialist rows");
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ ...stableSensor, tigua_school:"full_24" }) });
  check(result.data.core.school === "shen_13", "trial cannot request the Master-only full-24 replacement school");
  await db.query(`UPDATE users SET tier='premium',sub_expires_at=now()+interval '1 day' WHERE id=$1`, [userA]);
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ ...stableSensor, tigua_school:"full_24", pins:[{type:"tall_form",featureCategory:"tall_form",degree:105},{type:"incoming_water",featureCategory:"incoming_water",degree:127.5},{type:"water_mouth",featureCategory:"water_mouth",degree:120}] }) });
  check(result.data.entitlement.mode === "pro" && result.data.core.school === "shen_13" && result.data.core.xuan_kong.water.length === 9, "Premium receives full Xuan Kong flights but not the Master replacement school");
  check(result.data.core.professional?.water_method && result.data.entitlement.locked_sections.includes("full_24_tigua"), "Premium receives measured water-method evidence with the Master category locked");
  check(result.data.core.pin_warnings?.[0]?.plate === "human" && result.data.core.pin_warnings?.[0]?.mountain === "辰" && result.data.core.pin_warnings?.[0]?.hits?.some((hit) => hit.code === "LONG_SHA_HIT"), "high forms use the Human Plate and preserve the resulting classical warning");
  check(result.data.core.pin_warnings?.[1]?.plate === "heaven" && result.data.core.pin_warnings?.[1]?.mountain === "辰" && result.data.core.pin_warnings?.[1]?.hits?.some((hit) => hit.code === "LONG_SHA_HIT"), "water features use the Heaven Plate and preserve the resulting classical warning");
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ ...stableSensor, pins:[{type:"incoming_water",featureCategory:"tall_form",degree:127.5}] }) });
  check(result.response.status === 400 && result.data.code === "invalid_pin_category", "mobile analysis rejects a pin type and category that select conflicting plates");
  result = await api("/api/mobile/v1/luopan/rings?degree=0", tokenA);
  check(result.data.hex64?.id === 24 && result.data.sections.fenjin120 === "locked" && !result.data.fenjin120, "Premium receives only the focused 64-Hexagram row");
  await db.query(`UPDATE users SET tier='master',sub_expires_at=now()+interval '1 day' WHERE id=$1`, [userA]);
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ ...stableSensor, tigua_school:"full_24" }) });
  check(result.data.entitlement.mode === "full" && result.data.core.school === "full_24" && result.data.entitlement.locked_sections.length === 0, "Master receives the full-24 replacement school and no Luo Pan category lock");
  result = await api("/api/mobile/v1/luopan/rings?degree=0", tokenA);
  check(result.data.fenjin120?.index === 7 && result.data.yao384?.gua === "復" && result.data.yao384?.pos?.startsWith("初"), "Master receives exactly the focused Fenjin and Yao rows");
  await db.query(`UPDATE users SET tier='free',sub_expires_at=NULL WHERE id=$1`, [userA]);

  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ ...stableSensor, sample_count: 5, circular_std_deg: 9 }) });
  check(result.response.status === 422 && result.data.measurement.reasons.includes("insufficient_samples"), "unstable sensor measurement fails closed");
  result = await api("/api/mobile/v1/luopan/analysis", tokenA, { method: "POST", body: JSON.stringify({ ...stableSensor, heading_deg: 187.4 }) });
  check(result.response.status === 422 && result.data.measurement.reasons.includes("mountain_boundary_uncertain"), "measurement near a 24-Mountain boundary fails closed");

  const clientMeasurementId = `fixture_${runId}`;
  const measurement = { ...stableSensor, client_measurement_id: clientMeasurementId };
  result = await api("/api/mobile/v1/luopan/measurements", tokenA, { method: "POST", body: JSON.stringify(measurement) });
  check(result.response.status === 201 && result.data.gate.pass === true, "measurement evidence is stored as a summary");
  await api("/api/mobile/v1/luopan/measurements", tokenA, { method: "POST", body: JSON.stringify(measurement) });
  const dedupe = await db.query(`SELECT count(*)::int n FROM mobile_luopan_measurements WHERE user_id=$1 AND client_measurement_id=$2`, [userA, clientMeasurementId]);
  check(dedupe.rows[0].n === 1, "replayed measurement remains exactly once");

  result = await api("/api/mobile/v1/houses", tokenA, { method: "POST", body: JSON.stringify({ name: "Fixture house", latitude: 13.7563, longitude: 100.5018, facing_deg: 180, method: "sensor", is_primary: true }) });
  check(result.response.status === 201 && result.data.house.facing_mountain.trim() === "午", "mobile can save a measured house with explicit location consent");
  houseId = String(result.data.house.id);
  result = await api(`/api/mobile/v1/houses/${houseId}`, tokenB);
  check(result.response.status === 404, "another same-organization account cannot read the saved house");
  result = await api(`/api/mobile/v1/houses/${houseId}`, tokenA, { method:"PATCH", body:JSON.stringify({start_lat:13.7562,start_lng:100.5017,end_lat:13.7562,end_lng:100.5019,facing_deg:180,latitude:13.7562,longitude:100.5018}) });
  check(result.response.status === 200 && Number(result.data.house.start_lng) === 100.5017 && Number(result.data.house.end_lng) === 100.5019, "mobile house persists the measured front-wall evidence");
  result = await api(`/api/mobile/v1/houses/${houseId}`, tokenA, { method:"PATCH", body:JSON.stringify({start_lat:13.7}) });
  check(result.response.status === 400, "mobile house rejects a partial front-wall update");

  result = await api("/api/mobile/v1/me", tokenA, { method: "PUT", body: JSON.stringify({ locale: "ja" }) });
  check(result.response.status === 200 && result.data.user?.locale === "ja", "mobile account persists one of the nine supported locales");
  result = await api("/api/mobile/v1/me", tokenA, { method: "PUT", body: JSON.stringify({ locale: "xx" }) });
  check(result.response.status === 400 && result.data.error === "unsupported_locale", "mobile account rejects an unsupported locale");
  result = await api("/api/mobile/v1/me", tokenA, { method: "PUT", body: JSON.stringify({ name: "Mobile A localized" }) });
  check(result.response.status === 200 && result.data.user?.name === "Mobile A localized" && result.data.user?.locale === "ja", "name-only account updates preserve the selected locale");

  result = await api("/api/mobile/v1/session", tokenA, { method: "DELETE" });
  check(result.response.status === 200 && result.data.revoked_server_session === true, "mobile logout revokes the server session");
  result = await api("/api/mobile/v1/luopan/bootstrap", tokenA);
  check(result.response.status === 401, "a logged-out bearer token cannot call mobile APIs again");

  await db.query(`UPDATE users SET password_hash=NULL WHERE id=$1`, [userB]);
  result = await api("/api/mobile/v1/account/delete", tokenB, { method: "POST", body: JSON.stringify({ confirm: "DELETE" }) });
  check(result.response.status === 200 && result.data.local_action === "purge_all_app_data", "mobile account deletion returns a mandatory local purge action");
  result = await api("/api/mobile/v1/luopan/bootstrap", tokenB);
  check(result.response.status === 401, "deleted account bearer token is rejected immediately");

  console.log(`${checks} mobile direction/luopan backend checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM mobile_luopan_measurements WHERE user_id=ANY($1::uuid[])`, [[userA, userB]]).catch(() => null);
    await db.query(`DELETE FROM ka_houses WHERE user_id=ANY($1::text[])`, [[userA, userB]]).catch(() => null);
    await db.query(`DELETE FROM profiles WHERE id=ANY($1::uuid[])`, [[profileA, profileB, incompleteProfile]]).catch(() => null);
    await db.query(`DELETE FROM org_members WHERE user_id=ANY($1::uuid[])`, [[userA, userB]]).catch(() => null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=ANY($1::uuid[])`, [[userA, userB]]).catch(() => null);
    await db.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [[userA, userB]]).catch(() => null);
    await db.end().catch(() => null);
  }
}
