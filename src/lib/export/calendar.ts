/**
 * src/lib/export/calendar.ts · PageHandler "calendar" — สรุป PDF จากปฏิทินจีน 黃曆 (ตงซู)
 * ⚠️ ไม่ re-fetch/คำนวณใหม่ — client ส่ง inputs.calendar = snapshot ของเดือนที่โหลดไว้แล้วในหน้า (ตัวแปร MONTH_DATA
 *    ใน calendar.html) + state.selected (วันที่กำลังดูรายละเอียดอยู่) เพราะ engine (建除/黃黑道/神煞/宜忌/verdict)
 *    คำนวณเสร็จแล้วฝั่ง /api/calendar (LOCKED) — ที่นี่แค่จัดอันดับ (ranking เท่านั้น ไม่คำนวณดวงใหม่) แล้วป้อน AI สรุปภาษา
 * resolveInputs: validate ว่ามี days[]≥1 · dataHash ผูกกับเนื้อเดือน+วันที่เลือก (เปลี่ยนเดือน/เลือกวันใหม่ = cache ใหม่)
 * generate: ป้อนวันมงคล/วันควรเลี่ยง top (จัดอันดับจาก verdict.score ที่ engine คำนวณแล้ว) + รายละเอียดวันที่เลือก
 *    เข้า AI ให้เขียนรายงาน 2 หัวข้อ + ตาราง markdown (ไม่ใส่ตัวเลขคะแนนดิบ — ใช้ลำดับ/คำเชิงคุณภาพแทน · NO_PERCENT)
 */
