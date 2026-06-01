/**
 * Test · ลบเล่มคัมภีร์ = ซ่อนด้านนอก + ใส่รหัส (เจ้านายสั่ง 1 มิ.ย. · ห้ามลบใน DB)
 * รัน: node --experimental-strip-types scripts/test-library-softhide.mts
 * ตรวจ 2 ชั้น: (1) source ไม่เหลือ hard-delete + มี password gate  (2) logic ไฟล์ซ่อน round-trip
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const SRC = readFileSync(new URL("../src/app/api/admin/library/route.ts", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

console.log("[#1 source · ไม่ลบใน DB + ใส่รหัส]");
ck("ไม่เหลือ DELETE FROM library_scriptures (ไม่ลบ row)", !/DELETE FROM library_scriptures/.test(SRC));
ck("ไม่ลบไฟล์สแกน (ไม่มี rmSync)", !/rmSync/.test(SRC));
ck("delete-scripture ต้องเช็ค LIBRARY_DELETE_PIN", /process\.env\.LIBRARY_DELETE_PIN/.test(SRC));
ck("fail-closed: env ว่าง = ห้ามลบ (!pin → 403)", /!pin \|\| String\(body\.password/.test(SRC) && /status: 403/.test(SRC));
ck("เช็ครหัสก่อน mutate (403 อยู่ก่อน writeHidden)", SRC.indexOf("status: 403") < SRC.indexOf("writeHidden(hidden)"));
// เจาะเฉพาะ block delete-scripture (จาก if-check ถึง return) ว่าไม่มี DB write
const delBlock = (SRC.match(/if \(action === "delete-scripture"\)[\s\S]*?\n  \}/) || [""])[0];
ck("ซ่อนผ่าน writeHidden · block ลบไม่มี DB query (await q)", /writeHidden\(hidden\)/.test(delBlock) && !/await q\(/.test(delBlock));
ck("GET list กรองเล่มที่ซ่อน (readHidden)", /const hidden = new Set\(readHidden\(\)\)/.test(SRC) && /\.filter\(\(r\) => !hidden\.has/.test(SRC));
ck("GET ?id= เล่มที่ซ่อน → 404 (เข้าไม่ได้ด้วย id ตรง)", /readHidden\(\)\.includes\(Number\(id\)\)/.test(SRC));
ck("ไฟล์ซ่อนอยู่นอก DB (persist /decode-shared)", /LIBRARY_HIDDEN_FILE|_hidden\.json/.test(SRC) && /SCAN_DIR/.test(SRC));

console.log("\n[#2 logic · ไฟล์ซ่อน round-trip (จำลอง readHidden/writeHidden)]");
const dir = mkdtempSync(join(tmpdir(), "libhide-"));
const f = join(dir, "_hidden.json");
// จำลอง logic เดียวกับ route
const readH = (): number[] => { try { const a = JSON.parse(readFileSync(f, "utf8")); return Array.isArray(a) ? a.map(Number).filter((n) => Number.isFinite(n)) : []; } catch { return []; } };
const writeH = (ids: number[]) => writeFileSync(f, JSON.stringify(Array.from(new Set(ids)).sort((a, b) => a - b)));
ck("ไฟล์ไม่มี = [] (ไม่ throw)", readH().length === 0);
writeH([7]);
ck("ซ่อน id 7 แล้วอ่านเจอ", JSON.stringify(readH()) === "[7]");
const h2 = readH(); if (!h2.includes(8)) h2.push(8); writeH(h2);
ck("เพิ่ม id 8 · มีทั้ง 7,8", JSON.stringify(readH()) === "[7,8]");
const h3 = readH(); if (!h3.includes(7)) h3.push(7); writeH(h3);
ck("ซ่อนซ้ำ id 7 ไม่เพิ่มซ้ำ (unique)", JSON.stringify(readH()) === "[7,8]");
// filter จำลอง GET
const rows = [{ id: 5 }, { id: 7 }, { id: 8 }, { id: 11 }];
const hid = new Set(readH());
const visible = rows.filter((r) => !hid.has(r.id)).map((r) => r.id);
ck("GET เห็นเฉพาะ 5,11 (7,8 ถูกซ่อน · DB ยังมีครบ)", JSON.stringify(visible) === "[5,11]");
rmSync(dir, { recursive: true, force: true });

console.log(`\n[library-softhide] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
