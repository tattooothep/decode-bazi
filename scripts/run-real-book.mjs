/* รันคัมภีร์ชะตาจริง 1 เล่ม (end-to-end · ยิงเซิร์ฟจริง 3349) เพื่อพิสูจน์คุณภาพ+PDF
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/run-real-book.mjs
 */
import { signSession } from "../src/lib/auth.ts";

const USER = "6f647803-5e2b-46d3-94bf-1f546fa9d033"; // tattoothep@gmail.com (premium)
const ORG = "c5fe9d7b-a6d6-4070-adad-3db83a4c666b";
const PROFILE = "1a9193e3-6b0a-40c3-8bcf-21d611f084c9"; // ไนท์
const BASE = "http://127.0.0.1:3349";

const token = await signSession({ userId: USER, orgId: ORG });
const cookie = `decode_auth=${token}`;

console.log("POST /api/book ...");
const res = await fetch(`${BASE}/api/book`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ profileId: PROFILE, lang: "th" }),
});
const j = await res.json();
console.log("POST →", res.status, JSON.stringify(j).slice(0, 300));
const bookId = j.bookId;
if (!bookId) { console.log("❌ ไม่ได้ bookId"); process.exit(1); }

let last = "";
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const p = await fetch(`${BASE}/api/book?id=${bookId}`, { headers: { Cookie: cookie } });
  const pj = await p.json();
  const st = pj.status || pj.book?.status || "?";
  const chapters = (pj.result?.chapters || pj.book?.result?.chapters || []).length;
  if (st !== last) { console.log(`[${i * 5}s] status=${st} chapters=${chapters}`); last = st; }
  if (["done", "degraded", "error"].includes(st)) {
    console.log("=== FINAL ===", st);
    const r = pj.result || pj.book?.result || {};
    console.log("บท:", (r.chapters || []).map((c) => `${c.title || c.science}:${(c.markdown || c.body || "").length}ch`).join(" · "));
    console.log("หลอมรวม:", (r.synthesis?.markdown || r.synthesis || "").slice(0, 200));
    console.log("bookId:", bookId, "| เปิด: /book?id=" + bookId);
    console.log("yam_charged:", pj.yam_charged ?? pj.book?.yam_charged, "refunded:", pj.yam_refunded ?? pj.book?.yam_refunded);
    process.exit(0);
  }
}
console.log("⏱ timeout รอเกิน 10 นาที · bookId:", bookId);
