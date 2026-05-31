/**
 * Test · /api/sifu/compare เพิ่ม synastry (reuse buildSynastry) · ปิดบั๊ก AI แต่ง丁壬化木 ข้ามคน
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-compare-synastry.mts
 * หมายเหตุ: compare/route.ts import next/server → import ตรงไม่ได้ · mirror toPersonSyn (5 บรรทัด) + import buildSynastry/boundary "ตัวจริง"
 */
import { buildSynastry, type PersonSyn } from "../src/lib/bazi-synastry.ts";
import { monthPillarBoundary, yearPillarBoundary } from "../src/lib/bazi-boundary.ts";

const STEM_EL: Record<string, string> = { 甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water" };
type PC = { name: string; mode?: "3p" | "4p"; birthDate?: string; pillars: { year?: any; month?: any; day?: any; hour?: any }; yongshen_v2?: { primary_yongshen?: any[] } };
// mirror ของ toPersonSyn ใน compare/route.ts (โครงเดียวกันเป๊ะ)
function toPersonSyn(p: PC, label: string): PersonSyn {
  const is3p = (p.mode === "3p" || !p.pillars.hour);
  const bd = String(p.birthDate || "").slice(0, 10);
  const pk = (x: any) => (x && x.stem && x.branch ? { stem: x.stem, branch: x.branch } : undefined);
  const yongEls = (p.yongshen_v2?.primary_yongshen || []).map((y: any) => (typeof y === "string" ? y : y?.element)).filter(Boolean).map((s: string) => s.toLowerCase());
  return {
    name: p.name || label, role: label, isSelf: false, text: "", mode: is3p ? "3p" : "4p",
    dmEl: STEM_EL[p.pillars.day?.stem || ""] || "unknown", yongEls,
    pillars: { year: pk(p.pillars.year), month: pk(p.pillars.month), day: pk(p.pillars.day) },
    monthBorderline: is3p && bd ? !!monthPillarBoundary(bd).boundary : false,
    yearBorderline: is3p && bd ? !!yearPillarBoundary(bd).boundary : false,
  };
}

let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

console.log("[compare synastry · 丁壬 ข้ามคน (na日干壬 × Mu月干丁) → 緣 ไม่ใช่化木]");
const na: PC = { name: "na", mode: "4p", pillars: { year: { stem: "丙", branch: "子" }, month: { stem: "丙", branch: "辰" }, day: { stem: "壬", branch: "寅" }, hour: { stem: "庚", branch: "午" } }, yongshen_v2: { primary_yongshen: [{ element: "wood" }] } };
const mu: PC = { name: "Mu", mode: "4p", pillars: { year: { stem: "甲", branch: "卯" }, month: { stem: "丁", branch: "亥" }, day: { stem: "己", branch: "亥" }, hour: { stem: "乙", branch: "丑" } }, yongshen_v2: { primary_yongshen: [{ element: "fire" }] } };
const syn = buildSynastry([toPersonSyn(na, "คนที่ 1"), toPersonSyn(mu, "คนที่ 2")], "th");
const hitLines = syn.split("\n").filter((l) => l.startsWith("  - ")).join("");
ck("มี 天干五合(丁壬合)", /天干五合/.test(syn) && /丁壬合/.test(syn), "");
ck("มีป้าย 緣 (ดึงดูด/ผูกพัน)", /緣|ผูกพัน/.test(syn), "");
ck("ห้ามมี 化木/化氣格/得令 ใน hit (raw สะอาด)", !/化木|化氣格|得令/.test(hitLines), "");
ck("มี closed-list header (ลิสต์ปิด · ห้ามแต่งนอกลิสต์)", /ลิสต์ปิด/.test(syn) && /ห้ามสร้าง\/สันนิษฐาน/.test(syn), "");
ck("เทียบครบ 1 คู่ จาก 2 คน", /เทียบครบทุกคู่ 1 คู่ จาก 2 คน/.test(syn), "");

console.log("[compare · 2 คนไม่มีปฏิกิริยาเด่น → ยังโชว์ header (ไม่ว่าง)]");
const a: PC = { name: "A", mode: "4p", pillars: { year: { stem: "甲", branch: "寅" }, month: { stem: "甲", branch: "寅" }, day: { stem: "甲", branch: "寅" }, hour: { stem: "甲", branch: "子" } } };
const b: PC = { name: "B", mode: "4p", pillars: { year: { stem: "庚", branch: "寅" }, month: { stem: "庚", branch: "寅" }, day: { stem: "庚", branch: "寅" }, hour: { stem: "庚", branch: "子" } } };
const syn0 = buildSynastry([toPersonSyn(a, "A"), toPersonSyn(b, "B")], "th");
ck("ไม่มีคู่เด่น → ยังมี header closed-list", /ลิสต์ปิด.*เทียบครบทุกคู่ 1 คู่/s.test(syn0), "");

console.log("[compare · en/zh]");
ck("EN: CLOSED LIST + DO NOT create", /CLOSED LIST.*DO NOT create or infer/s.test(buildSynastry([toPersonSyn(na, "Person A"), toPersonSyn(mu, "Person B")], "en")), "");
ck("ZH: 封閉清單 + 天干五合", /封閉清單.*天干五合/s.test(buildSynastry([toPersonSyn(na, "甲方"), toPersonSyn(mu, "乙方")], "zh")), "");

console.log(`\n[compare-synastry] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
