/**
 * bazi-synastry.ts · ปฏิกิริยาข้ามคน (synastry · 合婚)
 *
 * แยกออกจาก src/app/api/sifu/group/route.ts (31 พ.ค. · เฟส 0 refactor) เพื่อ:
 *   - test ได้ตรง (group/route.ts import next/server → import ตรงไม่ได้)
 *   - ไม่บวม route LOCKED · ขยายปฏิกิริยา (天干五合/刑/三合/暗合) ในไฟล์เดียว
 *
 * เฟส 0 = ย้าย logic เดิม "ตรงตัว" · output ต้องเท่าเดิมเป๊ะ (เทียบ 日柱+年柱 กิ่ง六合冲害破 + ธาตุ生剋 + 用神)
 * ตาราง = ค่าคงที่ตำรา (copy จาก chart-extensions LOCKED · self-contained · ไม่แตะ engine)
 * เฟสถัดไป: +เสาเดือน/เสายาม +天干五合(得令→合而不化) +刑 +三合/暗合 (reuse bazi-hehua-resolver)
 */

export type PersonSyn = {
  name: string;
  role: string;
  isSelf: boolean;
  text: string;
  mode: "3p" | "4p" | "err";
  dmEl: string;
  yongEls: string[];
  pillars: { year?: { stem: string; branch: string }; day?: { stem: string; branch: string } } | null;
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
  th: { day: "เสาวัน", year: "เสาปี" },
  en: { day: "Day", year: "Year" },
  zh: { day: "日柱", year: "年柱" },
};

/* เทียบปฏิกิริยาข้ามคน · เฉพาะ 日柱+年柱 · neutral · CLOSED LIST (เช็คครบทุกคู่ · ห้ามแต่งคู่นอกลิสต์) */
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
      /* axis_B · กิ่ง 日柱+年柱 ข้ามคน */
      for (const ka of ["day", "year"] as const) {
        for (const kb of ["day", "year"] as const) {
          const ba = A.pillars?.[ka]?.branch, bb = B.pillars?.[kb]?.branch;
          if (!ba || !bb) continue;
          const rels = branchRel(ba, bb);
          for (const rel of rels) hits.push(`${pL(ka)}${bN(ba)}×${pL(kb)}${bN(bb)} ${REL_LABEL[rel][L]}`);
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
    ? `━━━ Cross-person reactions (synastry) — CLOSED LIST. Compared ALL ${totalPairs} pair(s) among ${M} people [${names}], using each one's 日柱(Day)+年柱(Year). Below are ONLY the ${shown} pair(s) with a prominent reaction. Any pair NOT listed = checked and has NO prominent cross-person reaction (a conclusion, NOT "unchecked"). DO NOT create or infer 合/冲/破/害 for any person/pair not in this list. (Each single person's in-chart interactions → read in full per the interaction classic; CROSS-PERSON → only this list.) 合 not always good / 冲 not always bad — weigh against each one's 用神/role, state direction/outcome plainly; only forbidden: 'commanding' break-up/no-contact. ━━━`
    : L === "zh"
    ? `━━━ 跨人互動 (synastry) — 封閉清單。已比對 ${M} 人 [${names}] 全部 ${totalPairs} 組配對（各取 日柱+年柱）。下列僅為有顯著互動的 ${shown} 組；未列出之配對＝已比對且無顯著跨人互動（此為結論，非「未檢查」）。禁止為清單外之任何人／配對推衍 合/冲/破/害。（各人命盤內部互動→依互動經典完整判讀；跨人→僅限本清單。）合不必吉 / 冲不必凶 — 結合各自用神/角色，可直斷方向/結果；僅禁命令式分手/勿往來。━━━`
    : `━━━ ปฏิกิริยาข้ามคน (synastry) — ลิสต์ปิด (เช็คครบแล้ว) · เทียบครบทุกคู่ ${totalPairs} คู่ จาก ${M} คน [${names}] โดยใช้ 日柱(เสาวัน)+年柱(เสาปี) ของแต่ละคน · ด้านล่างขึ้นเฉพาะ ${shown} คู่ที่มีปฏิกิริยาเด่น · คู่ที่ไม่อยู่ในลิสต์ = เช็คแล้วไม่มีปฏิกิริยาข้ามคนเด่น (เป็นข้อสรุป ไม่ใช่ "ยังไม่เช็ค") · ห้ามสร้าง/สันนิษฐาน 合/冲/破/害 ให้คน/คู่ที่ไม่อยู่ในลิสต์นี้ · (ปฏิกิริยาภายในดวงเดี่ยวของแต่ละคน → อ่านเต็มตามคัมภีร์ปฏิกิริยา · ข้ามคน → เฉพาะลิสต์นี้) · 合ไม่ดีเสมอ / 冲ไม่ร้ายเสมอ — ดูที่用神/บทบาท ฟันธงทิศ/ผลได้ · ห้ามเฉพาะ 'สั่งการ' เลิก/คบ ━━━`;
  if (!lines.length) {
    const none = L === "en" ? "  (no pair has a prominent cross-person reaction — all pairs checked)"
      : L === "zh" ? "  （所有配對已比對，無顯著跨人互動）"
      : "  (เช็คทุกคู่แล้ว · ไม่มีคู่ใดมีปฏิกิริยาข้ามคนเด่น)";
    return title + "\n" + none;
  }
  return title + "\n" + lines.join("\n");
}
