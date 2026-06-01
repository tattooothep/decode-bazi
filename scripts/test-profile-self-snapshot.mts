/**
 * Test · บั๊ก "รวมดวง" (B: drawer self-only) + snapshot กันกู้ไม่ได้ (1 มิ.ย.)
 * รัน: node --experimental-strip-types scripts/test-profile-self-snapshot.mts
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const DRAWER = readFileSync(new URL("../public/js/hk-settings-drawer.js", import.meta.url), "utf8");
const API = readFileSync(new URL("../src/app/api/profile/[id]/route.ts", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

console.log("[#B · drawer แก้เฉพาะดวง self · เลิกเดา]");
// resolve block = ส่วนหา profile (ก่อน body render)
const resolve = (DRAWER.match(/var profile = null;[\s\S]*?catch\(e\) \{ console\.warn\('settings load'/) || [""])[0]
  || DRAWER.split("var body = drawer.querySelector")[0].slice(-800);
ck("resolve ยึด is_self อย่างเดียว", /arr\.find\(function\(p\)\{ return !!p\.is_self; \}\) \|\| null/.test(DRAWER));
ck("เลิก fallback localStorage hk_profile_id ใน resolve", !/localStorage\.getItem\('hk_profile_id'\)/.test(resolve));
ck("เลิก fallback arr\\[0\\] (ไม่หยิบดวงแรก/ญาติ)", !/\|\| arr\[0\]/.test(DRAWER));
ck("ไม่เจอ self → ไม่เปิดฟอร์ม (เพิ่มดวงของคุณ)", /ยังไม่มีดวงของคุณ/.test(DRAWER));
ck("หัว drawer โชว์ชื่อดวง self", /ตั้งค่าดวงของฉัน · ' \+ \(profile\.name/.test(DRAWER));
ck("มีลิงก์แก้ดวงญาติ → /yongsennetwork", /href="\/yongsennetwork"/.test(DRAWER) && /แก้ดวงญาติ/.test(DRAWER));
ck("PUT ยังยิงไป profile.id (ดวง self ที่ resolve)", /\/api\/profile\/' \+ profile\.id/.test(DRAWER));

console.log("\n[#snapshot · กันเขียนทับเสาถาวร (กู้คืนได้)]");
ck("มี snapshotProfile()", /function snapshotProfile\(/.test(API));
ck("snapshot ก่อน UPDATE (เรียกก่อน sets.push updated_at)", API.indexOf("snapshotProfile(id, s.orgId") < API.indexOf('sets.push(`"updated_at"=now()`)'));
ck("เก็บค่าเดิม 4เสา+用神 (bazi_pillars/yongshen/day_master)", /day_master: existing\.day_master/.test(API) && /yongshen: existing\.yongshen/.test(API) && /bazi_pillars: existing\.bazi_pillars/.test(API));
ck("existing SELECT ดึง bazi_pillars/yongshen เดิมมาด้วย", /day_master, day_master_strength, yongshen, bazi_pillars/.test(API));
ck("เก็บไฟล์นอก DB (ไม่ ALTER · PROFILE_SNAPSHOT_DIR)", /PROFILE_SNAPSHOT_DIR|profile-snapshots/.test(API));
ck("ไม่แตะ calcBazi logic (ยัง import เดิม)", /import \{ calcBazi \} from "@\/lib\/bazi-calc"/.test(API));
ck("snapshot best-effort (พังไม่ขวาง update · try/catch)", /\} catch \{ \/\* snapshot ล้มเหลว/.test(API));

console.log("\n[#snapshot logic · jsonl append + cap 20]");
const dir = mkdtempSync(join(tmpdir(), "snap-"));
const f = join(dir, "9.jsonl");
const snap = (obj: object) => {
  let lines: string[] = [];
  try { lines = readFileSync(f, "utf8").split("\n").filter(Boolean); } catch {}
  lines.push(JSON.stringify(obj));
  if (lines.length > 20) lines = lines.slice(-20);
  writeFileSync(f, lines.join("\n") + "\n");
};
for (let k = 0; k < 25; k++) snap({ n: k });
const got = readFileSync(f, "utf8").split("\n").filter(Boolean);
ck("เก็บไม่เกิน 20 ครั้ง", got.length === 20);
ck("เก็บ  20 ครั้งล่าสุด (n=5..24)", JSON.parse(got[0]).n === 5 && JSON.parse(got[19]).n === 24);
rmSync(dir, { recursive: true, force: true });

console.log(`\n[profile-self-snapshot] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
