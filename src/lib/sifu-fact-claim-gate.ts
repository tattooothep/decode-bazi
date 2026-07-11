/* HK_SIFU_FACT_CLAIM_GATE_V1
 * Deterministic post-answer gate for hard chart facts that must not be invented.
 * Scope is intentionally narrow: it blocks the two failure modes seen in web AI output:
 *  - invented 寅戌冲 when packet/synastry does not authorize that clash
 *  - false 戊透干 when PILLAR LOCK visible heavenly stems do not include 戊
 */

export type SifuFactClaimViolationCode =
  | "synastry:forbidden_yin_xu_clash"
  | "visible_stem:false_wu_tougan"
  | "timing:qiyun_lock_conflict"
  | "timing:dayun_year_mismatch"
  | "timing:jan_before_lichun_new_year"
  | "timing:month_scenario_unconditional"
  | "timing:monthly_ranking_without_drilldown";

export type SifuFactClaimViolation = {
  code: SifuFactClaimViolationCode;
  label: string;
  reason: string;
  evidence: string;
};

export type SifuFactClaimCheck = {
  ok: boolean;
  skipped: boolean;
  visibleStems: string[];
  violations: SifuFactClaimViolation[];
};

const STEMS_RE = /[甲乙丙丁戊己庚辛壬癸]/g;
const STEM_BRANCH_RE = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g;
const NEGATIVE_CONTEXT_RE = /ห้าม|ไม่ใช่|ไม่มี|อย่า|forbid|forbidden|guard|not\s+a|never|≠|invalid/i;
const YIN_XU_CLASH_RE = /寅\s*戌\s*(?:六)?[冲沖]|寅\s*(?:六)?[冲沖]\s*戌|(?:六)?[冲沖]\s*寅\s*戌|戌\s*寅\s*(?:六)?[冲沖]|戌\s*(?:六)?[冲沖]\s*寅|(?:六)?[冲沖]\s*戌\s*寅|ขาล.{0,10}จอ.{0,10}(ชง|ปะทะ)|จอ.{0,10}ขาล.{0,10}(ชง|ปะทะ)|ขาล.{0,10}(ชง|ปะทะ).{0,10}จอ|จอ.{0,10}(ชง|ปะทะ).{0,10}ขาล/i;
const YIN_XU_BRIDGE_RE = /寅[\s\S]{0,16}戌[\s\S]{0,20}(拱|虛拱|虚拱|โอบ)|戌[\s\S]{0,16}寅[\s\S]{0,20}(拱|虛拱|虚拱|โอบ)/;
const WU_TOUGAN_RE = /戊.{0,16}(透干|透出|ก้านฟ้า|โผล่ก้าน|โผล่บนฟ้า|ขึ้นก้าน)|(?:透干|透出|ก้านฟ้า|โผล่ก้าน|โผล่บนฟ้า|ขึ้นก้าน).{0,16}戊/i;
const TRANSIT_SEGMENT_RE = /ปีจร|流年|วัยจร|大運|运|運|戊申|戊戌|戊子|戊寅|戊辰|戊午|戊申|戊戌|20\d{2}|พ\.ศ\./i;
const NATAL_SCOPE_RE = /ผัง|พื้นดวง|ดวงเดิม|โครง|月令|PILLAR|原局|natal/i;
const NEGATED_REPLY_SEGMENT_RE = /ไม่ใช่|ไม่ใช่ชง|ไม่มี|ห้าม|อย่า|not\s+a|is\s+not|不是|非/i;
const YEAR_RE = /(20\d{2}|25\d{2})/g;
const DAYUN_CLAIM_RE = /(?:大運|วัยจร|運|运).{0,40}?([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*(?:大運|運|运)/gi;
const JAN_SEGMENT_RE = /(มกราคม|ม\.ค\.|January|Jan)/i;
const MONTHLY_RANKING_RE = /(อันดับ|ranking|rank|top|best|worst|ดีที่สุด|แย่สุด|หนักที่สุด|เปิดโอกาสที่สุด|รายเดือน|เดือนที่|12 เดือน|monthly|流月)/i;
const CHEN_XU_CLASH_RE = /辰\s*戌\s*(?:六)?[冲沖]|辰\s*(?:六)?[冲沖]\s*戌|戌\s*辰\s*(?:六)?[冲沖]|戌\s*(?:六)?[冲沖]\s*辰|มะโรง.{0,12}จอ.{0,12}(ชง|ปะทะ)|จอ.{0,12}มะโรง.{0,12}(ชง|ปะทะ)/i;
const MONTH_SCENARIO_CONDITION_RE = /(ถ้า|กรณี|scenario|ฝั่ง|ก่อน|หลัง).{0,24}(壬辰|癸巳|เดือน\s*=\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/i;
/* คำบ่งชี้ "กำลังจะสลับ/ย่างเข้า大運ใหม่" · ใช้ยกเว้นเฉพาะปีรอยต่อ (交運) ที่พูดถึงวัยจรถัดไปได้ตามจริง
 * เจตนา: จับเฉพาะภาษา "สลับ/เปลี่ยนวัยจร" ชัดๆ · เลี่ยงคำสามัญกว้าง (ต่อไป/ถัดไป/ข้างหน้า) ที่โผล่ในประโยคทั่วไป */
const DAYUN_TRANSITION_RE = /กำลังจะ|จะสลับ|จะเข้าสู่|สลับเข้า|กำลังสลับ|ย่างเข้า|ย่างสู่|เปลี่ยนเข้า|กำลังเข้า|ก้าวเข้า|เริ่มเข้าสู่|เข้าสู่ช่วง|เข้าสู่วัยจรใหม่|ปลายวัยจร|ท้ายวัยจร|交運|交脫|approaching|entering|about to|upcoming|transition|switch(?:ing)?/i;

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function splitSegments(text: string): string[] {
  return (text || "")
    .split(/[\n\r。.!?！？]+|(?<=ครับ)|(?<=ค่ะ)|(?<=คะ)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractVisibleStemsFromTouganLine(ctx: string): string[] {
  const m = (ctx || "").match(/透出ก้านฟ้า[^\n]*透出=([甲乙丙丁戊己庚辛壬癸]+)/);
  return m?.[1]?.match(STEMS_RE) || [];
}

function extractVisibleStemsFromPillarLock(ctx: string): string[] {
  const m = (ctx || "").match(/PILLAR LOCK[^\n]*/i);
  if (!m) return [];
  const line = m[0];
  const stems: string[] = [];
  const pillarRe = /(?:年|月|日|時|时)\s*([甲乙丙丁戊己庚辛壬癸])/g;
  let hit: RegExpExecArray | null;
  while ((hit = pillarRe.exec(line))) stems.push(hit[1]);
  if (stems.length) return stems;
  const loose = line.match(STEMS_RE) || [];
  return loose.slice(0, 4);
}

export function extractSifuVisibleStems(ctx: string): string[] {
  const tougan = extractVisibleStemsFromTouganLine(ctx);
  if (tougan.length) return uniq(tougan);
  return uniq(extractVisibleStemsFromPillarLock(ctx));
}

function extractYearDayunMap(ctx: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (year: string, pillar: string) => {
    const ad = Number(year);
    const keys = [String(ad)];
    if (ad >= 1900 && ad < 2200) keys.push(String(ad + 543));
    if (ad >= 2400 && ad < 2800) keys.push(String(ad - 543));
    for (const key of keys) {
      if (!out.has(key)) out.set(key, new Set());
      out.get(key)!.add(pillar);
    }
  };
  const re1 = /(\d{4})\/(\d{4})->([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g;
  const re2 = /(\d{4})\/(\d{4}):[^◆\n]*?\/dayun=([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g;
  let hit: RegExpExecArray | null;
  while ((hit = re1.exec(ctx))) {
    add(hit[1], hit[3]);
    add(hit[2], hit[3]);
  }
  while ((hit = re2.exec(ctx))) {
    add(hit[1], hit[3]);
    add(hit[2], hit[3]);
  }
  return out;
}

/* ปี → 流年 (year_pillar) จาก HK_YEAR_DAYUN_MAP_V2 · ใช้ยกเว้นกรณี AI พูดปีจรถูก แต่มีคำ "วัยจร" อยู่ใกล้จนด่านนึกว่าเป็นวัยจร */
function extractYearLiunianMap(ctx: string): Map<string, string> {
  const out = new Map<string, string>();
  const add = (year: string, pillar: string) => {
    const ad = Number(year);
    const keys = [String(ad)];
    if (ad >= 1900 && ad < 2200) keys.push(String(ad + 543));
    if (ad >= 2400 && ad < 2800) keys.push(String(ad - 543));
    for (const key of keys) if (!out.has(key)) out.set(key, pillar);
  };
  const re = /(\d{4})\/(\d{4}):\s*year_pillar=([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(ctx))) {
    add(hit[1], hit[3]);
    add(hit[2], hit[3]);
  }
  return out;
}

/* ปี → ปีที่วัยจรนั้นสิ้นสุด (交運 ค.ศ.) จาก HK_QUERY_YEAR_LUCK_LOCK_V1 (…->干支[ค.ศ.start-end…]) หรือ HK_YEAR_DAYUN_MAP_V2 (…/dayun=干支[start-end…]) · ปีที่ = end คือปีรอยต่อ พูดวัยจรถัดไปได้ */
function extractDayunEndYearMap(ctx: string): Map<string, number> {
  const out = new Map<string, number>();
  const conflict = new Set<string>();
  const add = (year: string, end: number) => {
    const ad = Number(year);
    const keys = [String(ad)];
    if (ad >= 1900 && ad < 2200) keys.push(String(ad + 543));
    if (ad >= 2400 && ad < 2800) keys.push(String(ad - 543));
    for (const key of keys) {
      if (conflict.has(key)) continue;
      const prev = out.get(key);
      if (prev !== undefined && prev !== end) { out.delete(key); conflict.add(key); continue; } // ดวงกลุ่ม: ปีเดียวชนหลายช่วงวัยจร → ทิ้ง ไม่มาร์ค boundary (fail-closed)
      out.set(key, end);
    }
  };
  // ทน whitespace รอบเครื่องหมาย · กัน format packet เพี้ยนเล็กน้อยแล้ว dayunEndMap ตายเงียบ (ชี้โดยลายเซน edge-case)
  const re1 = /(\d{4})\s*\/\s*(\d{4})\s*->\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]\s*\[\s*ค\.ศ\.\s*\d{4}\s*-\s*(\d{4})/g;
  const re2 = /(\d{4})\s*\/\s*(\d{4})\s*:[^◆\n]*?\/dayun=\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]\s*\[\s*(\d{4})\s*-\s*(\d{4})/g;
  let hit: RegExpExecArray | null;
  while ((hit = re1.exec(ctx))) {
    const end = Number(hit[3]);
    add(hit[1], end);
    add(hit[2], end);
  }
  while ((hit = re2.exec(ctx))) {
    const end = Number(hit[4]);
    add(hit[1], end);
    add(hit[2], end);
  }
  return out;
}

function extractQiyunTargetLocks(ctx: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (year: string, pillar: string) => {
    const ad = Number(year);
    const keys = [String(ad)];
    if (ad >= 1900 && ad < 2200) keys.push(String(ad + 543));
    if (ad >= 2400 && ad < 2800) keys.push(String(ad - 543));
    for (const key of keys) {
      if (!out.has(key)) out.set(key, new Set());
      out.get(key)!.add(pillar);
    }
  };
  const re = /HK_QIYUN_LOCK_V1[^\n]*targetYear=(\d{4})\/status=locked\/candidates=([^·\n]+)/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(ctx || ""))) {
    const year = hit[1];
    const pillars = hit[2].match(STEM_BRANCH_RE) || [];
    for (const p of pillars) add(year, p);
  }
  return out;
}

function extractLichunMap(ctx: string): Map<string, { before: string; after: string }> {
  const out = new Map<string, { before: string; after: string }>();
  const add = (year: string, before: string, after: string) => {
    const ad = Number(year);
    const keys = [String(ad)];
    if (ad >= 1900 && ad < 2200) keys.push(String(ad + 543));
    if (ad >= 2400 && ad < 2800) keys.push(String(ad - 543));
    for (const key of keys) out.set(key, { before, after });
  };
  const re = /(\d{4})\/(\d{4}):\s*ก่อน立春=([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]|-)\s*หลัง立春=([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(ctx))) {
    if (hit[3] === "-") continue;
    add(hit[1], hit[3], hit[4]);
    add(hit[2], hit[3], hit[4]);
  }
  return out;
}

function yearsInSegment(segment: string): string[] {
  const years: string[] = [];
  let hit: RegExpExecArray | null;
  YEAR_RE.lastIndex = 0;
  while ((hit = YEAR_RE.exec(segment))) years.push(hit[1]);
  return uniq(years);
}

function dayunClaimsInSegment(segment: string): string[] {
  const claims: string[] = [];
  let hit: RegExpExecArray | null;
  DAYUN_CLAIM_RE.lastIndex = 0;
  while ((hit = DAYUN_CLAIM_RE.exec(segment))) claims.push(hit[1] || hit[2]);
  return uniq(claims);
}

function hasDayunYearMismatch(reply: string, ctx: string): { year: string; expected: string; got: string; segment: string } | null {
  const map = extractYearDayunMap(ctx);
  if (!map.size) return null;
  const liunianMap = extractYearLiunianMap(ctx);
  const dayunEndMap = extractDayunEndYearMap(ctx);
  for (const segment of splitSegments(reply)) {
    if (NEGATED_REPLY_SEGMENT_RE.test(segment)) continue;
    const years = yearsInSegment(segment);
    if (years.length !== 1) continue;
    const year = years[0];
    const allowed = map.get(year);
    if (!allowed || allowed.size !== 1) continue;
    const expected = Array.from(allowed)[0];
    const claims = dayunClaimsInSegment(segment);
    /* ยกเว้นก่อนตัดสิน:
     *  (ก) 流年 confusion — คำที่จับได้ = ปีจร (year_pillar) ของปีนั้น ไม่ใช่วัยจร (คำ "วัยจร" บังเอิญอยู่ใกล้)
     *  (ข) 交運 boundary — ปีนั้นเป็นปีที่วัยจรปัจจุบันสิ้นสุด (year === dayunEnd) และประโยคใช้ภาษา "กำลังจะสลับ/ย่างเข้า" → พูดวัยจรถัดไปได้ตามจริง */
    const liunian = liunianMap.get(year);
    const adYear = Number(year) >= 2400 ? Number(year) - 543 : Number(year); // ปีจบวัยจรเก็บเป็น ค.ศ. เสมอ · แปลง พ.ศ.→ค.ศ. ก่อนเทียบ
    const isBoundaryYear = dayunEndMap.get(year) === adYear;
    const hasTransitionLang = DAYUN_TRANSITION_RE.test(segment);
    const nextDayun = map.get(String(adYear + 1)); // วัยจรของปีถัดไป (ปีรอยต่อ → คือวัยจรที่กำลังจะเข้า)
    const bad = claims.find((p) => {
      if (p === expected) return false;
      if (liunian && p === liunian) return false;                                 // (ก) เป็นปีจร ไม่ใช่วัยจรผิด
      if (isBoundaryYear && hasTransitionLang && nextDayun && nextDayun.has(p)) return false; // (ข) ปีรอยต่อ + ภาษาสลับ + อ้างวัยจรถัดไป "จริง" เท่านั้น
      return true;
    });
    if (bad) return { year, expected, got: bad, segment };
  }
  return null;
}

function hasQiyunLockConflict(reply: string, ctx: string): { year: string; expected: string; got: string; segment: string } | null {
  const map = extractQiyunTargetLocks(ctx);
  if (!map.size) return null;
  for (const segment of splitSegments(reply)) {
    if (NEGATED_REPLY_SEGMENT_RE.test(segment)) continue;
    const years = yearsInSegment(segment);
    if (years.length !== 1) continue;
    const allowed = map.get(years[0]);
    if (!allowed || allowed.size !== 1) continue;
    const expected = Array.from(allowed)[0];
    const claims = dayunClaimsInSegment(segment);
    const bad = claims.find((p) => p !== expected);
    if (bad) return { year: years[0], expected, got: bad, segment };
  }
  return null;
}

function hasJanBeforeLichunNewYearClaim(reply: string, ctx: string): { year: string; before: string; after: string; segment: string } | null {
  const map = extractLichunMap(ctx);
  if (!map.size) return null;
  let hit: RegExpExecArray | null;
  YEAR_RE.lastIndex = 0;
  while ((hit = YEAR_RE.exec(reply || ""))) {
    const year = hit[1];
    const lock = map.get(year);
    if (!lock) continue;
    const start = Math.max(0, hit.index - 48);
    const end = Math.min(reply.length, hit.index + year.length + 80);
    const segment = reply.slice(start, end);
    if (!JAN_SEGMENT_RE.test(segment) || NEGATED_REPLY_SEGMENT_RE.test(segment)) continue;
    const pillars: string[] = segment.match(STEM_BRANCH_RE) || [];
    if (pillars.includes(lock.after) && !pillars.includes(lock.before) && !/หลัง\s*立春|หลังลี่ชุน|after\s+Li\s+Chun/i.test(segment)) {
      return { year, before: lock.before, after: lock.after, segment };
    }
  }
  return null;
}

function contextHasMonthScenario(ctx: string): boolean {
  return /HK_MONTH_PILLAR_SCENARIO_LOCK_V1[\s\S]{0,240}merge_forbidden=true|HK_TWO_SCENARIOS_V1[\s\S]{0,160}scenario_before=/.test(ctx);
}

function hasUnconditionalChenXuClash(reply: string, ctx: string): boolean {
  if (!contextHasMonthScenario(ctx)) return false;
  return splitSegments(reply).some((segment) => {
    if (!CHEN_XU_CLASH_RE.test(segment)) return false;
    if (NEGATED_REPLY_SEGMENT_RE.test(segment)) return false;
    return !MONTH_SCENARIO_CONDITION_RE.test(segment);
  });
}

function hasMonthlyRankingWithoutDrilldown(reply: string, ctx: string): boolean {
  if (!MONTHLY_RANKING_RE.test(reply)) return false;
  if (/HK_MONTHLY_DRILLDOWN_SCOPE_V1:\s*available=true/.test(ctx) && ctx.includes("เดือนจร=")) return false;
  return true;
}

function contextAuthorizesYinXuClash(ctx: string): boolean {
  const lines = (ctx || "").split(/\n+/);
  return lines.some((line) => {
    if (!line.includes("寅") || !line.includes("戌")) return false;
    if (!/[冲沖]|六沖|六冲|ชง|ปะทะ/.test(line)) return false;
    if (NEGATIVE_CONTEXT_RE.test(line)) return false;
    if (YIN_XU_BRIDGE_RE.test(line)) return false;
    return true;
  });
}

function contextHasYinXuBridge(ctx: string): boolean {
  return (ctx || "").split(/\n+/).some((line) => line.includes("寅") && line.includes("戌") && YIN_XU_BRIDGE_RE.test(line));
}

function hasFalseWuTouganClaim(reply: string, visibleStems: string[]): boolean {
  if (!reply || visibleStems.includes("戊")) return false;
  return splitSegments(reply).some((segment) => {
    if (!WU_TOUGAN_RE.test(segment)) return false;
    if (NEGATED_REPLY_SEGMENT_RE.test(segment)) return false;
    if (TRANSIT_SEGMENT_RE.test(segment) && !NATAL_SCOPE_RE.test(segment)) return false;
    return true;
  });
}

function hasUnauthorizedYinXuClashClaim(reply: string): boolean {
  return splitSegments(reply).some((segment) => {
    if (!YIN_XU_CLASH_RE.test(segment)) return false;
    if (NEGATED_REPLY_SEGMENT_RE.test(segment)) return false;
    return true;
  });
}

export function checkSifuFactClaimGate(reply: string, ctx: string): SifuFactClaimCheck {
  const visibleStems = extractSifuVisibleStems(ctx);
  const violations: SifuFactClaimViolation[] = [];
  const text = reply || "";

  if (hasUnauthorizedYinXuClashClaim(text) && !contextAuthorizesYinXuClash(ctx)) {
    violations.push({
      code: "synastry:forbidden_yin_xu_clash",
      label: "ห้ามสร้าง 寅戌冲",
      reason: contextHasYinXuBridge(ctx)
        ? "packet ให้ 寅↔戌 เป็น 拱/虛拱 ไม่ใช่ 冲; ถ้ามี午เติมให้อ่าน 寅午戌火局"
        : "packet ไม่ได้ authorize คู่ 寅↔戌 เป็น 六冲",
      evidence: "reply contains 寅戌冲 / ขาล-จอชง while packet lacks matching authorized clash",
    });
  }

  if (visibleStems.length && hasFalseWuTouganClaim(text, visibleStems)) {
    violations.push({
      code: "visible_stem:false_wu_tougan",
      label: "ห้ามพูด 戊透干 ถ้า PILLAR LOCK ไม่มี戊",
      reason: `visible heavenly stems from packet are ${visibleStems.join("")}; 戊 is hidden/root only unless it appears in PILLAR LOCK or a specific transit stem`,
      evidence: "reply claims 戊透干 / 戊โผล่ก้านฟ้า",
    });
  }

  const qiyunConflict = hasQiyunLockConflict(text, ctx);
  if (qiyunConflict) {
    violations.push({
      code: "timing:qiyun_lock_conflict",
      label: "ห้ามใช้วัยจรขัด HK_QIYUN_LOCK",
      reason: `HK_QIYUN_LOCK_V1 ล็อกปี ${qiyunConflict.year} เป็น大運 ${qiyunConflict.expected}; reply อ้าง ${qiyunConflict.got}`,
      evidence: qiyunConflict.segment.slice(0, 240),
    });
  }

  const dayunMismatch = hasDayunYearMismatch(text, ctx);
  if (dayunMismatch) {
    violations.push({
      code: "timing:dayun_year_mismatch",
      label: "ห้ามใช้วัยจรผิดปี",
      reason: `ปี ${dayunMismatch.year} ใน packet map อยู่大運 ${dayunMismatch.expected}; reply อ้าง ${dayunMismatch.got}`,
      evidence: dayunMismatch.segment.slice(0, 240),
    });
  }

  const janLichun = hasJanBeforeLichunNewYearClaim(text, ctx);
  if (janLichun) {
    violations.push({
      code: "timing:jan_before_lichun_new_year",
      label: "ห้ามเรียกมกราคมก่อน立春เป็นปีจรใหม่",
      reason: `ปี ${janLichun.year} ก่อน立春ยังเป็น ${janLichun.before}; หลัง立春จึงเป็น ${janLichun.after}`,
      evidence: janLichun.segment.slice(0, 240),
    });
  }

  if (hasUnconditionalChenXuClash(text, ctx)) {
    violations.push({
      code: "timing:month_scenario_unconditional",
      label: "ห้ามฟันธง 辰戌冲 เมื่อเสาเดือนก้ำกึ่ง",
      reason: "packet มี HK_MONTH_PILLAR_SCENARIO_LOCK/HK_TWO_SCENARIOS; claim ที่พึ่ง月柱ต้องเขียนเป็นเงื่อนไข ถ้าเดือน=壬辰/ถ้าเดือน=癸巳",
      evidence: "reply mentions 辰戌冲 / มะโรง-จอชง without month-scenario condition",
    });
  }

  if (hasMonthlyRankingWithoutDrilldown(text, ctx)) {
    violations.push({
      code: "timing:monthly_ranking_without_drilldown",
      label: "ห้ามจัดอันดับรายเดือนถ้าไม่มีเดือนจรเต็ม",
      reason: "packet ไม่มี HK_MONTHLY_DRILLDOWN_SCOPE_V1 available=true พร้อมเดือนจรจริง หรือ prompt นี้ตัด monthly drilldown",
      evidence: "reply contains monthly ranking / เดือนหนักที่สุด / เดือนเปิดโอกาสที่สุด",
    });
  }

  return {
    ok: violations.length === 0,
    skipped: !text.trim(),
    visibleStems,
    violations,
  };
}
