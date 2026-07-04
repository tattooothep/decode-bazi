/* test-natal-book.mjs · r391-book · หนังสือดวงชะตา 6 ศาสตร์ (Natal Book)
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/test-natal-book.mjs
 * in-process (ไม่ยิง server จริง · mock /api/sifu · ไม่เรียก AI จริง)
 * ครอบ:
 *   [1] bookMode prompt swap — buildSciencePrompt(book) ฉีด read-full directive · Q&A เดิม (bookMode=false) ไม่พัง
 *   [2] loadBookDirective/loadBookJudgeDirective — โหลด 7 ไฟล์ + แทน {{NAME}} ครบ
 *   [3] buildJudgeBookPrompt — สังเคราะห์ 6 บท + resonance/daySniper/multiYear · ≤ cap
 *   [4] migrate natal_books — ตารางมีจริง + insert/read row
 *   [5] route: POST /api/book (6 ศาสตร์) → done · 6 บท+cover · yam 114 · bazi ไป profileId · อื่นไป externalPrompt(bookMode)
 *   [6] route: refund partial — บทพัง (vedic) → degraded + refund bookPanelYam(vedic)
 *   [7] route: org guard — ผู้ใช้อื่นเปิดเล่มไม่ได้ (404) · GET resume ไม่หักซ้ำ
 *   [8] book.html — script node --check + i18n 3 ภาษา + @media print
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

let pass = 0, fail = 0;
const ok = (c, l, d = "") => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (d ? " · " + d : ""))); };

/* ── mock /api/sifu ภายใน · จับ payload · fail ตาม globalThis.__failMatch (substring ใน externalPrompt/message) ── */
const sifuCalls = [];
globalThis.__failMatch = null; // เช่น "โหราพระเวท" → panel นั้น error
globalThis.__badFormat = false; // true → mock ตอบขาดหัวข้อ (ทดสอบ format validation/retry)
const mock = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch {}
    sifuCalls.push({ url: req.url, payload });
    const hay = String(payload.externalPrompt || "") + String(payload.message || "");
    if (globalThis.__failMatch && hay.includes(globalThis.__failMatch)) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "mock_forced_fail" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    // ตอบครบ 10 หัวข้อ ## 1..## 10 (format contract) — ยกเว้น globalThis.__badFormat = ตอบขาดหัวข้อ (ทดสอบ retry/format_warning)
    const body10 = globalThis.__badFormat
      ? "## 1. หัวข้อ\nเนื้อหา " + "ก".repeat(80)
      : Array.from({ length: 10 }, (_, i) => `## ${i + 1}. หัวข้อที่ ${i + 1}`).join("\nเนื้อหา " + "ก".repeat(20) + "\n");
    res.end(JSON.stringify({ reply: `【mock】ฟันธงทดสอบ ${payload.model || "?"} · ` + body10, model: payload.model || "mock" }));
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
process.env.SIFU_INTERNAL_BASE_URL = `http://127.0.0.1:${mock.address().port}`;

/* ── imports หลังตั้ง env ── */
const { q, q1, pool } = await import("../src/lib/db.ts");
const { signSession } = await import("../src/lib/auth.ts");
const { calcBazi } = await import("../src/lib/bazi-calc.ts");
const bp = await import("../src/lib/fusion5/build-prompt.ts");
const { FUSION_PANEL_PROMPT_MAX_CHARS } = bp;
const bookRoute = await import("../src/app/api/book/route.ts");

