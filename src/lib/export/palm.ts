/**
 * src/lib/export/palm.ts · PageHandler "palm" — สรุป PDF จากคำอ่านลายมือ (ศาสตร์ที่ 7)
 * ⚠️ รูปลายมือลบทันทีหลังอ่าน (กฎ privacy) → re-run ไม่ได้จากรูปเดิม
 *    client จึงต้องส่ง inputs.palm = snapshot ผลอ่านที่มีอยู่แล้วในหน้า (ตัวแปร curResult ใน palmistry-app.js)
 * resolveInputs: validate ว่ามี sifu_reading (8 หัวข้อ) จริง · dataHash ผูกกับเนื้อ reading + lang (เปลี่ยนภาษา/รูปใหม่ = cache ใหม่)
 * generate: ไม่เรียก AI vision ซ้ำ (ไม่มีรูปแล้ว) — ป้อน sifu_reading (8 หัวข้อ) + lines ที่ "อ่านเสร็จแล้ว" เข้า AI ให้เรียบเรียงเป็นรายงาน PDF
 */
import type { Session } from "@/lib/auth";
import { createHash } from "crypto";
import { langName } from "@/lib/palm/prompt";
import { LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { authCookie, callSifu } from "./shared";
import type { PageHandler, ResolveOk, ResolveErr, GenerateResult } from "./types";

export type PalmCtx = { reading: Record<string, unknown>; clarityOverall: number | null; cookie: string };

/* ── ปกหลายภาษา (9 ภาษา) ── */
const COVER_I18N: Record<string, { kick: string; title: string; badge: string }> = {
  th: { kick: "รายงานลายมือ · AI 手相", title: "สรุปคำอ่านลายมือ", badge: "✓ สรุปโดย AI ซินแส · อิงคำอ่านลายมือจริงที่บันทึกไว้" },
  en: { kick: "AI palmistry report 手相", title: "Palm reading summary", badge: "✓ AI sifu summary · from your saved palm reading" },
  zh: { kick: "AI 手相總結報告", title: "手相解讀總結", badge: "✓ AI 命理師總結 · 依已保存的手相解讀" },
  cn: { kick: "AI 手相总结报告", title: "手相解读总结", badge: "✓ AI 命理师总结 · 依已保存的手相解读" },
  vi: { kick: "Báo cáo xem tay bằng AI 手相", title: "Tổng hợp xem chỉ tay", badge: "✓ AI luận giải · từ kết quả xem tay đã lưu" },
  ja: { kick: "AI 手相まとめレポート 手相", title: "手相まとめ", badge: "✓ AI 鑑定まとめ · 保存済みの手相結果に基づく" },
  ko: { kick: "AI 손금 요약 리포트 手相", title: "손금 풀이 요약", badge: "✓ AI 명리 요약 · 저장된 손금 결과 기반" },
  ru: { kick: "AI-отчёт по хиромантии 手相", title: "Сводка чтения по руке", badge: "✓ Сводка AI-мастера · по сохранённому чтению руки" },
  es: { kick: "Informe de quiromancia con IA 手相", title: "Resumen de lectura de la mano", badge: "✓ Resumen del maestro IA · desde tu lectura de mano guardada" },
};
function coverI18n(lang: string) { return COVER_I18N[lang] || COVER_I18N.en; }

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** curResult จาก palmistry-app.js: { reading:{ sifu_reading, lines, reading:{universal,per_school}, ... }, clarity_overall, ... }
 *  บางที sifu_reading/lines อาจแนบมาแบบตื้นกว่านั้น (r.sifu_reading ตรง ๆ) → รองรับทั้งสองทรง */
function extractReading(raw: unknown): Record<string, unknown> | null {
  const r = asRecord(raw);
  if (!r) return null;
  const nested = asRecord(r.reading);
  const reading = nested || r;
  const sifu = asRecord(reading.sifu_reading) || asRecord(r.sifu_reading);
  const sections = sifu && Array.isArray(sifu.sections) ? sifu.sections : [];
  if (!sifu || sections.length < 1) return null;
  // เก็บ reading ที่มี sifu_reading แนบให้ generate() อ่านสะดวก (normalize ให้อยู่ระดับเดียว)
  return { ...reading, sifu_reading: sifu, lines: reading.lines || r.lines || [] };
}

const SIFU_SECTION_LABEL: Record<string, string> = {
  personality: "A. พื้นนิสัยและวิธีคิด",
  energy_stress: "B. พลังชีวิตและความเครียด",
  career: "C. งานและเส้นทางอาชีพ",
  money: "D. การเงินและโอกาสทรัพย์",
  relationship: "E. ความรักและความสัมพันธ์",
  supporters: "F. ผู้ใหญ่/บริวาร/คนสนับสนุน",
  turning_points: "G. จุดเปลี่ยนชีวิต (วัยจร)",
  personal_advice: "H. คำแนะนำเฉพาะตัว",
};
const SIFU_SECTION_ORDER = Object.keys(SIFU_SECTION_LABEL);

function factBlockFromReading(reading: Record<string, unknown>, clarityOverall: number | null): string {
  const sifu = asRecord(reading.sifu_reading) || {};
  const lines = Array.isArray(reading.lines) ? reading.lines : [];
  const ov = asRecord(sifu.overview_3_lines) || {};
  const fin = asRecord(sifu.final_summary) || {};
  const sections = Array.isArray(sifu.sections) ? sifu.sections : [];

  const L: string[] = [];
  if (clarityOverall != null) L.push(`ความชัดภาพที่อ่านได้: ${clarityOverall}%`);
  if (typeof sifu.opening === "string" && sifu.opening) L.push(`เปิดเรื่องจากซินแส: ${sifu.opening}`);
  if (ov.identity || ov.strength || ov.caution) {
    L.push(`ภาพรวม 3 บรรทัด: ตัวตน="${ov.identity || ""}" · จุดแข็ง="${ov.strength || ""}" · ข้อควรระวัง="${ov.caution || ""}"`);
  }
  if (lines.length) {
    L.push(`เส้นหลัก 4 เส้นที่เห็นจากภาพ:`);
    for (const raw of lines) {
      const ln = asRecord(raw);
      if (!ln) continue;
      L.push(`  - ${ln.name || ln.key || ""} (${ln.clarity || "?"}): ${ln.observation || ""}`);
    }
  }
  L.push(`━━━ 8 หัวข้อคำอ่านของซินแส (วิเคราะห์จากภาพจริงเสร็จแล้ว) ━━━`);
  for (const key of SIFU_SECTION_ORDER) {
    const sec = sections.find((s) => asRecord(s)?.key === key);
    const secR = asRecord(sec);
    if (!secR) continue;
    L.push(`## ${SIFU_SECTION_LABEL[key]}`);
    if (secR.seen) L.push(`เห็นจากภาพ: ${secR.seen}`);
    if (secR.meaning) L.push(`ความหมาย: ${secR.meaning}`);
    if (secR.advice) L.push(`คำแนะนำเดิม: ${secR.advice}`);
  }
  if (fin.best_strength || fin.main_risk || fin.suitable_work || fin.money_style || fin.love_adjustment) {
    L.push(`━━━ สรุปท้าย ━━━`);
    if (fin.best_strength) L.push(`จุดแข็งที่สุด: ${fin.best_strength}`);
    if (fin.main_risk) L.push(`จุดที่ต้องระวังที่สุด: ${fin.main_risk}`);
    if (fin.suitable_work) L.push(`งานที่เหมาะ: ${fin.suitable_work}`);
    if (fin.money_style) L.push(`วิธีหาเงินที่เหมาะ: ${fin.money_style}`);
    if (fin.love_adjustment) L.push(`ความรักควรปรับ: ${fin.love_adjustment}`);
    if (Array.isArray(fin.advice_3) && fin.advice_3.length) L.push(`คำแนะนำ 3 ข้อเดิม: ${fin.advice_3.join(" · ")}`);
    if (fin.sifu_summary) L.push(`สรุปซินแส: ${fin.sifu_summary}`);
  }
  return L.join("\n");
}

function buildPalmSummaryPrompt(reading: Record<string, unknown>, clarityOverall: number | null, lang: string): string {
  const langDir = LANG_ANSWER_DIRECTIVE[lang] || "";
  const target = langName(lang);
  const factBlock = factBlockFromReading(reading, clarityOverall);
  return [
    `คุณคือซินแสหัตถศาสตร์ (ผู้เชี่ยวชาญดูลายมือ) หน้าที่: เรียบเรียง "คำอ่านลายมือจริง" ด้านล่าง (วิเคราะห์จากภาพมือจริงตามคัมภีร์ 3 อารยธรรมเสร็จแล้ว) ให้เป็นรายงานฉบับเต็มสำหรับ Export เป็น PDF`,
    `⚠️ คำอ่านด้านล่างคือผลวิเคราะห์จากภาพจริงที่เสร็จแล้ว — ห้ามเดา/แต่งลักษณะมือใหม่ ห้ามขัดแย้งกับคำอ่านเดิม ให้เรียบเรียง/ขยายความให้อ่านลื่นเป็นรายงานฉบับเต็มเท่านั้น`,
    ``,
    `━━━ คำอ่านลายมือจริง (จากระบบ) ━━━`,
    factBlock,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `เขียนรายงานเป็น Markdown ด้วยหัวข้อระดับ 2 (ขึ้นต้น "## ") ตามนี้ครบ เรียงลำดับ ห้ามข้าม ห้ามเพิ่มหัวข้ออื่นนอกเหนือนี้:`,
    `## เปิดเรื่อง — ทักทายอบอุ่นแบบซินแส สรุปภาพรวม 3 บรรทัด (ตัวตน/จุดแข็ง/ข้อควรระวัง)`,
    `## A. พื้นนิสัยและวิธีคิด`,
    `## B. พลังชีวิตและความเครียด`,
    `## C. งานและเส้นทางอาชีพ`,
    `## D. การเงินและโอกาสทรัพย์`,
    `## E. ความรักและความสัมพันธ์`,
    `## F. ผู้ใหญ่/บริวาร/คนสนับสนุน`,
    `## G. จุดเปลี่ยนชีวิต (วัยจร) — ไล่ช่วงวัยอดีต→ปัจจุบัน→แนวโน้ม`,
    `## H. คำแนะนำเฉพาะตัว`,
    ``,
    `กติกาการเขียน (เคร่งครัด):`,
    `- โทนซินแสที่กล้า "ฟันธง" ชัดเจน ไม่กั๊ก ไม่พูดลอย แต่สุภาพ ให้กำลังใจ (ยึดคำอ่านเดิมเป็นหลัก ขยายความให้ลึกและอ่านลื่นขึ้น)`,
    `- ⛔ ห้ามพูด 6 เรื่องต้องห้ามเด็ดขาด: วันตาย/อายุขัย · โรคร้ายแรงเจาะจง · การแท้ง–มี/ไม่มีบุตร · การหย่าร้างฟันธง · ภัยพิบัติ/อุบัติเหตุถึงชีวิต (ให้พูดเชิงดูแล/ป้องกันแทน)`,
    `- ⛔ NO_PERCENT: ห้ามใส่ตัวเลขเปอร์เซ็นต์ คะแนน หรือสถิติใด ๆ ในคำอ่าน (ใช้คำเชิงคุณภาพแทน) ยกเว้นค่าความชัดภาพที่ให้ไว้แล้วเท่านั้น`,
    `- ใช้ bullet (- ) และ **ตัวหนา** ได้ ให้อ่านง่าย · แต่ละหัวข้อ 2–5 ย่อหน้าสั้น`,
    `- เริ่มที่เนื้อหาเลย ห้ามเกริ่นว่ากำลังอ่านไฟล์/ข้อมูล/prompt`,
    langDir ? `\n${langDir}` : `\n⚠️ ภาษา: เขียนทั้งฉบับเป็น ${target}`,
  ].join("\n");
}

export const palmHandler: PageHandler<PalmCtx> = {
  async resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<PalmCtx> | ResolveErr> {
    const inputs = rawInputs as { palm?: unknown };
    const reading = extractReading(inputs.palm);
    if (!reading) return { error: "invalid_inputs", status: 400 };

    const clarityRaw = (reading as { clarity_overall?: unknown }).clarity_overall
      ?? (asRecord(inputs.palm)?.clarity_overall);
    const clarityOverall = typeof clarityRaw === "number" ? clarityRaw : null;

    // dataHash ผูกกับเนื้อ reading เท่านั้น (route.ts คำนวณ cache key ร่วมกับคอลัมน์ page/lang อยู่แล้ว → ไม่ต้องผสมซ้ำ)
    const dataHash = createHash("sha256").update(JSON.stringify(reading)).digest("hex");
    const cookie = await authCookie(session);
    return { dataHash, ctx: { reading, clarityOverall, cookie } };
  },

  async generate(ctx: PalmCtx, lang: string): Promise<GenerateResult> {
    const prompt = buildPalmSummaryPrompt(ctx.reading, ctx.clarityOverall, lang);
    const ai = await callSifu(ctx.cookie, prompt);
    if (!ai.ok || !ai.reply) throw new Error(ai.error || "ai_failed");
    const ci = coverI18n(lang);
    const cover: Record<string, unknown> = {
      kick: ci.kick,
      title: ci.title,
      who: "",
      metaHtml: ctx.clarityOverall != null ? `${ctx.clarityOverall}%` : "",
      big: "手相",
      badge: ci.badge,
      qrLabel: "hourkey.io",
    };
    return { markdown: ai.reply, cover, figs: [] };
  },
};
