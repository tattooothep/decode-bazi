/**
 * เทสยิงจริง — ห้องคุยสดซินแส (dev instance · ไม่แตะ prod)
 * รัน: BASE=http://127.0.0.1:3391 npx tsx scripts/test-sifu-realtime-live.mts
 * ต้องมี dev server รันอยู่ที่ BASE พร้อม OPENAI_API_KEY (จาก /root/secrets/openai-realtime-test.env)
 *
 * พิสูจน์: 401 ไม่มี token · 200 ได้ session จริง · prompt มี ⟦ID⟧+ชื่อคัมภีร์ · ยอดยามตัดถูก
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { q, q1 } = await import("../src/lib/db.ts");
const { signSession } = await import("../src/lib/auth.ts");

const BASE = process.env.BASE || "http://127.0.0.1:3391";
const EMAIL = "sifu-rt-live@test.hourkey.io";
const START_BALANCE = 100;
const MINUTES = 1; // จอง 1 นาที = 2 ยาม
const EXPECTED_COST = 2;

function fusionToken(): string {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET missing");
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}

async function ensureTestFixture(): Promise<{ userId: string; orgId: string; profileId: string }> {
  const existing = await q1<{ id: string; current_org_id: string | null }>(
    `SELECT id, current_org_id FROM users WHERE email=$1`,
    [EMAIL],
  );
  let userId: string;
  let orgId: string;
  if (existing?.current_org_id) {
    userId = existing.id;
    orgId = existing.current_org_id;
  } else {
    userId = existing?.id || randomUUID();
    orgId = randomUUID();
    if (!existing) {
      await q1(
        `INSERT INTO users (id, email, name, is_active, created_at)
         VALUES ($1, $2, 'ทดสอบห้องเสียงซินแส', true, now())`,
        [userId, EMAIL],
      );
    }
    try {
      await q1(`INSERT INTO organizations (id, owner_user_id, name) VALUES ($1, $2, 'test-org-sifu-rt')`, [orgId, userId]);
    } catch {
      await q1(`INSERT INTO organizations (id, name) VALUES ($1, 'test-org-sifu-rt')`, [orgId]);
    }
    await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  }
  await q1(`UPDATE users SET hour_balance=$2, tier=COALESCE(tier,'free') WHERE id=$1`, [userId, START_BALANCE]);

  let profile = await q1<{ id: string }>(
    `SELECT id FROM profiles WHERE org_id=$1 AND created_by_user_id=$2 AND COALESCE(is_archived,false)=false ORDER BY created_at LIMIT 1`,
    [orgId, userId],
  );
  if (!profile) {
    const pid = randomUUID();
    // golden Aeaw 1984-12-31 13:15 Bangkok → Day Master 己
    await q1(
      `INSERT INTO profiles (id, org_id, created_by_user_id, name, relationship_type, birth_datetime, birth_lat, birth_lng, gender, birth_time_known, is_archived)
       VALUES ($1,$2,$3,'ดวงทดสอบเสียงสด','self','1984-12-31T13:15:00+07:00'::timestamptz,13.7563,100.5018,'F',true,false)`,
      [pid, orgId, userId],
    );
    profile = { id: pid };
  }
  return { orgId, profileId: profile.id, userId };
}

async function balance(userId: string): Promise<number> {
  const row = await q1<{ hour_balance: number }>(`SELECT COALESCE(hour_balance,0) AS hour_balance FROM users WHERE id=$1`, [userId]);
  return Number(row?.hour_balance ?? 0);
}

const { userId, orgId, profileId } = await ensureTestFixture();
const token = await signSession({ userId, email: EMAIL, orgId, sv: 0 });
const url = `${BASE}/api/mobile/v1/sifu/realtime/session`;

/* ① ไม่มี token → 401 */
{
  const r = await fetch(url, {
    body: JSON.stringify({ locale: "th", minutes: MINUTES, profileId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(r.status, 401, `expect 401 got ${r.status}: ${await r.text()}`);
  console.log("① no-token → 401 ✅");
}

/* ② promptOnly (internal) — พิสูจน์ prompt ชุดจริงมี ⟦ID⟧ + ชื่อคัมภีร์ ก่อนเปิดห้อง */
{
  const r = await fetch(`${BASE}/api/sifu`, {
    body: JSON.stringify({
      lang: "th",
      message: "(เปิดห้องคุยเสียงสดกับซินแส — ตรวจชุด prompt)",
      noCache: true,
      profileId,
      promptOnly: true,
      ...(process.env.SIFU_REALTIME_PROMPT_MODEL ? { model: process.env.SIFU_REALTIME_PROMPT_MODEL } : {}),
    }),
    headers: {
      "Content-Type": "application/json",
      Cookie: `decode_auth=${encodeURIComponent(token)}`,
      "X-Sifu-Fusion": "1",
      "X-Sifu-Fusion-Token": fusionToken(),
    },
    method: "POST",
  });
  const j = (await r.json()) as Record<string, unknown>;
  assert.equal(r.status, 200, `promptOnly http ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  assert.equal(j.prompt_only, true);
  const prompt = String(j.prompt || "");
  assert.match(prompt, /⟦ID⟧/u, "prompt ต้องมี identity-lock ⟦ID⟧");
  assert.match(prompt, /FACT LOCK/u, "prompt ต้องมี FACT LOCK");
  const canonNames = ["bazi-interaction-master", "คัมภีร์ปฏิกิริยา", "子平真詮", "窮通寶鑑", "คัมภีร์"]
    .filter((name) => prompt.includes(name));
  assert.ok(canonNames.length > 0, "prompt ต้องมีชื่อคัมภีร์อย่างน้อย 1 รายการ");
  console.log(`② promptOnly → 200 ✅ · model=${j.model} · ${j.prompt_chars} chars · ⟦ID⟧+FACT LOCK+คัมภีร์ [${canonNames.join(", ")}] · expected_dm=${j.expected_dm}`);
}

/* ③ เปิด session จริง → 200 + clientSecret + ยามถูกตัด 2 */
{
  const before = await balance(userId);
  const r = await fetch(url, {
    body: JSON.stringify({ locale: "th", minutes: MINUTES, profileId }),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  const j = (await r.json()) as Record<string, unknown>;
  assert.equal(r.status, 200, `session http ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  assert.ok(String(j.clientSecret || "").length >= 12, "ต้องได้ ephemeral clientSecret");
  assert.equal(j.model, "gpt-realtime-2.1-mini");
  assert.equal(j.yamSpent, EXPECTED_COST);
  // ชุดเต็ม 873K chars เกินเพดาน instructions 65,536 ของผู้ให้บริการ → ต้องเข้าโหมด relay
  // (สมอง = /api/mobile/v1/sifu/chat ชุดเป๊ะเต็ม · โมเดลเสียงห้ามวิเคราะห์เอง)
  assert.equal(j.mode, "relay");
  assert.deepEqual(j.relay, { endpoint: "/api/mobile/v1/sifu/chat", profileId, tool: "ask_sifu" });
  const after = await balance(userId);
  assert.equal(before - after, EXPECTED_COST, `ยามต้องถูกตัด ${EXPECTED_COST} (before=${before} after=${after})`);
  assert.equal(j.balanceAfter, after);
  const tx = await q1<{ delta: number; reason: string }>(
    `SELECT delta, reason FROM hour_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  assert.equal(Number(tx?.delta), -EXPECTED_COST);
  assert.equal(tx?.reason, "spend_sifu_realtime");
  console.log(`③ session → 200 ✅ · secret=${String(j.clientSecret).slice(0, 8)}… · expiresAt=${j.expiresAt} · ยาม ${before}→${after} (−${EXPECTED_COST}) · txn=spend_sifu_realtime`);
}

/* ④ ยามไม่พอ → 402 และไม่ตัด */
{
  await q1(`UPDATE users SET hour_balance=1 WHERE id=$1`, [userId]);
  const r = await fetch(url, {
    body: JSON.stringify({ locale: "th", minutes: MINUTES, profileId }),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(r.status, 402, `expect 402 got ${r.status}`);
  assert.equal(await balance(userId), 1, "ยามห้ามถูกตัดเมื่อไม่พอ");
  await q1(`UPDATE users SET hour_balance=$2 WHERE id=$1`, [userId, START_BALANCE]);
  console.log("④ insufficient → 402 ✅ ยอดไม่ถูกตัด");
}

console.log("sifu realtime LIVE test passed");
await q(`SELECT 1`); // keep pool happy before exit
process.exit(0);
