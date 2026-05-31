/**
 * bazi-synastry.ts · ปฏิกิริยาข้ามคน (synastry · 合婚)
 *
 * แยกออกจาก src/app/api/sifu/group/route.ts (31 พ.ค. · เฟส 0 refactor) เพื่อ:
 *   - test ได้ตรง (group/route.ts import next/server → import ตรงไม่ได้)
 *   - ไม่บวม route LOCKED · ขยายปฏิกิริยา (天干五合/刑/三合/暗合) ในไฟล์เดียว
 *
 * เฟส 0 = ย้าย logic ออกจาก route (pure) · เฟส 1 = +เสาเดือน(日月年) +天干五合(raw緣·ไม่ฟัน化) + borderline flag
 * ตาราง = ค่าคงที่ตำรา (copy จาก chart-extensions LOCKED · self-contained · ไม่แตะ engine)
 * ⚠️ ฉันทามติ 6 เสียง+ซินแส: 天干五合ข้ามคน = 緣(ผูกพัน) ไม่ใช่化氣格 (ห้ามฟัน化/得令 · ดู月令รายคน) · ตัด刑(任鐵樵俗謬) · 害·破อ่อน
 * เฟสถัดไป: +เสายาม(時) +三合/三會/暗合 ข้ามคน · /api/sifu/compare
 */

export type PersonSyn = {
  name: string;
  role: string;
  isSelf: boolean;
  text: string;
  mode: "3p" | "4p" | "err";
  dmEl: string;
  yongEls: string[];
  /* 31 พ.ค. เฟส 1: เพิ่ม month (จับ 天干五合 ก้านเดือน เช่น 丁壬) · hour รอเฟส 2 */
  pillars: { year?: { stem: string; branch: string }; month?: { stem: string; branch: string }; day?: { stem: string; branch: string } } | null;
  /* เสาเดือนคน 3 เสา (ไม่รู้เวลา) เกิดคาบ節氣 = ก้ำกึ่ง → hit ที่พึ่งเสาเดือน ต้องติดธง "ขึ้นกับเวลาเกิด" */
  monthBorderline?: boolean;
  /* เสาปีก้ำกึ่ง: เกิดวัน立春 (ปี干支เปลี่ยน 乙亥↔丙子) → hit ที่พึ่งเสาปี ต้องติดธงด้วย (เสาวัน日 ไม่เคยก้ำกึ่งจาก節氣) */
  yearBorderline?: boolean;
};

const BRANCH_TH_NAME: Record<string, string> = {
  子: "ชวด", 丑: "ฉลู", 寅: "ขาล", 卯: "เถาะ", 辰: "มะโรง", 巳: "มะเส็ง",
  午: "มะเมีย", 未: "มะแม", 申: "วอก", 酉: "ระกา", 戌: "จอ", 亥: "กุน",
};
const SYN_HE: Record<string, string> = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
const SYN_CLASH: Record<string, string> = { 子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅", 卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳" };
const SYN_HARM: Record<string, string> = { 子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅", 卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉" };
const SYN_DESTROY: Record<string, string> = { 子: "酉", 酉: "子", 丑: "辰", 辰: "丑", 寅: "亥", 亥: "寅", 卯: "午", 午: "卯", 巳: "申", 申: "巳", 未: "戌", 戌: "未" };
const SYN_SHENG: Record<string, string> = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };
const SYN_KE: Record<string, string> = { wood: "earth", fire: "metal", earth: "water", metal: "wood", water: "fire" };
const EL_TH: Record<string, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
const EL_EN: Record<string, string> = { wood: "Wood", fire: "Fire", earth: "Earth", metal: "Metal", water: "Water" };
const EL_ZH: Record<string, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };

type RelZh = "六合" | "六沖" | "六害" | "六破";
const REL_LABEL: Record<RelZh, { th: string; en: string; zh: string }> = {
  "六合": { th: "ผสาน(合)", en: "Harmony(合)", zh: "六合" },
  "六沖": { th: "ปะทะ(冲)", en: "Clash(冲)", zh: "六沖" },
  "六害": { th: "แทรก(害)", en: "Harm(害)", zh: "六害" },
  "六破": { th: "บั่นทอน(破)", en: "Break(破)", zh: "六破" },
};
/* คืน "ทุก" ความสัมพันธ์ · กิ่งคู่หนึ่งเป็นได้หลายอย่างพร้อมกัน (寅亥/巳申 = ทั้ง 六合 และ 六破 ตามตำรา) */
function branchRel(a: string, b: string): RelZh[] {
  const out: RelZh[] = [];
  if (SYN_HE[a] === b) out.push("六合");
  if (SYN_CLASH[a] === b) out.push("六沖");
  if (SYN_HARM[a] === b) out.push("六害");
  if (SYN_DESTROY[a] === b) out.push("六破");
  return out;
}
const PILLAR_LABEL_SYN: Record<string, Record<string, string>> = {
  th: { day: "เสาวัน", month: "เสาเดือน", year: "เสาปี" },
  en: { day: "Day", month: "Month", year: "Year" },
  zh: { day: "日柱", month: "月柱", year: "年柱" },
};

/* 天干五合 (甲己/乙庚/丙辛/丁壬/戊癸) · เฟส 1 = raw ผูกพัน(緣) เท่านั้น
 * ⚠️ ห้ามใส่ "化象/化X/得令" ลง output (合ข้ามคน=緣 ไม่ใช่化氣格 · ต้องดู月令รายคนในดวงเดี่ยว · ฉันทามติ 6 เสียง+ซินแส) */
const STEM_FIVE_HE: Record<string, { partner: string; pairZh: string }> = {
  甲: { partner: "己", pairZh: "甲己合" }, 己: { partner: "甲", pairZh: "甲己合" },
  乙: { partner: "庚", pairZh: "乙庚合" }, 庚: { partner: "乙", pairZh: "乙庚合" },
  丙: { partner: "辛", pairZh: "丙辛合" }, 辛: { partner: "丙", pairZh: "丙辛合" },
  丁: { partner: "壬", pairZh: "丁壬合" }, 壬: { partner: "丁", pairZh: "丁壬合" },
  戊: { partner: "癸", pairZh: "戊癸合" }, 癸: { partner: "戊", pairZh: "戊癸合" },
};
const HE5_LABEL: Record<string, string> = {
  th: "ก้านห้าฮะ·ดึงดูด/ผูกพัน(緣)", en: "Stem-Five-Harmony·affinity(緣)", zh: "天干五合·緣",
};
/* ลำดับเสาที่เทียบข้ามคน · เฟส 1 = 日+月+年 (hour รอเฟส 2) */
const SYN_AXES = ["day", "month", "year"] as const;
/* generic "เสาก้ำกึ่ง" (ใช้ทั้ง month節氣 + year立春) · ไม่ผูกชื่อเสา (label เสาอยู่ใน hit string แล้ว) */
const BORDER_TAG: Record<string, string> = {
  th: " ⚠️[ขึ้นกับเวลาเกิด·เสาก้ำกึ่ง]", en: " ⚠️[depends on birth time·borderline pillar]", zh: " ⚠️[視出生時辰·柱臨界]",
};