import type { Session } from "@/lib/auth";
import { createHash } from "crypto";
import { langName } from "@/lib/palm/prompt";
import { LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { authCookie, callSifu } from "./shared";
import type { PageHandler, ResolveOk, ResolveErr, GenerateResult } from "./types";

export type CalendarCtx = { factBlock: string; monthLabel: string; yearPillar: string; monthPillar: string; mode: "tongshu" | "personal"; cookie: string };

/* ── ปกหลายภาษา (9 ภาษา) ── */
const COVER_I18N: Record<string, { kick: string; title: string; badge: string }> = {
  th: { kick: "รายงานปฏิทินมงคล · AI 黃曆", title: "สรุปปฏิทินมงคลประจำเดือน", badge: "✓ สรุปโดย AI ซินแส · อิงข้อมูล建除·黃黑道·神煞·宜忌ที่คำนวณจริง" },
  en: { kick: "AI Tongshu calendar report 黃曆", title: "Monthly almanac summary", badge: "✓ AI sifu summary · from your calculated 黃曆 data" },
  zh: { kick: "AI 通勝黃曆總結報告", title: "本月黃曆總結", badge: "✓ AI 命理師總結 · 依已計算的建除·黃黑道·神煞·宜忌" },
  cn: { kick: "AI 通胜黄历总结报告", title: "本月黄历总结", badge: "✓ AI 命理师总结 · 依已计算的建除·黄黑道·神煞·宜忌" },
  vi: { kick: "Báo cáo lịch Thông Thư bằng AI 黃曆", title: "Tổng hợp lịch tháng", badge: "✓ AI luận giải · từ dữ liệu 黃曆 đã tính" },
  ja: { kick: "AI 通書暦まとめレポート 黃曆", title: "月間暦まとめ", badge: "✓ AI 鑑定まとめ · 計算済みの黃曆データに基づく" },
  ko: { kick: "AI 통서력 요약 리포트 黃曆", title: "월간 달력 요약", badge: "✓ AI 명리 요약 · 계산된 黃曆 데이터 기반" },
  ru: { kick: "AI-отчёт календаря Тхонгшу 黃曆", title: "Сводка месячного календаря", badge: "✓ Сводка AI-мастера · по рассчитанным данным 黃曆" },
  es: { kick: "Informe del calendario Tongshu con IA 黃曆", title: "Resumen del calendario mensual", badge: "✓ Resumen del maestro IA · de los datos 黃曆 calculados" },
};
function coverI18n(lang: string) { return COVER_I18N[lang] || COVER_I18N.en; }

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArray(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
function asStrArray(v: unknown): string[] { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; }

type DaySnap = {
  day?: unknown; date?: unknown; stem?: unknown; branch?: unknown; day_officer?: unknown; twelve_star?: unknown;
  lunar?: unknown; yi?: unknown; ji?: unknown;
  verdict?: unknown; universal_verdict?: unknown;
  stars_detail?: unknown; gods?: unknown;
};

function dayScore(d: DaySnap, mode: "tongshu" | "personal"): number | null {
  const u = asRecord(d.universal_verdict);
  if (mode === "tongshu" && u && typeof u.score === "number") return u.score;
  const v = asRecord(d.verdict);
  if (mode === "personal" && v && typeof v.score === "number") return v.score;
  if (u && typeof u.score === "number") return u.score;
  return null;
}
function ganzhi(d: DaySnap): string {
  const s = typeof d.stem === "string" ? d.stem : "";
  const b = typeof d.branch === "string" ? d.branch : "";
  return (s + b) || "—";
}
function dayNum(d: DaySnap): number { return typeof d.day === "number" ? d.day : Number(d.day) || 0; }
function dateLabel(d: DaySnap, month: number, year: number): string {
  if (typeof d.date === "string" && d.date) return d.date;
  return `${year || "?"}-${String(month || 0).padStart(2, "0")}-${String(dayNum(d)).padStart(2, "0")}`;
}
function starNames(value: unknown): string[] {
  return asArray(value).map((item) => {
    if (typeof item === "string") return item;
    const row = asRecord(item);
    return row ? String(row.key || row.han_trad || row.han || "") : "";
  }).filter(Boolean);
}
function starsOf(d: DaySnap): { good: string[]; bad: string[]; unknown: string[] } {
  const sd = asRecord(d.stars_detail);
  if (sd) return { good: starNames(sd.good), bad: starNames(sd.bad), unknown: starNames(sd.unknown) };
  const g = asRecord(d.gods);
  if (g) return { good: starNames(g.good), bad: starNames(g.bad), unknown: starNames(g.unknown) };
  return { good: [], bad: [], unknown: [] };
}

/** engine (ranking เท่านั้น ไม่คำนวณดวงใหม่) จัดอันดับวันมงคล/วันควรเลี่ยง top จาก verdict.score ที่คำนวณเสร็จแล้ว
 *  → คืน fact block (ข้อความล้วน ไม่มีตัวเลขคะแนนดิบ — ใช้ลำดับแทน ตาม NO_PERCENT) ให้ AI แค่เรียบเรียงภาษา */
function factBlockFromCalendar(month: Record<string, unknown>, selectedDay: number | null, mode: "tongshu" | "personal"): { factBlock: string; monthLabel: string; yearPillar: string; monthPillar: string } {
  const days = asArray(month.days) as DaySnap[];
  const y = typeof month.year === "number" ? month.year : Number(month.year) || 0;
  const m = typeof month.month === "number" ? month.month : Number(month.month) || 0;
  const monthLabel = `${y || "?"}-${String(m || 0).padStart(2, "0")}`;
  const yearPillar = typeof month.year_pillar === "string" ? month.year_pillar : "";
  const monthPillar = typeof month.month_pillar === "string" ? month.month_pillar : "";
  const jieqiCurrent = typeof month.jieqi_current === "string" ? month.jieqi_current : "";
  const jieqiNext = typeof month.jieqi_next === "string" ? month.jieqi_next : "";
  const jieqiList = asArray(month.jieqi_list) as { name?: unknown; day?: unknown }[];

  const scored = days
    .map((d) => ({ d, s: dayScore(d, mode) }))
    .filter((x): x is { d: DaySnap; s: number } => x.s != null);
  const good = [...scored].sort((a, b) => b.s - a.s).slice(0, 5);
  const risky = [...scored].sort((a, b) => a.s - b.s).slice(0, 5);

  const L: string[] = [];
  L.push(`โหมดคะแนนที่ผู้ใช้เลือก: ${mode === "tongshu" ? "ทั่วไป 黃曆 (universal)" : "ดวงส่วนบุคคล (personal)"}`);
  L.push(`เดือน/ปี: ${monthLabel} · เสาปี(年柱): ${yearPillar || "—"} · เสาเดือน(月柱): ${monthPillar || "—"}`);
  if (jieqiCurrent || jieqiNext) L.push(`節氣ในเดือน: ${jieqiCurrent || "—"} → ${jieqiNext || "—"}`);
  if (jieqiList.length) {
    L.push(`節氣ที่ตกในเดือนนี้: ${jieqiList.map((j) => `${typeof j.name === "string" ? j.name : ""}(วันที่ ${j.day ?? "?"})`).join(" · ")}`);
  }

  L.push(`━━━ วันมงคล เรียงจากดีที่สุด (engine จัดอันดับจากคะแนนที่คำนวณแล้ว — อย่าใส่ตัวเลขคะแนนในรายงาน ใช้ลำดับ/คำเชิงคุณภาพแทน) ━━━`);
  good.forEach(({ d }, i) => {
    L.push(`  อันดับ ${i + 1}: ${dateLabel(d, m, y)} (${ganzhi(d)}) 建除:${typeof d.day_officer === "string" ? d.day_officer : "—"} 宜:${asStrArray(d.yi).slice(0, 4).join("/") || "—"} 忌:${asStrArray(d.ji).slice(0, 4).join("/") || "—"}`);
  });
  L.push(`━━━ วันควรเลี่ยง เรียงจากเสี่ยงที่สุด (engine จัดอันดับจากคะแนนที่คำนวณแล้ว) ━━━`);
  risky.forEach(({ d }, i) => {
    L.push(`  อันดับ ${i + 1}: ${dateLabel(d, m, y)} (${ganzhi(d)}) 建除:${typeof d.day_officer === "string" ? d.day_officer : "—"} 宜:${asStrArray(d.yi).slice(0, 4).join("/") || "—"} 忌:${asStrArray(d.ji).slice(0, 4).join("/") || "—"}`);
  });

  const sel = selectedDay != null ? days.find((d) => dayNum(d) === selectedDay) : undefined;
  if (sel) {
    const st = starsOf(sel);
    L.push(`━━━ วันที่เลือกดูรายละเอียด: ${dateLabel(sel, m, y)} (${ganzhi(sel)}) ━━━`);
    L.push(`建除: ${typeof sel.day_officer === "string" ? sel.day_officer : "—"} · 黃黑道(12星): ${typeof sel.twelve_star === "string" ? sel.twelve_star : "—"} · จันทรคติ: ${typeof sel.lunar === "string" ? sel.lunar : "—"}`);
    L.push(`宜(เหมาะทำ): ${asStrArray(sel.yi).join(" · ") || "—"}`);
    L.push(`忌(ห้ามทำ): ${asStrArray(sel.ji).join(" · ") || "—"}`);
    L.push(`神煞มงคล: ${st.good.join(" · ") || "—"} · 神煞อัปมงคล: ${st.bad.join(" · ") || "—"}`);
    if (st.unknown.length) L.push(`神煞ที่ยังไม่จัดประเภท (neutral/unknown): ${st.unknown.join(" · ")}`);
  }

  return { factBlock: L.join("\n"), monthLabel, yearPillar, monthPillar };
}

function buildCalendarSummaryPrompt(factBlock: string, hasSelected: boolean, lang: string): string {
  const langDir = LANG_ANSWER_DIRECTIVE[lang] || "";
  const target = langName(lang);
  return [
    `คุณคือซินแสฤกษ์ยาม (ผู้เชี่ยวชาญปฏิทินจีน 黃曆/通勝 · ตงซู) หน้าที่: เรียบเรียง "ข้อมูลปฏิทินเดือนนี้" ด้านล่าง (建除/黃黑道/神煞/宜忌/การจัดอันดับวันดี-วันเสี่ยง ที่ engine คำนวณเสร็จแล้ว) ให้เป็นรายงานฉบับเต็มสำหรับ Export เป็น PDF`,
    `⚠️ ข้อมูลด้านล่างคือผลคำนวณจากระบบที่เสร็จแล้ว — ห้ามเดา/แต่งวันหรือ 干支/宜忌 ขึ้นเอง ห้ามขัดแย้งกับข้อมูลเดิม ให้เรียบเรียงให้อ่านลื่นเป็นรายงานฉบับเต็มเท่านั้น`,
    ``,
    `━━━ ข้อมูลปฏิทินจริง (จากระบบ) ━━━`,
    factBlock,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `เขียนรายงานเป็น Markdown ด้วยหัวข้อระดับ 2 (ขึ้นต้น "## ") ตามนี้ครบ เรียงลำดับ ห้ามข้าม ห้ามเพิ่มหัวข้ออื่นนอกเหนือนี้:`,
    `## ภาพรวมเดือน — สรุปโทนของเดือนโดยรวม แล้วชี้วันมงคล (วันดี) และวันควรเลี่ยง จากรายการที่ให้มา ตามด้วยตาราง Markdown คอลัมน์ครบ 4 คอลัมน์เป๊ะ: | วันสำคัญ | 干支 | 宜 | 忌 | — แถวละ 1 วัน ใส่ทั้งวันมงคลและวันควรเลี่ยงในตารางเดียวกัน (ระบุในคอลัมน์ "วันสำคัญ" ว่าเป็นวันดีหรือวันควรเลี่ยงด้วยคำ เช่น "5 ก.ค. (วันดี)" หรือ "12 ก.ค. (ควรเลี่ยง)")`,
    hasSelected ? `## วันที่เลือก — อธิบายรายละเอียดวันที่ผู้ใช้กำลังดูอยู่ (建除/黃黑道/宜忌เต็ม/神煞) ว่าเหมาะ/ไม่เหมาะทำอะไร` : ``,
    ``,
    `กติกาการเขียน (เคร่งครัด):`,
    `- โทนซินแสที่กล้า "ฟันธง" ชัดเจน ไม่กั๊ก ไม่พูดลอย แต่สุภาพ ให้กำลังใจ (ยึดข้อมูลเดิมเป็นหลัก ขยายความให้ลึกและอ่านลื่นขึ้น)`,
    `- ⛔ ห้ามพูด 6 เรื่องต้องห้ามเด็ดขาด: วันตาย/อายุขัย · โรคร้ายแรงเจาะจง · การแท้ง–มี/ไม่มีบุตร · การหย่าร้างฟันธง · ภัยพิบัติ/อุบัติเหตุถึงชีวิต (ให้พูดเชิงดูแล/ป้องกันแทน)`,
    `- ⛔ NO_PERCENT: ห้ามใส่ตัวเลขเปอร์เซ็นต์ คะแนน หรือสถิติใด ๆ ในคำอ่าน (ใช้คำเชิงคุณภาพ/ลำดับแทน เช่น "ดีที่สุด" "รองลงมา")`,
    `- ใช้ bullet (- ) และ **ตัวหนา** ได้ ให้อ่านง่าย`,
    `- เริ่มที่เนื้อหาเลย ห้ามเกริ่นว่ากำลังอ่านไฟล์/ข้อมูล/prompt`,
    langDir ? `\n${langDir}` : `\n⚠️ ภาษา: เขียนทั้งฉบับเป็น ${target}`,
  ].filter(Boolean).join("\n");
}

export const calendarHandler: PageHandler<CalendarCtx> = {
  async resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<CalendarCtx> | ResolveErr> {
    const inputs = rawInputs as { calendar?: unknown };
    const cal = asRecord(inputs.calendar);
    const month = cal ? asRecord(cal.month) : null;
    const days = month ? asArray(month.days) : [];
    if (!month || days.length < 1) return { error: "invalid_inputs", status: 400 };

    const selectedRaw = cal?.selected;
    const selectedDay = typeof selectedRaw === "number" && Number.isFinite(selectedRaw) ? selectedRaw : null;
    const mode = cal?.mode === "tongshu" ? "tongshu" : "personal";

    const { factBlock, monthLabel, yearPillar, monthPillar } = factBlockFromCalendar(month, selectedDay, mode);

    // dataHash ผูกกับเนื้อเดือน+วันที่เลือกเท่านั้น (route.ts คำนวณ cache key ร่วมกับคอลัมน์ page/lang อยู่แล้ว → ไม่ต้องผสมซ้ำ)
    const dataHash = createHash("sha256").update(JSON.stringify({ month, selectedDay, mode, goal: cal?.goal, intent: cal?.intent })).digest("hex");
    const cookie = await authCookie(session);
    return { dataHash, ctx: { factBlock, monthLabel, yearPillar, monthPillar, mode, cookie } };
  },

  async generate(ctx: CalendarCtx, lang: string): Promise<GenerateResult> {
    const hasSelected = /วันที่เลือกดูรายละเอียด/.test(ctx.factBlock);
    const prompt = buildCalendarSummaryPrompt(ctx.factBlock, hasSelected, lang);
    const ai = await callSifu(ctx.cookie, prompt);
    if (!ai.ok || !ai.reply) throw new Error(ai.error || "ai_failed");
    const ci = coverI18n(lang);
    const cover: Record<string, unknown> = {
      kick: ci.kick,
      title: ci.title,
      who: ctx.monthLabel,
      metaHtml: [ctx.yearPillar, ctx.monthPillar].filter(Boolean).join(" · "),
      big: "曆",
      badge: ci.badge,
      qrLabel: "hourkey.io",
    };
    return { markdown: ai.reply, cover, figs: [] };
  },
};
