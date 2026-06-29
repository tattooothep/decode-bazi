/**
 * HK_SIFU_FACT_CLAIM_GATE_V1
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-fact-claim-gate.mts
 */
import { checkSifuFactClaimGate, extractSifuVisibleStems } from "@/lib/sifu-fact-claim-gate";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function ck(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}${detail ? " · " + detail : ""}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${detail ? " · " + detail : ""}`);
  }
}

const ctx = [
  "PILLAR LOCK: 年丙子 月壬辰 日壬寅 時未知",
  "透出ก้านฟ้า (透干; คัดจาก PILLAR LOCK 4 ก้านบนเท่านั้น · ห้ามนับ藏干/รากเป็น透เพิ่ม): 透出=丙壬壬 · 丙(年干) · 壬(月干) · 壬(日干)",
  "HK_SYNASTRY_RESOLVED_V1: ก่อนสรุปข้ามคนต้องไล่ synastry ทีละบรรทัดตาม type+เสา · ห้ามอ้าง 六冲 ถ้าคู่/แกนนั้นไม่มีคำว่า 冲 ในลิสต์",
  "ข้ามคน: เสาวันลูก 寅 ↔ เสาวันแม่ 戌 = โอบกิ่งว่าง(拱) 午·虛拱 — ถ้าปีจร午มาเติมให้อ่าน 寅午戌火局",
].join("\n");

ck("extracts visible stems from Tougan lock", extractSifuVisibleStems(ctx).join("") === "丙壬", extractSifuVisibleStems(ctx).join(""));

let r = checkSifuFactClaimGate("ข้ามคนมี 寅戌冲 เสาวันชนกันแรง", ctx);
ck("blocks invented 寅戌冲 when packet gives 拱/虛拱", !r.ok && r.violations.some((v) => v.code === "synastry:forbidden_yin_xu_clash"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ข้ามคนมี 戌冲寅 จอชงขาล", ctx);
ck("blocks reverse-order 戌冲寅 / จอชงขาล", !r.ok && r.violations.some((v) => v.code === "synastry:forbidden_yin_xu_clash"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ข้ามคนเป็น ขาลชงจอ โดยตรง", ctx);
ck("blocks Thai middle-order ขาลชงจอ", !r.ok && r.violations.some((v) => v.code === "synastry:forbidden_yin_xu_clash"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ข้ามคนเป็น จอชงขาล โดยตรง", ctx);
ck("blocks Thai middle-order จอชงขาล", !r.ok && r.violations.some((v) => v.code === "synastry:forbidden_yin_xu_clash"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ข้ามคนเป็น 寅戌六冲 แบบวันชนวัน", ctx);
ck("blocks 寅戌六冲 / 六沖 variant", !r.ok && r.violations.some((v) => v.code === "synastry:forbidden_yin_xu_clash"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ข้ามคนเป็น 寅戌拱午 และปี午เติมเป็น 寅午戌火局", ctx);
ck("allows 寅戌拱午 / 寅午戌火局", r.ok, JSON.stringify(r.violations));

r = checkSifuFactClaimGate("โครงลูกคือ 戊透干 เป็น七殺โผล่ก้านฟ้า", ctx);
ck("blocks false 戊透干 when visible stems do not include 戊", !r.ok && r.violations.some((v) => v.code === "visible_stem:false_wu_tougan"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("戊ซ่อนใน辰 เป็น藏干 ไม่ใช่透干", ctx);
ck("allows hidden 戊 wording", r.ok, JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ปีจร 2028 戊申 ทำให้ก้านปีจร戊ขึ้นมา แต่พื้นดวง戊ยังซ่อนใน辰", ctx);
ck("allows transit 戊申 wording", r.ok, JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ปีจร 2028 戊申 คือ戊透干ของปีจร", ctx);
ck("allows transit-scoped 戊透干 wording", r.ok, JSON.stringify(r.violations));

const timingCtx = [
  ctx,
  "HK_QUERY_YEAR_LUCK_LOCK_V1[1/1]: 2026/2569->甲午[ค.ศ.2016-2026/พ.ศ.2559-2569] ◆ 2027/2570->乙未[ค.ศ.2027-2036/พ.ศ.2570-2579] ◆ 2028/2571->乙未[ค.ศ.2027-2036/พ.ศ.2570-2579]",
  "HK_YEAR_DAYUN_MAP_V2[1/1]: 2026/2569: year_pillar=丙午/bazi_year=2026-02-04..2027-02-04/dayun=甲午[2016-2026/2559-2569]/ambiguity=none ◆ 2027/2570: year_pillar=丁未/bazi_year=2027-02-04..2028-02-04/dayun=乙未[2027-2036/2570-2579]/ambiguity=none",
  "HK_LICHUN_YEAR_BOUNDARY_LOCK_V1[1/1]: 2026/2569: ก่อน立春=乙巳 หลัง立春=丙午 start=立春:2026-02-04 end=2027-02-04",
  "HK_MONTH_PILLAR_SCENARIO_LOCK_V1 (節氣 month boundary lock): term=立夏@12:26 ICT · before=壬辰 · after=癸巳 · engine_used=壬辰 · merge_forbidden=true · affected=月令,格局,用神,synastry",
  "HK_MONTHLY_DRILLDOWN_SCOPE_V1: available=false · reason=includeTransitMonthlyDrilldown=false_or_no_current_decade_months · outside_scope_policy=ห้ามจัดอันดับรายเดือน/ห้ามบอกตรวจเดือนครบ ถ้าไม่มี block เดือนจรจริง",
].join("\n");

r = checkSifuFactClaimGate("ปี 2569 ลูกอยู่วัยจร 乙未 เต็มปี", timingCtx);
ck("blocks wrong DaYun for queried year", !r.ok && r.violations.some((v) => v.code === "timing:dayun_year_mismatch"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ปี 2027 คือ 丁未 อยู่ในวัยจร 乙未 ตาม map ปีนั้น", timingCtx);
ck("allows LiuNian pillar before correct DaYun in same sentence", r.ok, JSON.stringify(r.violations));

const qiyunOnlyCtx = [
  ctx,
  "HK_QIYUN_LOCK_V1 (起運/大運 authority lock · source=full_day_interval): mode=3p_range · birthTimeKnown=false · direction=backward · startAgeRange=1.94-2.28 · representative=2.11(date_only_representative_for_existing_engine:s1) · targetYear=2026/status=locked/candidates=s1:辛巳 · AI_POLICY=read_packet_only_do_not_recompute",
].join("\n");

r = checkSifuFactClaimGate("ปี 2569 แม่อยู่วัยจร 壬午 ชัดเจน", qiyunOnlyCtx);
ck("blocks DaYun contradicting HK_QIYUN_LOCK", !r.ok && r.violations.some((v) => v.code === "timing:qiyun_lock_conflict"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ปี 2569 แม่อยู่วัยจร 辛巳 ตาม HK_QIYUN_LOCK", qiyunOnlyCtx);
ck("allows DaYun that matches HK_QIYUN_LOCK", r.ok, JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ปี 2569 ลูกอยู่วัยจร 甲午 ตาม map ปีนั้น", timingCtx);
ck("allows correct DaYun for queried year", r.ok, JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ม.ค. 2569 เข้า 丙午 แล้ว", timingCtx);
ck("blocks January before Li Chun being labeled new LiuNian", !r.ok && r.violations.some((v) => v.code === "timing:jan_before_lichun_new_year"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ม.ค. 2569 ก่อน立春ยังเป็น 乙巳 หลัง立春จึงเข้า 丙午", timingCtx);
ck("allows January wording that preserves Li Chun boundary", r.ok, JSON.stringify(r.violations));

r = checkSifuFactClaimGate("แม่ลูกมี 辰戌冲 เป็นแกนถาวร", timingCtx);
ck("blocks unconditional 辰戌冲 when month pillar is scenario-locked", !r.ok && r.violations.some((v) => v.code === "timing:month_scenario_unconditional"), JSON.stringify(r.violations));

r = checkSifuFactClaimGate("ถ้าเดือน=壬辰 จึงมี 辰戌冲; ถ้าเดือน=癸巳 ต้องอ่าน 巳亥冲 แทน", timingCtx);
ck("allows scenario-conditioned 辰戌冲", r.ok, JSON.stringify(r.violations));

r = checkSifuFactClaimGate("3 เดือนหนักที่สุดคือ ส.ค. ต.ค. พ.ค.", timingCtx);
ck("blocks monthly ranking when monthly drilldown is unavailable", !r.ok && r.violations.some((v) => v.code === "timing:monthly_ranking_without_drilldown"), JSON.stringify(r.violations));

const monthlyCtx = timingCtx.replace("HK_MONTHLY_DRILLDOWN_SCOPE_V1: available=false", "HK_MONTHLY_DRILLDOWN_SCOPE_V1: available=true") + "\nเดือนจร=流月01:乙丑 | 流月02:丙寅";
r = checkSifuFactClaimGate("3 เดือนหนักที่สุดดูจากเดือนจรใน packet", monthlyCtx);
ck("allows monthly ranking when monthly drilldown exists", r.ok, JSON.stringify(r.violations));

const ctxWithWu = "PILLAR LOCK: 年戊子 月壬辰 日壬寅 時未知\n透出ก้านฟ้า (透干): 透出=戊壬壬";
r = checkSifuFactClaimGate("พื้นดวงมี 戊透干 ที่ก้านปี", ctxWithWu);
ck("allows 戊透干 when PILLAR LOCK includes 戊", r.ok, JSON.stringify(r.violations));

const authorizedCtx = "PILLAR LOCK: 年丙子 月壬辰 日壬寅 時未知\nข้ามคน: 寅戌 = 六沖/冲";
r = checkSifuFactClaimGate("寅戌冲 ในลิสต์นี้มีจริง", authorizedCtx);
ck("allows 寅戌冲 only when packet authorizes exact pair", r.ok, JSON.stringify(r.violations));

const routeSource = readFileSync(join(process.cwd(), "src/app/api/sifu/route.ts"), "utf8");
ck("route bumps cache key for fact-claim gate", routeSource.includes("v9-factclaim"));
ck("route bumps cache key for timing lock", routeSource.includes("v10-timinglock"));
ck("route bumps cache key for qiyun lock", routeSource.includes("v11-qiyunlock"));
ck("route checks fact claims on JSON replies", /factClaimCheck\s*=\s*checkSifuFactClaimGate\(visibleReply,\s*ctx\)/.test(routeSource));
ck("route bypasses stale cached fact-claim replies", (routeSource.match(/cache bypass: fact claim stale/g) || []).length >= 2);
ck("route blocks fact claims after retry", (routeSource.match(/error:\s*"fact_claim_mismatch"/g) || []).length >= 4);
ck("route scans streaming chunks for fact claims", /stream fact claim FAIL/.test(routeSource) && /GET stream fact claim FAIL/.test(routeSource));
ck("route scans intro OpenRouter stream for fact claims", /intro stream fact claim FAIL/.test(routeSource) && /emitIntroChunk/.test(routeSource));

console.log(`\n[sifu-fact-claim-gate] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
