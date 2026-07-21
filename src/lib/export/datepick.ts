/**
 * src/lib/export/datepick.ts · PageHandler "datepick" — สรุป PDF จากผลค้นฤกษ์ (擇日)
 * ⚠️ ไม่ re-fetch /api/auspicious ซ้ำ (ผลเปลี่ยนได้ตามเวลา/engine toggle ที่ผู้ใช้ตั้งไว้ตอนค้น)
 *    client จึงต้องส่ง inputs.datepick = window._dpLastSearch (ผลค้นฤกษ์ล่าสุดในหน้า ตัวแปรเดียวกับที่ dpExportPdf ใช้)
 * resolveInputs: validate ว่ามี top[] (candidate วันจัดอันดับ) อย่างน้อย 1 รายการ · dataHash ผูกกับผล+lang
 * generate: ไม่เรียก AI มั่วคะแนน — คะแนน/ระดับ/เหมาะ-เลี่ยง คำนวณ deterministic จาก engine (score) ที่นี่ก่อน
 *    แล้วป้อนเข้า AI แค่ให้เรียบเรียงเป็นรายงาน (สรุปฤกษ์ + ตาราง + ข้อควรระวัง) — ตำรา=ตัดจริง · ดวงบุคคล=เตือน
 */
import type { Session } from "@/lib/auth";
import { createHash } from "crypto";
import { langName } from "@/lib/palm/prompt";
import { LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { authCookie, callSifu, esc } from "./shared";
import { assertAiSectionCount, assertEvidenceBoundMeasurements, makeAiDocument } from "./pdf-v2";
import type { PageHandler, ResolveOk, ResolveErr, GenerateResult } from "./types";

/* ── ปกหลายภาษา (9 ภาษา) ── */
const COVER_I18N: Record<string, { kick: string; title: string; badge: string }> = {
  th: { kick: "รายงานฤกษ์มงคล · AI 擇日", title: "สรุปฤกษ์มงคล", badge: "✓ สรุปโดย AI ซินแส · อิงผลค้นฤกษ์จริงที่บันทึกไว้ (通書/董公=ตัดจริง)" },
  en: { kick: "AI auspicious-date report 擇日", title: "Auspicious date summary", badge: "✓ AI sifu summary · from your saved date-search results (Almanac/Dong Gong = hard cut)" },
  zh: { kick: "AI 擇日總結報告", title: "擇日結果總結", badge: "✓ AI 命理師總結 · 依已保存的擇日結果（通書／董公＝實裁）" },
  cn: { kick: "AI 择日总结报告", title: "择日结果总结", badge: "✓ AI 命理师总结 · 依已保存的择日结果（通书／董公＝实裁）" },
  vi: { kick: "Báo cáo chọn ngày tốt bằng AI 擇日", title: "Tổng hợp chọn ngày tốt", badge: "✓ AI luận giải · từ kết quả tìm ngày đã lưu (Thông Thư/Đổng Công = cắt thật)" },
  ja: { kick: "AI 択日まとめレポート 擇日", title: "吉日選定まとめ", badge: "✓ AI 鑑定まとめ · 保存済みの択日結果に基づく（通書／董公＝実裁）" },
  ko: { kick: "AI 택일 요약 리포트 擇日", title: "길일 선택 요약", badge: "✓ AI 명리 요약 · 저장된 택일 결과 기반 (통서/동공=실제 컷)" },
  ru: { kick: "AI-отчёт по выбору даты 擇日", title: "Сводка благоприятных дат", badge: "✓ Сводка AI-мастера · по сохранённым результатам подбора даты (Альманах/Дун Гун = жёсткий отсев)" },
  es: { kick: "Informe de selección de fecha con IA 擇日", title: "Resumen de fechas auspiciosas", badge: "✓ Resumen del maestro IA · de tus resultados guardados de búsqueda de fecha (Almanaque/Dong Gong = corte real)" },
};
function coverI18n(lang: string) { return COVER_I18N[lang] || COVER_I18N.en; }

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/* ── slot ที่รับจาก client (window._dpLastSearch.top[i]) — รูปเดียวกับ dpCompactSlot ใน datepick.html
 *    รับแบบกว้าง (unknown fields) เพราะ client ส่งมาตรง ๆ ไม่ผ่าน schema ที่ตายตัว ── */
type RawSlot = Record<string, unknown>;

const MEDAL = ["🥇", "🥈", "🥉"];
function medal(i: number): string { return MEDAL[i] || `#${i + 1}`; }

/** ระดับ + เหมาะ/เลี่ยง — คำนวณ deterministic จากคะแนน engine (ไม่ให้ AI เดา/ตั้งเอง) */
function tierOf(score: number): string {
  if (score >= 80) return "ยอดเยี่ยม";
  if (score >= 70) return "ดีมาก";
  if (score >= 55) return "ดี";
  if (score >= 50) return "ใช้ได้";
  return "ควรระวัง";
}
function actionOf(score: number): string {
  return score >= 55 ? "เหมาะ" : score >= 50 ? "พอใช้" : "เลี่ยง";
}

/** ดึงข้อความ 宜/忌/เหตุผล จาก matches/tongshu_reasons/donggong/huangdao/richong ของ 1 slot (รองรับทั้ง string[] และ object[]) */
function reasonTextsOf(t: RawSlot): { up: string[]; down: string[] } {
  const up: string[] = [], down: string[] = [];
  const raw = [...asArr(t.matches), ...asArr(t.tongshu_reasons), ...asArr(t.tongshu_tags)];
  for (const r of raw) {
    if (typeof r === "string") { if (r.trim()) up.push(r.trim()); continue; }
    const ro = asRecord(r);
    if (!ro) continue;
    const txt = str(ro.text || ro.thai || ro.label).trim();
    if (!txt) continue;
    const delta = Number(ro.delta || 0);
    const warn = ro.warn === true;
    (warn || delta < 0 ? down : up).push(txt);
  }
  const dg = asRecord(t.donggong);
  if (dg && str(dg.verdictTh)) up.push(`ตงกง: ${str(dg.verdictTh)}${dg.jianchuTh ? ` (${str(dg.jianchuTh)})` : ""}`);
  const rc = asRecord(t.richong);
  if (rc && str(rc.zodiac_th)) down.push(`วันชง: ${str(rc.zodiac_th)}`);
  return { up: up.slice(0, 4), down: down.slice(0, 4) };
}

function moduleTextOf(t: RawSlot): string {
  const ms = asRecord(t.moduleScores);
  if (!ms) return "";
  return Object.entries(ms).map(([k, v]) => `${k}=${Math.round(Number(v) || 0)}`).join(" · ");
}

type SlotFact = { rank: number; date: string; time: string; score: number; tier: string; action: string; module: string; up: string[]; down: string[]; earthStem: string; heavenStem: string };

function buildSlotFacts(top: RawSlot[]): SlotFact[] {
  return top.slice(0, 12).map((t, i) => {
    const score = Math.max(0, Math.min(100, Math.round(Number(t.score) || 0)));
    const { up, down } = reasonTextsOf(t);
    return {
      rank: i + 1,
      date: str(t.date),
      time: str(t.time),
      score,
      tier: tierOf(score),
      action: actionOf(score),
      module: moduleTextOf(t),
      up, down,
      earthStem: str(t.earth_stem),
      heavenStem: str(t.heaven_stem),
    };
  });
}

function factBlockFromSlots(facts: SlotFact[], meta: { activityLabel: string; windowLabel: string; totalScanned: number | null; candidatePool: number | null; cutCount: number }): string {
  const L: string[] = [];
  if (meta.activityLabel) L.push(`กิจกรรมที่วางฤกษ์: ${meta.activityLabel}`);
  if (meta.windowLabel) L.push(`ช่วงที่ค้นหา: ${meta.windowLabel}`);
  if (meta.totalScanned != null) L.push(`สแกนทั้งหมด: ${meta.totalScanned} ยาม · เข้ารอบ: ${meta.candidatePool ?? "?"} ยาม`);
  L.push(`━━━ อันดับฤกษ์ที่ engine deterministic จัดไว้แล้ว (ห้ามเดา/แก้คะแนนใหม่) ━━━`);
  for (const f of facts) {
    L.push(`${medal(f.rank - 1)} อันดับ ${f.rank} · ${f.date} ${f.time}${f.earthStem ? ` (支${f.earthStem}${f.heavenStem ? f.heavenStem : ""})` : ""} — คะแนน ${f.score}/100 · ระดับ ${f.tier} · ${f.action}`);
    if (f.module) L.push(`  น้ำหนักคะแนนรายศาสตร์: ${f.module}`);
    if (f.up.length) L.push(`  宜 เหตุหนุน: ${f.up.join(" · ")}`);
    if (f.down.length) L.push(`  忌 เหตุถ่วง/ระวัง: ${f.down.join(" · ")}`);
  }
  if (meta.cutCount > 0) L.push(`━━━ ตำราตัดออก (veto) ทั้งหมด ${meta.cutCount} ยาม — เป็นวันที่ห้ามใช้เด็ดขาดตามตำรา ไม่อยู่ในอันดับข้างบน ━━━`);
  return L.join("\n");
}

function buildDatepickSummaryPrompt(facts: SlotFact[], meta: { activityLabel: string; windowLabel: string; totalScanned: number | null; candidatePool: number | null; cutCount: number }, lang: string): string {
  const langDir = LANG_ANSWER_DIRECTIVE[lang] || "";
  const target = langName(lang);
  const factBlock = factBlockFromSlots(facts, meta);
  return [
    `คุณคือซินแสฤกษ์ยาม (擇日) หน้าที่: เรียบเรียง "ผลค้นฤกษ์จริง" ด้านล่าง (engine deterministic ตัด/ให้คะแนนเสร็จแล้ว) ให้เป็นรายงานฉบับเต็มสำหรับ Export เป็น PDF`,
    `⚠️ คะแนน/ระดับ/เหมาะ-เลี่ยงด้านล่างคือผลคำนวณจริงที่เสร็จแล้ว — ห้ามเดา/แก้ตัวเลขใหม่ ห้ามขัดแย้งกับผลเดิม ให้เรียบเรียง/อธิบายเหตุผลให้อ่านลื่นเท่านั้น`,
    `⚠️ หลักการตัดสินฤกษ์ (ต้องพูดถึงในหัวข้อแรก): ทงซู/ตงกง (通書/董公擇日) = ตัดจริง (วันที่ตำราห้ามคือห้ามใช้เด็ดขาด) · ดวงบุคคล/ปฏิกิริยากับเจ้าภาพ = ใช้เป็นคำเตือนเสริมเท่านั้น ไม่ใช่ตัดจริง`,
    ``,
    `━━━ ผลค้นฤกษ์จริง (จากระบบ) ━━━`,
    factBlock,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `เขียนรายงานเป็น Markdown ด้วยหัวข้อระดับ 2 ตามนี้ครบ เรียงลำดับ ห้ามข้าม ห้ามเพิ่มหัวข้ออื่น:`,
    `## คำตอบสั้น — เลือกวันไหน`,
    `ฟันธงจากอันดับของ engine ว่าควรเลือกอันดับหนึ่งเมื่อใด และสรุปเหตุผลหนุน/เหตุถ่วงที่มีอยู่จริงเท่านั้น ระบุหลักการ "通書/董公=ตัดจริง · ดวงบุคคล=เตือน" ให้ชัด`,
    `## เหตุผลที่อันดับหนึ่งเหมาะที่สุด`,
    `อธิบายหลักฐานของอันดับหนึ่ง แยกเหตุหนุน เหตุถ่วง และเงื่อนไขที่ต้องรักษา ห้ามเพิ่มศาสตร์หรือเหตุผลที่ packet ไม่ได้ส่ง`,
    `## ฤกษ์สำรอง`,
    `เปรียบเทียบอันดับถัดไปตามลำดับเดิมของ engine ว่าเหมาะใช้แทนในสถานการณ์ใด ห้ามจัดอันดับใหม่`,
    `## ความเข้ากับเจ้าของงานและผู้เกี่ยวข้อง`,
    `กล่าวเฉพาะหลักฐานบุคคลที่ปรากฏใน packet หากไม่มี ให้ระบุว่าข้อมูลส่วนบุคคลยังไม่พอ ห้ามเดาดวงเจ้าของงาน`,
    `## วันที่หรือช่วงเวลาที่ควรหลีกเลี่ยง`,
    `สรุป veto/วันชง/เหตุถ่วงจาก packet เท่านั้น ไม่สร้างวันหรือเวลาใหม่`,
    `## ขั้นตอนเตรียมตัวและขอบเขต`,
    `ให้ checklist ที่ทำได้จริง พร้อมระบุข้อมูลไม่ครบและขอบเขตของผลคำนวณ`,
    ``,
    `กติกาการเขียน (เคร่งครัด):`,
    `- โทนซินแสที่กล้า "ฟันธง" ชัดเจน ไม่กั๊ก ไม่พูดลอย แต่สุภาพ ให้กำลังใจ (ยึดผลคำนวณเดิมเป็นหลัก ขยายความให้ลึกและอ่านลื่นขึ้น)`,
    `- ⛔ ห้ามพูด 6 เรื่องต้องห้ามเด็ดขาด: วันตาย/อายุขัย · โรคร้ายแรงเจาะจง · การแท้ง–มี/ไม่มีบุตร · การหย่าร้างฟันธง · ภัยพิบัติ/อุบัติเหตุถึงชีวิต (ให้พูดเชิงดูแล/ป้องกันแทน)`,
    `- ⛔ NO_PERCENT: ห้ามใส่ตัวเลขเปอร์เซ็นต์หรือสถิติที่แต่งขึ้นเอง (คะแนน 0-100 ในตารางเป็นค่าที่ engine คำนวณไว้แล้ว ใช้ได้ตามที่ให้มาเท่านั้น ห้ามเปลี่ยนหน่วยเป็น % หรือแต่งตัวเลขใหม่)`,
    `- ใช้ย่อหน้าสั้นและ bullet (- ) ได้ ห้ามสร้างตาราง เพราะตารางข้อเท็จจริงจะถูกวาดจาก engine โดยระบบ`,
    `- ห้ามใส่วัน เวลา คะแนน ทิศ ชื่อศาสตร์ หรือเหตุผลที่ไม่มีอยู่ใน packet`,
    `- เริ่มที่เนื้อหาเลย ห้ามเกริ่นว่ากำลังอ่านไฟล์/ข้อมูล/prompt`,
    langDir ? `\n${langDir}` : `\n⚠️ ภาษา: เขียนทั้งฉบับเป็น ${target}`,
  ].join("\n");
}

export type DatepickCtx = {
  facts: SlotFact[];
  meta: { activityLabel: string; windowLabel: string; totalScanned: number | null; candidatePool: number | null; cutCount: number };
  cookie: string;
};

export const datepickHandler: PageHandler<DatepickCtx> = {
  async resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<DatepickCtx> | ResolveErr> {
    const inputs = rawInputs as { datepick?: unknown; lang?: unknown };
    const dp = asRecord(inputs.datepick);
    const top = dp ? asArr(dp.top) : [];
    if (!dp || top.length < 1) return { error: "invalid_inputs", status: 400 };

    const rawTop = top.filter((t): t is RawSlot => !!asRecord(t)) as RawSlot[];
    const facts = buildSlotFacts(rawTop);
    if (!facts.length) return { error: "invalid_inputs", status: 400 };

    const firstSlot = rawTop[0] || {};
    const activityLabel = [str(firstSlot.activity_name), str(firstSlot.activity_han)].filter(Boolean).join(" · ");
    const searchWindow = asRecord(dp.search_window);
    const windowLabel = searchWindow ? str(searchWindow.label) : "";
    const totalScanned = typeof dp.total_scanned === "number" ? dp.total_scanned : null;
    const candidatePool = typeof dp.candidate_pool === "number" ? dp.candidate_pool : null;
    const cutCount = asArr(dp.cutSlots).length;
    const meta = { activityLabel, windowLabel, totalScanned, candidatePool, cutCount };

    // dataHash ผูกกับผลค้นฤกษ์ + lang (ผลเปลี่ยน/ภาษาเปลี่ยน = cache ใหม่)
    const lang = typeof inputs.lang === "string" ? inputs.lang : "th";
    const dataHash = createHash("sha256").update(JSON.stringify({ pdfVersion: "hourkey.pdf.v2", facts, meta, lang })).digest("hex");
    const cookie = await authCookie(session);
    return { dataHash, ctx: { facts, meta, cookie } };
  },

  async generate(ctx: DatepickCtx, lang: string): Promise<GenerateResult> {
    const prompt = buildDatepickSummaryPrompt(ctx.facts, ctx.meta, lang);
    const ai = await callSifu(ctx.cookie, prompt);
    if (!ai.ok || !ai.reply) throw new Error(ai.error || "ai_failed");
    const evidence = { version: "datepick_evidence_v2", facts: ctx.facts, meta: ctx.meta };
    assertAiSectionCount(ai.reply, 6);
    assertEvidenceBoundMeasurements(ai.reply, evidence);
    const ci = coverI18n(lang);
    const top3 = ctx.facts.slice(0, 3).map((f) => `${medal(f.rank - 1)} ${esc(f.date)}`).join(" · ");
    const cover: Record<string, unknown> = {
      kick: ci.kick,
      title: ci.title,
      who: ctx.meta.activityLabel || "",
      metaHtml: [ctx.meta.windowLabel, top3].filter(Boolean).map(esc).join("<br>"),
      big: "擇",
      badge: ci.badge,
      qr: false,
    };
    const rankingRows = ctx.facts.slice(0, 8).map((fact) => ({
      rank: String(fact.rank),
      datetime: `${fact.date} ${fact.time}`.trim(),
      score: String(fact.score),
      verdict: `${fact.tier} · ${fact.action}`,
      evidence: [...fact.up.slice(0, 2), ...fact.down.slice(0, 1)].join(" · ") || "—",
    }));
    const document = makeAiDocument({
      prefix: "HKDP",
      evidence,
      lang,
      title: ci.title,
      headerTitle: ci.kick,
      verificationLabel: "Engine evidence · AI interpretation",
      cover: {
        kick: ci.kick,
        title: ci.title,
        who: ctx.meta.activityLabel || "",
        meta: [ctx.meta.windowLabel, top3].filter(Boolean),
        glyph: "擇",
        badge: ci.badge,
      },
      markdown: ai.reply,
      deterministicFirstPage: [
        {
          type: "facts",
          columns: 2,
          items: [
            { label: "Activity", value: ctx.meta.activityLabel || "—" },
            { label: "Search window", value: ctx.meta.windowLabel || "—" },
            { label: "Scanned", value: ctx.meta.totalScanned == null ? "—" : String(ctx.meta.totalScanned) },
            { label: "Canon vetoes", value: String(ctx.meta.cutCount) },
          ],
        },
        {
          type: "table",
          compact: true,
          columns: [
            { key: "rank", label: "#", width: "7%" },
            { key: "datetime", label: "Date / time", width: "21%" },
            { key: "score", label: "Score", width: "10%" },
            { key: "verdict", label: "Engine verdict", width: "20%" },
            { key: "evidence", label: "Evidence", width: "42%" },
          ],
          rows: rankingRows,
        },
      ],
    });
    return { markdown: ai.reply, cover, figs: [], document };
  },
};