const EMAIL = "natal-book-r391@test.hourkey.io";
const EMAIL_B = "natal-book-r391-b@test.hourkey.io";
const setCookie = (token) => { globalThis.__testCookies = token ? { decode_auth: token } : {}; };
const post = (body) => new Request("http://127.0.0.1/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = (qs) => new Request(`http://127.0.0.1/api/book?${qs}`, { method: "GET" });

async function cleanupEmail(email) {
  const users = await q(`SELECT id FROM users WHERE email = $1`, [email]);
  for (const u of users) {
    await q1(`DELETE FROM natal_books WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM hour_transactions WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM push_skip_log WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [u.id]);
    await q1(`DELETE FROM profiles WHERE created_by_user_id=$1`, [u.id]);
    await q1(`DELETE FROM org_members WHERE user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM organizations WHERE owner_user_id=$1`, [u.id]).catch(() => {});
    await q1(`DELETE FROM users WHERE id=$1`, [u.id]);
  }
}
async function makeUser(email, name) {
  const userId = randomUUID(), orgId = randomUUID();
  await q1(`INSERT INTO users (id, email, name, is_active, hour_balance, created_at) VALUES ($1,$2,$3,true,10000,now())`, [userId, email, name]);
  try { await q1(`INSERT INTO organizations (id, owner_user_id, name) VALUES ($1,$2,$3)`, [orgId, userId, "org-" + name]); }
  catch { await q1(`INSERT INTO organizations (id, name) VALUES ($1,$2)`, [orgId, "org-" + name]); }
  await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  return { userId, orgId };
}
async function makeProfile(orgId, userId, name, date, time, gender, timeKnown = true) {
  const id = randomUUID();
  const calc = await calcBazi({ date, time, longitude: 100.5018, gmtOffsetHours: 7, gender, dayBoundary: "23:00", birthTimeKnown: timeKnown });
  await q1(
    `INSERT INTO profiles (id, org_id, created_by_user_id, name, relationship_type, birth_datetime, birth_lat, birth_lng, gender, birth_time_known, is_archived, bazi_pillars)
     VALUES ($1,$2,$3,$4,NULL,$5::timestamptz,13.7563,100.5018,$6,$7,false,$8)`,
    [id, orgId, userId, name, `${date}T${time}:00+07:00`, gender, timeKnown, JSON.stringify({ ge_ju: calc.geJu?.structure || null, pillars: calc.pillars, day_boundary: "23:00" })]
  );
  return id;
}
async function balance(userId) { const r = await q1(`SELECT hour_balance::text AS b FROM users WHERE id=$1`, [userId]); return Number(r?.b || 0); }
async function pollBook(bookId, timeoutMs = 120_000) {
  const t0 = Date.now();
  for (;;) {
    const row = await q1(`SELECT status, result, error, yam_charged, yam_refunded FROM natal_books WHERE id=$1`, [bookId]);
    if (row && row.status !== "running") return row;
    if (Date.now() - t0 > timeoutMs) return row || { status: "timeout" };
    await new Promise((r) => setTimeout(r, 400));
  }
}

await cleanupEmail(EMAIL); await cleanupEmail(EMAIL_B);
const A = await makeUser(EMAIL, "natalA");
const B = await makeUser(EMAIL_B, "natalB");
const tokenA = await signSession({ userId: A.userId, email: EMAIL, orgId: A.orgId });
const tokenB = await signSession({ userId: B.userId, email: EMAIL_B, orgId: B.orgId });
const profileMai = await makeProfile(A.orgId, A.userId, "ไหมมี่เทส", "1986-04-12", "16:42", "F");

/* ═══ [1] bookMode prompt swap ═══ */
console.log("[1] bookMode prompt swap + Q&A regression");
{
  const birth = { name: "ไหมมี่", dtUTC: new Date("1986-04-12T16:42:00+07:00"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };
  const bookP = bp.buildSciencePrompt("western", [birth], "", "th", new Date("2026-07-04T00:00:00Z"), undefined, { bookMode: true });
  ok(bookP.includes("อ่านเต็มดวง") || bookP.includes("หนังสือดวงชะตา"), "book: มี directive อ่านเต็มดวง");
  ok(!bookP.includes("=== คำถามผู้ถาม ==="), "book: ไม่มีบล็อกคำถามผู้ถาม");
  ok(bookP.includes("ไหมมี่"), "book: แทนชื่อเจ้าชะตา");
  ok(bookP.length <= FUSION_PANEL_PROMPT_MAX_CHARS, "book: ≤ cap 118K");
  const qaP = bp.buildSciencePrompt("western", [birth], "ปีนี้การเงินเป็นยังไง", "th", new Date("2026-07-04T00:00:00Z"));
  ok(qaP.includes("=== คำถามผู้ถาม ==="), "Q&A: ยังมีบล็อกคำถามผู้ถาม (ไม่พัง)");
  ok(qaP.includes("ปีนี้การเงินเป็นยังไง"), "Q&A: คำถามผู้ใช้คงอยู่");
  ok(!qaP.includes("อ่านเต็มดวง · หนังสือดวงชะตา"), "Q&A: ไม่มี directive book");
}

/* ═══ [2] loadBookDirective / judge directive ═══ */
console.log("[2] loadBookDirective 6 ศาสตร์ + judge");
{
  for (const s of ["bazi", "ziwei", "qizheng", "western", "vedic", "uranian"]) {
    const d = bp.loadBookDirective(s, "ทดสอบชื่อ");
    ok(d.length > 200 && !d.includes("{{NAME}}") && d.includes("ทดสอบชื่อ"), `directive ${s} โหลด+แทนชื่อ`);
  }
  const jd = bp.loadBookJudgeDirective("ทดสอบชื่อ");
  ok(jd.length > 200 && !jd.includes("{{NAME}}") && jd.includes("ทดสอบชื่อ"), "judge-book directive โหลด+แทนชื่อ");
}

/* ═══ [3] buildJudgeBookPrompt ═══ */
console.log("[3] buildJudgeBookPrompt");
{
  const birth = { name: "ไหมมี่", dtUTC: new Date("1986-04-12T16:42:00+07:00"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };
  const chapters = [
    { science: "western", reply: "เนื้อบทตะวันตก ".repeat(50) },
    { science: "bazi", reply: "เนื้อบทปาจื้อ ".repeat(50) },
  ];
  const jp = bp.buildJudgeBookPrompt(chapters, [birth], "th", "=== RESONANCE ===\nres", "=== DAY_SNIPER ===\nds", "multi-year block");
  ok(jp.includes("โหราตะวันตก") && jp.includes("ปาจื้อ"), "judge: มีทั้ง 2 บท");
  ok(jp.includes("MULTI_YEAR") && jp.includes("DAY_SNIPER") && jp.includes("RESONANCE"), "judge: แนบ resonance+daySniper+multiYear");
  ok(jp.includes("บทปิดเล่ม") || jp.includes("หลอมรวม"), "judge: มี directive บทปิดเล่ม");
  ok(jp.length <= FUSION_PANEL_PROMPT_MAX_CHARS, "judge: ≤ cap");
}

/* ═══ [4] migrate natal_books ═══ */
console.log("[4] natal_books table");
{
  const reg = await q1(`SELECT to_regclass('public.natal_books') AS t`);
  ok(reg && reg.t === "natal_books", "ตาราง natal_books มีจริง");
  const id = randomUUID();
  await q1(`INSERT INTO natal_books(id,user_id,org_id,profile_id,status,lang,sciences,yam_charged) VALUES ($1,$2,$3,$4,'running','th',$5,10)`,
    [id, A.userId, A.orgId, profileMai, ["bazi", "western"]]);
  const back = await q1(`SELECT status, sciences, yam_charged FROM natal_books WHERE id=$1`, [id]);
  ok(back && back.status === "running" && Array.isArray(back.sciences) && back.sciences.length === 2 && back.yam_charged === 10, "insert/read row");
  await q1(`DELETE FROM natal_books WHERE id=$1`, [id]);
}

/* ═══ [5] route: สร้างเล่มเต็ม 6 ศาสตร์ ═══ */
console.log("[5] route POST /api/book (6 ศาสตร์) → done");
let bookFullId = null;
{
  setCookie(tokenA);
  globalThis.__failMatch = null;
  sifuCalls.length = 0;
  const balBefore = await balance(A.userId);
  const res = await bookRoute.POST(post({ profileId: profileMai, lang: "th" }));
  const j = await res.json();
  ok(res.status === 200 && j.bookId && j.status === "running", "POST คืน bookId running");
  ok(j.yam?.charged === 114, "yam ที่หัก = 114 (6 ศาสตร์ + judge)", "got " + JSON.stringify(j.yam));
  bookFullId = j.bookId;
  const row = await pollBook(bookFullId);
  ok(row.status === "done", "เล่มเสร็จ status=done", "got " + row.status + " err=" + row.error);
  const r = row.result || {};
  ok(r.version === "natal_book_v1" && r.cover && r.cover.name === "ไหมมี่เทส", "มี cover+ชื่อ");
  ok(Array.isArray(r.chapters) && r.chapters.length === 6 && r.chapters.every((c) => c.ok), "6 บทครบ + ok");
  ok(r.synthesis && r.synthesis.ok && r.synthesis.markdown, "บทหลอมรวม (judge) ok");
  // bazi ไป profileId · อื่นไป externalPrompt(bookMode)
  const baziCall = sifuCalls.find((c) => c.payload.profileId && String(c.payload.message || "").includes("บทปาจื้อ"));
  const westCall = sifuCalls.find((c) => String(c.payload.externalPrompt || "").includes("โหราตะวันตก"));
  ok(!!baziCall, "bazi ผ่าน /api/sifu profileId + directive");
  ok(!!westCall && westCall.payload.externalPrompt.includes("หนังสือดวงชะตา"), "western ผ่าน externalPrompt bookMode");
  ok(row.yam_refunded === 0, "ไม่มี refund (สำเร็จเต็ม)");
  ok(Array.isArray(r.meta?.formatWarnings) && r.meta.formatWarnings.length === 0, "format contract: ไม่มี formatWarning (ครบ 10 มิติทุกบท)", "got " + JSON.stringify(r.meta?.formatWarnings));
  ok(r.chapters.every((c) => c.formatWarning === false), "ทุกบท formatWarning=false");
  const balAfter = await balance(A.userId);
  ok(balBefore - balAfter === 114, "หักยามสุทธิ 114", `diff ${balBefore - balAfter}`);
}

/* ═══ [5b] กันสร้างซ้ำ: POST ซ้ำ profile+lang เดิม → reused คืน bookId เดิม ไม่หักยาม ═══ */
console.log("[5b] กันสร้างซ้ำ (reused) — POST ซ้ำ profile เดิม");
{
  setCookie(tokenA);
  globalThis.__failMatch = null;
  const balBefore = await balance(A.userId);
  const res = await bookRoute.POST(post({ profileId: profileMai, lang: "th" }));
  const j = await res.json();
  ok(res.status === 200 && j.reused === true, "POST ซ้ำ → reused:true", "got " + JSON.stringify(j));
  ok(j.bookId === bookFullId && j.status === "done", "คืน bookId เดิม (done)", "got " + j.bookId);
  const balAfter = await balance(A.userId);
  ok(balBefore === balAfter, "ไม่หักยามซ้ำ (0 ยาม)", `diff ${balBefore - balAfter}`);
  // ต่างภาษา (lang=en) = เล่มคนละเล่ม → ไม่ reused (แต่ mock ไม่รันจริงตรงนี้ · แค่เช็คว่าไม่ short-circuit ผิดภาษา)
}

/* ═══ [5c] GET ?profileId=&lang= → คืน bookId ล่าสุดของ profile ═══ */
console.log("[5c] GET ?profileId → เล่มล่าสุด");
{
  setCookie(tokenA);
  const res = await bookRoute.GET(get("profileId=" + profileMai + "&lang=th"));
  const j = await res.json();
  ok(res.status === 200 && j.bookId === bookFullId, "GET ?profileId คืน bookId ล่าสุด", "got " + JSON.stringify(j));
  ok(j.status === "done", "GET ?profileId คืน status", "got " + j.status);
  // profile ที่ไม่มีเล่ม → bookId=null
  const res2 = await bookRoute.GET(get("profileId=" + randomUUID().replace(/-/g, "").slice(0, 32)));
  const j2 = await res2.json();
  ok(res2.status === 200 && j2.bookId === null, "profile ไม่มีเล่ม → bookId=null");
}

/* ═══ [5d] format validation + retry: บทขาดหัวข้อ → retry → mark formatWarning (ยัง render ได้) ═══ */
console.log("[5d] format validation + retry (บทขาดหัวข้อ 10 มิติ)");
{
  setCookie(tokenA);
  globalThis.__failMatch = null;
  globalThis.__badFormat = true; // mock ตอบขาดหัวข้อทุกบท
  sifuCalls.length = 0;
  const res = await bookRoute.POST(post({ profileId: profileMai, lang: "th", force: 1 }));
  const j = await res.json();
  const row = await pollBook(j.bookId);
  ok(row.status === "done", "บทขาดหัวข้อ = ยัง done (render ได้ ไม่หาย)", "got " + row.status);
  const fw = row.result?.meta?.formatWarnings || [];
  ok(fw.length === 6, "ทุกบทติด formatWarning (6 บท)", "got " + JSON.stringify(fw));
  ok(row.result.chapters.every((c) => c.formatWarning === true && c.ok), "บทมี formatWarning=true แต่ ok=true (ไม่ทิ้งบท)");
  // retry เกิดจริง: bazi 3 รอบ + อื่น 2 รอบ → sifu call มากกว่า 7 (1 call/บท กรณีไม่ retry)
  const baziCalls = sifuCalls.filter((c) => c.payload.profileId && String(c.payload.message || "").includes("บทปาจื้อ")).length;
  ok(baziCalls === 3, "bazi retry 3 รอบ (Task 5 reliability)", "got " + baziCalls);
  globalThis.__badFormat = false;
}

/* ═══ [6] route: refund partial (vedic พัง) · force=1 (regenerate ข้าม dedup) ═══ */
console.log("[6] route refund partial (บท vedic พัง)");
{
  setCookie(tokenA);
  globalThis.__failMatch = "โหราพระเวท"; // ทำให้ panel vedic error
  sifuCalls.length = 0;
  const balBefore = await balance(A.userId);
  const res = await bookRoute.POST(post({ profileId: profileMai, lang: "th", force: 1 }));
  const j = await res.json();
  const row = await pollBook(j.bookId);
  ok(row.status === "degraded", "status=degraded (บทพัง)", "got " + row.status);
  const deg = row.result?.meta?.degradedChapters || [];
  ok(deg.includes("vedic"), "degradedChapters มี vedic");
  const expectRefund = Math.round(10 * 1.5); // vedic costYam 10 → 15
  ok(row.yam_refunded === expectRefund, `refund = ${expectRefund} (bookPanelYam vedic)`, "got " + row.yam_refunded);
  const balAfter = await balance(A.userId);
  ok(balBefore - balAfter === 114 - expectRefund, "หักสุทธิ = 114 - refund", `diff ${balBefore - balAfter}`);
  globalThis.__failMatch = null;
}

/* ═══ [7] route: org guard + resume ═══ */
console.log("[7] org guard + resume ไม่หักซ้ำ");
{
  // ผู้ใช้ B เปิดเล่มของ A ไม่ได้
  setCookie(tokenB);
  const resB = await bookRoute.GET(get("id=" + bookFullId));
  const jB = await resB.json();
  ok(resB.status === 404 && jB.error === "book_not_found", "ผู้ใช้อื่นเปิดเล่มไม่ได้ (404)");
  // A เปิดซ้ำ = โหลด result เดิม ไม่หักยาม
  setCookie(tokenA);
  const balBefore = await balance(A.userId);
  const resA = await bookRoute.GET(get("id=" + bookFullId));
  const jA = await resA.json();
  ok(resA.status === 200 && jA.status === "done" && jA.result?.chapters?.length === 6, "A resume ได้ result เดิม");
  const balAfter = await balance(A.userId);
  ok(balBefore === balAfter, "resume ไม่หักยามซ้ำ (ฟรี)");
}

/* ═══ [8] book.html static ═══ */
console.log("[8] book.html script + i18n + print CSS");
{
  const html = readFileSync(new URL("../public/book.html", import.meta.url), "utf8");
  ok(html.includes("@media print"), "มี @media print (print→PDF)");
  ok(html.includes("page-break-before"), "print: page-break-before ต่อบท");
  ok(/I18N\s*=\s*\{[\s\S]*th:[\s\S]*en:[\s\S]*zh:/.test(html), "i18n ครบ 3 ภาษา (th/en/zh)");
  ok(html.includes('data-theme="dark"'), "รองรับ 2 ธีม (dark)");
  ok(html.includes("function mdSafe") && html.includes("function esc"), "มี mdSafe/esc (render markdown ปลอดภัย)");
  ok(html.includes("บันทึกเป็น PDF") && html.includes("Save as PDF") && html.includes("存為 PDF"), "ปุ่ม PDF 3 ภาษา (📥 บันทึกเป็น PDF)");
  ok(html.includes("document.title = t(\"brand\") + \"-\" + bookName") || html.includes('document.title = t("brand") + "-" + bookName'), "ตั้งชื่อไฟล์ PDF = คัมภีร์ชะตา-{ชื่อ}");
  ok(html.includes("พับจอ") && html.includes("หนังสือของฉัน"), "running UX: พับจอ/ปิดได้ + กลับมาที่หนังสือของฉัน");
  // node --check เฉพาะ inline script (ตัด HTML)
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  const tmp = "/tmp/claude-0/-root/14fcd76f-de20-4971-b9e7-a973b82e973e/scratchpad/book-inline.js";
  writeFileSync(tmp, m[1]);
  let syntaxOk = true;
  try { execFileSync(process.execPath, ["--check", tmp]); } catch (e) { syntaxOk = false; console.log("    " + String(e.stderr || e).slice(0, 200)); }
  ok(syntaxOk, "inline script ผ่าน node --check");
}

/* ── สรุป + cleanup ── */
await cleanupEmail(EMAIL); await cleanupEmail(EMAIL_B);
await pool.end().catch(() => {});
mock.close();
console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} · ${pass} passed · ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
