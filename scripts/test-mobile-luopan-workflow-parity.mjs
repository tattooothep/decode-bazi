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
const db = new pg.Client({ host:env.PGHOST,port:Number(env.PGPORT),database:env.PGDATABASE,user:env.PGUSER,password:env.PGPASSWORD });
const userId = crypto.randomUUID(), otherUserId = crypto.randomUUID(), orgId = crypto.randomUUID();
const stamp = Date.now();
let ownedHouseId, foreignHouseId, checks = 0;
function check(value, message) { if (!value) throw new Error(`FAIL ${message}`); checks += 1; console.log(`PASS ${message}`); }
async function request(path, token, init={}) {
  const response = await fetch(`${base}${path}`, { ...init,headers:{authorization:token?`Bearer ${token}`:"",...(init.body?{"content-type":"application/json"}:{}),...(init.headers||{})} });
  return { response,data:await response.json().catch(() => ({})) };
}

try {
  await db.connect();
  await db.query(`INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,trial_ends_at,session_version,created_at) VALUES($1,$2,'test-only','Workflow Test','th','Asia/Bangkok','dark',true,true,'free',1000,NULL,0,now()),($3,$4,'test-only','Other Test','th','Asia/Bangkok','dark',true,true,'free',1000,NULL,0,now())`,[userId,`mobile-luopan-workflow-${stamp}@example.test`,otherUserId,`mobile-luopan-other-${stamp}@example.test`]);
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Workflow Test',$3,now())`,[orgId,userId,`workflow-${stamp}`]);
  await db.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now())`,[orgId,userId]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`,[orgId,userId]);
  ownedHouseId = (await db.query(`INSERT INTO ka_houses(user_id,name,is_primary,lat,lng,face_angle,sit_angle,facing_mountain,facing_direction,method,family_members) VALUES($1,'Owned',true,13.75,100.5,180,0,'午','S','manual','[]'::jsonb) RETURNING id`,[userId])).rows[0].id;
  foreignHouseId = (await db.query(`INSERT INTO ka_houses(user_id,name,is_primary,lat,lng,face_angle,sit_angle,facing_mountain,facing_direction,method,family_members) VALUES($1,'Foreign',true,13.75,100.5,90,270,'卯','E','manual','[]'::jsonb) RETURNING id`,[otherUserId])).rows[0].id;
  const token = await new SignJWT({userId,email:`mobile-luopan-workflow-${stamp}@example.test`,orgId,sv:0}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("20m").sign(new TextEncoder().encode(env.AUTH_SECRET));

  let result = await request(`/api/mobile/v1/luopan/snapshot?house_id=${ownedHouseId}`,null);
  check(result.response.status===401,"Luopan snapshot requires a mobile session");
  result = await request(`/api/mobile/v1/luopan/snapshot?house_id=bad`,token);
  check(result.response.status===400&&result.data.error==="bad_house_id","Luopan snapshot rejects malformed house IDs");
  result = await request(`/api/mobile/v1/luopan/snapshot?house_id=${foreignHouseId}`,token);
  check(result.response.status===404&&result.data.error==="house_not_found","Luopan snapshot blocks cross-account houses");
  result = await request(`/api/mobile/v1/luopan/snapshot?house_id=${ownedHouseId}&datetime=2026-07-11T05:00:00.000Z`,token);
  check(result.response.status===200&&result.data.house?.id===ownedHouseId,"Luopan snapshot returns only the owned house");
  check(result.data.layers?.flying_stars&&result.data.layers?.twenty_four,"Luopan snapshot preserves entitlement-shaped core layers");
  check(!("source" in result.data),"Luopan snapshot hides internal source labels");

  result = await request(`/api/mobile/v1/luopan/sifu`,null,{method:"POST",body:JSON.stringify({})});
  check(result.response.status===401,"Luopan Sifu requires a mobile session");
  result = await request(`/api/mobile/v1/luopan/sifu`,token,{method:"POST",body:JSON.stringify({profileId:crypto.randomUUID(),question:"test",lang:"es",evidence:{}})});
  check(result.response.status===403,"Luopan Sifu enforces the server plan before inference");
  await db.query(`UPDATE users SET tier='premium',sub_expires_at=now()+interval '1 day' WHERE id=$1`,[userId]);
  result = await request(`/api/mobile/v1/luopan/sifu`,token,{method:"POST",body:JSON.stringify({profileId:crypto.randomUUID(),question:"test",lang:"es",evidence:{}})});
  check(result.response.status===404&&result.data.error==="profile_context_unlocked","Luopan Sifu blocks a profile outside the account context");
  check(!/(claude|anthropic|openrouter|gemini|provider_model|model_name)/i.test(JSON.stringify(result.data)),"Luopan workflow does not disclose model or provider names");

  const routeSource = fs.readFileSync("src/app/api/mobile/v1/luopan/sifu/route.ts","utf8");
  const genericSource = fs.readFileSync("src/app/api/mobile/v1/sifu/chat/route.ts","utf8");
  check(routeSource.includes("isSifuAnswerLang(body.lang)")&&genericSource.includes("isSifuAnswerLang(body.lang)"),"Luopan and generic mobile Sifu accept the shared nine-language policy");
  check(routeSource.includes("evidenceBudget")&&routeSource.includes("${questionBlock}"),"Luopan Sifu preserves the complete user question when evidence is long");
  console.log(`${checks} mobile Luopan workflow checks passed`);
} finally {
  if (db._connected) {
    if (ownedHouseId) await db.query(`DELETE FROM ka_houses WHERE id=$1`,[ownedHouseId]).catch(()=>null);
    if (foreignHouseId) await db.query(`DELETE FROM ka_houses WHERE id=$1`,[foreignHouseId]).catch(()=>null);
    await db.query(`DELETE FROM org_members WHERE user_id=$1`,[userId]).catch(()=>null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`,[userId]).catch(()=>null);
    await db.query(`DELETE FROM organizations WHERE id=$1`,[orgId]).catch(()=>null);
    await db.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`,[[userId,otherUserId]]).catch(()=>null);
    await db.end().catch(()=>null);
  }
}