/* เทียบปฏิกิริยาข้ามคน · 日月年 ก้าน+กิ่ง (六合/六冲/六害/六破 + 天干五合 raw緣) · CLOSED LIST (เช็คครบทุกคู่ · ห้ามแต่งคู่นอกลิสต์) */
export function buildSynastry(people: PersonSyn[], lang: string): string {
  const L = (lang === "en" || lang === "zh") ? lang : "th";
  const valid = people.filter((p) => p.pillars && p.mode !== "err");
  if (valid.length < 2) return "";
  const elName = L === "en" ? EL_EN : L === "zh" ? EL_ZH : EL_TH;
  const pL = (k: string) => PILLAR_LABEL_SYN[L][k] || k;
  /* ชื่อกิ่ง: ไทยใช้ราศี (ชวด/ฉลู) · จีน/อังกฤษใช้กิ่งจีน (子/丑) ไม่ปนราศีไทย */
  const bN = (b: string) => (L === "th" ? (BRANCH_TH_NAME[b] || b) : b);
  const lines: string[] = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const A = valid[i], B = valid[j];
      const hits: string[] = [];
      /* tag "ขึ้นกับเวลาเกิด" เมื่อ hit พึ่งเสาเดือน(ทุก節氣)หรือเสาปี(เฉพาะ立春)ของคนที่ก้ำกึ่ง · เสาวัน(日)ไม่เคยก้ำกึ่งจาก節氣 */
      const axBorder = (k: string, p: PersonSyn) => (k === "month" && p.monthBorderline) || (k === "year" && p.yearBorderline);
      const blTag = (ka: string, kb: string) => (axBorder(ka, A) || axBorder(kb, B)) ? BORDER_TAG[L] : "";
      /* axis_B · กิ่ง 日+月+年 ข้ามคน (六合/六冲/六害/六破) */
      for (const ka of SYN_AXES) {
        for (const kb of SYN_AXES) {
          const ba = A.pillars?.[ka]?.branch, bb = B.pillars?.[kb]?.branch;
          if (!ba || !bb) continue;
          const rels = branchRel(ba, bb);
          for (const rel of rels) hits.push(`${pL(ka)}${bN(ba)}×${pL(kb)}${bN(bb)} ${REL_LABEL[rel][L]}${blTag(ka, kb)}`);
        }
      }
      /* axis_C · 天干五合 (ก้าน 日+月+年) ข้ามคน · raw "ดึงดูด/ผูกพัน(緣)" เท่านั้น
       * ⚠️ ไม่ฟัน化/不化 · ไม่ใส่化象/得令 (合ข้ามคน=緣 ไม่ใช่化氣格 · ดู月令รายคนในดวงเดี่ยว) */
      for (const ka of SYN_AXES) {
        for (const kb of SYN_AXES) {
          const sa = A.pillars?.[ka]?.stem, sb = B.pillars?.[kb]?.stem;
          if (!sa || !sb) continue;
          const combo = STEM_FIVE_HE[sa];
          if (combo && combo.partner === sb) {
            hits.push(`${pL(ka)}${sa}×${pL(kb)}${sb} ${HE5_LABEL[L]}(${combo.pairZh})${blTag(ka, kb)}`);
          }
        }
      }
      /* axis_A · ธาตุวันเจ้า A↔B (生/剋/同) */
      const ea = A.dmEl, eb = B.dmEl;
      let elRel = "";
      if (ea && eb && ea !== "unknown" && eb !== "unknown") {
        if (ea === eb) elRel = L === "en" ? "same element (peer)" : L === "zh" ? "同類(比肩)" : "ธาตุเดียวกัน(เพื่อน)";
        else if (SYN_SHENG[ea] === eb) elRel = L === "en" ? `${elName[ea]}→${elName[eb]} (1 generates 2)` : L === "zh" ? `${EL_ZH[ea]}生${EL_ZH[eb]}(1生2)` : `${EL_TH[ea]}เสริม${EL_TH[eb]} (คน1เกื้อคน2)`;
        else if (SYN_SHENG[eb] === ea) elRel = L === "en" ? `${elName[eb]}→${elName[ea]} (2 generates 1)` : L === "zh" ? `${EL_ZH[eb]}生${EL_ZH[ea]}(2生1)` : `${EL_TH[eb]}เสริม${EL_TH[ea]} (คน2เกื้อคน1)`;
        else if (SYN_KE[ea] === eb) elRel = L === "en" ? `${elName[ea]} controls ${elName[eb]} (1剋2)` : L === "zh" ? `${EL_ZH[ea]}剋${EL_ZH[eb]}(1剋2)` : `${EL_TH[ea]}ข่ม${EL_TH[eb]} (คน1คุมคน2)`;
        else if (SYN_KE[eb] === ea) elRel = L === "en" ? `${elName[eb]} controls ${elName[ea]} (2剋1)` : L === "zh" ? `${EL_ZH[eb]}剋${EL_ZH[ea]}(2剋1)` : `${EL_TH[eb]}ข่ม${EL_TH[ea]} (คน2คุมคน1)`;
      }
      /* axis_A เสริม · ธาตุของอีกฝ่ายช่วย 用神 ของเราไหม */
      const helps: string[] = [];
      if (eb && A.yongEls.includes(eb)) helps.push(L === "en" ? "2's element aids 1's 用神" : L === "zh" ? "2之五行助1用神" : "ธาตุคน2 ช่วย用神คน1");
      if (ea && B.yongEls.includes(ea)) helps.push(L === "en" ? "1's element aids 2's 用神" : L === "zh" ? "1之五行助2用神" : "ธาตุคน1 ช่วย用神คน2");
      /* push เฉพาะคู่ที่มีปฏิกิริยา "เด่น": กิ่ง合冲害破 หรือ 用神ช่วยกัน
       * (ธาตุวันเจ้า生剋มีเกือบทุกคู่ = ไม่ใช่จุดเด่น · แสดงเป็น context เสริมเมื่อคู่นั้น push แล้วเท่านั้น กัน noise) */
      if (hits.length || helps.length) {
        const parts = [`${A.name || "?"} ↔ ${B.name || "?"}`];
        if (hits.length) parts.push(hits.join(" · "));
        if (helps.length) parts.push(helps.join(" · "));
        if (elRel) parts.push(elRel);
        lines.push("  - " + parts.join(" | "));
      }
    }
  }
  /* 31 พ.ค. · CLOSED LIST · loop เช็คครบทุกคู่ C(M,2) แล้ว (i×j ด้านบน) แต่ push เฉพาะคู่เด่น
   * → header ต้องบอก AI ว่า "เช็คครบแล้ว" + ห้ามแต่งคู่นอกลิสต์ (กันบั๊ก 辰戌冲 ที่ AI เคยเอื้อมจับเอง)
   * + แยก "ปฏิกิริยาในดวงเดี่ยว=อ่านเต็ม" vs "ข้ามคน=เฉพาะลิสต์นี้" กัน AI เอาปฏิกิริยาในดวงไปยัดข้ามคน */
  const M = valid.length;
  const totalPairs = (M * (M - 1)) / 2;
  const names = valid.map((p) => p.name || "?").join(", ");
  const shown = lines.length;
  const title = L === "en"
    ? `━━━ Cross-person reactions (synastry) — CLOSED LIST. Compared ALL ${totalPairs} pair(s) among ${M} people [${names}], using each one's 日月年 pillars (stems+branches: 六合/六冲/六害/六破 + 天干五合). Below are ONLY the ${shown} pair(s) with a prominent reaction. Any pair NOT listed = checked and has NO prominent cross-person reaction (a conclusion, NOT "unchecked"). DO NOT create or infer 合/冲/破/害/天干五合 for any person/pair not in this list. (Each single person's in-chart interactions → read in full per the interaction classic; CROSS-PERSON → only this list.) WEIGHT (任鐵樵): 三合/三會 strong > 六合/六冲 > 害·破 weak (削之可也/不經). 天干五合 cross-person = affinity/bond (緣), good-or-bad depends on each one's 用神 — NOT a 化氣格; do NOT declare 化木/化X (keep stems' original elements; 化 is judged only per each person's own 月令). 合 not always good / 冲 not always bad — weigh against each one's 用神/role, state direction/outcome plainly; only forbidden: 'commanding' break-up/no-contact. ━━━`
    : L === "zh"
    ? `━━━ 跨人互動 (synastry) — 封閉清單。已比對 ${M} 人 [${names}] 全部 ${totalPairs} 組配對（各取 日月年柱·干支：六合/六冲/六害/六破 + 天干五合）。下列僅為有顯著互動的 ${shown} 組；未列出之配對＝已比對且無顯著跨人互動（此為結論，非「未檢查」）。禁止為清單外之任何人／配對推衍 合/冲/破/害/天干五合。（各人命盤內部互動→依互動經典完整判讀；跨人→僅限本清單。）輕重(任鐵樵)：三合/三會強 > 六合/六冲 > 害·破弱(削之可也/不經)。天干五合跨人＝緣/相吸，吉凶視各自用神 — 非化氣格；勿斷化木/化X（保留干之本氣；化須依各自月令判）。合不必吉 / 冲不必凶 — 結合各自用神/角色，可直斷方向/結果；僅禁命令式分手/勿往來。━━━`
    : `━━━ ปฏิกิริยาข้ามคน (synastry) — ลิสต์ปิด (เช็คครบแล้ว) · เทียบครบทุกคู่ ${totalPairs} คู่ จาก ${M} คน [${names}] โดยใช้เสา 日月年 (ก้าน+กิ่ง: 六合/六冲/六害/六破 + 天干五合) · ด้านล่างขึ้นเฉพาะ ${shown} คู่ที่มีปฏิกิริยาเด่น · คู่ที่ไม่อยู่ในลิสต์ = เช็คแล้วไม่มีปฏิกิริยาข้ามคนเด่น (เป็นข้อสรุป ไม่ใช่ "ยังไม่เช็ค") · ห้ามสร้าง/สันนิษฐาน 合/冲/破/害/天干五合 ให้คน/คู่ที่ไม่อยู่ในลิสต์นี้ · (ปฏิกิริยาภายในดวงเดี่ยว → อ่านเต็มตามคัมภีร์ · ข้ามคน → เฉพาะลิสต์นี้) · ลำดับน้ำหนัก(任鐵樵): 三合/三會 แรง > 六合/六冲 > 害·破 อ่อน(削之可也/不經) · 天干五合ข้ามคน = ดึงดูด/ผูกพัน(緣) ดี-ร้ายขึ้นกับ用神แต่ละคน — ไม่ใช่化氣格 · ห้ามประกาศ化木/化X (คงธาตุก้านเดิม · การ化ต้องดู月令ของแต่ละคนเอง) · 合ไม่ดีเสมอ / 冲ไม่ร้ายเสมอ — ดูที่用神/บทบาท ฟันธงทิศ/ผลได้ · ห้ามเฉพาะ 'สั่งการ' เลิก/คบ ━━━`;
  /* 31 พ.ค. (Codex รอบ 55) · ถ้ามีคนก้ำกึ่ง節氣ในกลุ่ม → closed-list ไม่ใช่ closed-world เต็ม
   * เพราะ helper เทียบเฉพาะเสาเดือน "ฝั่งที่ engine anchor ใช้" ไม่ได้เทียบฝั่งตรงข้าม (壬辰↔癸巳)
   * → absence ของ hit ที่พึ่งเสาก้ำกึ่ง(月ทุก節氣/年เฉพาะ立春)คนนั้น = ยังไม่ final · อ่าน 2 ทาง (ส่วน日 ยังแน่) */
  const anyBorderline = valid.some((p) => !!p.monthBorderline || !!p.yearBorderline);
  const blNote = !anyBorderline ? "" : (L === "en"
    ? "\n  ⚠️ NOTE: someone here has no birth time + born on a 節氣 boundary → their MONTH pillar (and YEAR pillar if born on 立春) is borderline (e.g. 壬辰↔癸巳 / 乙亥↔丙子). For any hit/absence that depends on that person's borderline pillar, the CLOSED-LIST 'no reaction' is NOT final — it depends on real birth time (the alternate pillar may add 合/冲/天干五合); read 2 ways. DAY-pillar conclusions stay firm."
    : L === "zh"
    ? "\n  ⚠️ 註：群中有人無時辰且生於節氣臨界 → 其月柱（若生於立春則年柱亦然）臨界（如 壬辰↔癸巳 / 乙亥↔丙子）。凡依賴該人臨界柱之互動／無互動，封閉清單之「無」非定論 — 視真實出生時辰（另一柱或生 合/冲/天干五合），須兩面讀；日柱之結論仍確定。"
    : "\n  ⚠️ หมายเหตุ: มีคนในกลุ่มไม่รู้เวลาเกิด + เกิดคาบ節氣 → เสาเดือน (และเสาปีถ้าเกิดวัน立春) ก้ำกึ่ง (เช่น 壬辰↔癸巳 / 乙亥↔丙子) · ปฏิกิริยา/การไม่มีปฏิกิริยาที่พึ่งเสาก้ำกึ่งของคนนั้น 'ลิสต์ปิด=ไม่มี' ยังไม่ final — ขึ้นกับเวลาเกิดจริง (เสาอีกด้านอาจเกิด 合/冲/天干五合) ให้อ่าน 2 ทาง · ส่วนที่พึ่งเสาวัน(日) ยังฟันธงได้");
  if (!lines.length) {
    const none = L === "en" ? "  (no pair has a prominent cross-person reaction — all pairs checked)"
      : L === "zh" ? "  （所有配對已比對，無顯著跨人互動）"
      : "  (เช็คทุกคู่แล้ว · ไม่มีคู่ใดมีปฏิกิริยาข้ามคนเด่น)";
    return title + blNote + "\n" + none;
  }
  return title + blNote + "\n" + lines.join("\n");
}
