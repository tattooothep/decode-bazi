/**
 * src/lib/export/chart.ts · PageHandler "chart" — ย้าย logic เดิมจาก route.ts มาตรง ๆ (พฤติกรรมเดิมเป๊ะ · regression-safe)
 * resolveInputs: birth จาก client (_chartLast) หรือ profileId (org-scoped) → ChartBody + cookie ผูกใน ctx
 * generate: เรียก /api/chart internal (deterministic) → สกัดข้อเท็จจริง → prompt สรุป 5 หัวข้อ → /api/sifu (1 call) → markdown+cover+figs
 */
import { q1 } from "@/lib/db";
import type { Session } from "@/lib/auth";
import { createHash } from "crypto";
import { langName } from "@/lib/palm/prompt";
import { LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { INTERNAL_BASE, esc, cleanId, authCookie, callSifu } from "./shared";
import type { PageHandler, ResolveOk, ResolveErr, GenerateResult } from "./types";

/* ── โต๊ะธาตุ (deterministic · ไม่พึ่ง AI) ── */
const STEM_EL: Record<string, string> = { 甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water" };
const BRANCH_EL: Record<string, string> = { 子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire", 午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water" };
const EL_ZH: Record<string, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
const EL_COLOR: Record<string, string> = { wood: "#5a8a48", fire: "#b03a2e", earth: "#9a7d3a", metal: "#c9a94d", water: "#4a6f8a" };
const PILLAR_ORDER = ["year", "month", "day", "hour"] as const;

/* ── ปกหลายภาษา (9 ภาษา · กฎเจ้านาย: ทุก PDF ต้องมีปก) ── */
const COVER_I18N: Record<string, { kick: string; titleFallback: string; dm: string; structure: string; badge: string; female: string; male: string; timeUnknown: string }> = {
  th: { kick: "รายงานสรุปดวงชะตา · AI 八字", titleFallback: "สรุปดวงชะตากำเนิด", dm: "ธาตุประจำวัน", structure: "โครงสร้าง", badge: "✓ สรุปโดย AI ซินแส · อิงผังจริง (TST + tyme4ts)", female: "หญิง", male: "ชาย", timeUnknown: "ไม่ทราบเวลา" },
  en: { kick: "AI BaZi summary report 八字", titleFallback: "Natal chart summary", dm: "Day Master", structure: "Structure", badge: "✓ AI sifu summary · from the real chart (TST + tyme4ts)", female: "female", male: "male", timeUnknown: "time unknown" },
  zh: { kick: "AI 八字命理總結報告", titleFallback: "先天命盤總結", dm: "日主", structure: "格局", badge: "✓ AI 命理師總結 · 依真實命盤 (真太陽時 + tyme4ts)", female: "女", male: "男", timeUnknown: "時辰不詳" },
  cn: { kick: "AI 八字命理总结报告", titleFallback: "先天命盘总结", dm: "日主", structure: "格局", badge: "✓ AI 命理师总结 · 依真实命盘 (真太阳时 + tyme4ts)", female: "女", male: "男", timeUnknown: "时辰不详" },
  vi: { kick: "Báo cáo tổng hợp Bát Tự bằng AI 八字", titleFallback: "Tổng hợp lá số bẩm sinh", dm: "Nhật Chủ (日主)", structure: "Cách Cục (格局)", badge: "✓ AI luận giải · từ lá số thật (TST + tyme4ts)", female: "nữ", male: "nam", timeUnknown: "không rõ giờ" },
  ja: { kick: "AI 四柱推命まとめレポート 八字", titleFallback: "先天命式まとめ", dm: "日主", structure: "格局", badge: "✓ AI 鑑定まとめ · 実際の命式に基づく (真太陽時 + tyme4ts)", female: "女性", male: "男性", timeUnknown: "時刻不明" },
  ko: { kick: "AI 사주 요약 리포트 八字", titleFallback: "선천 명반 요약", dm: "일주(日主)", structure: "격국(格局)", badge: "✓ AI 명리 요약 · 실제 명반 기반 (진태양시 + tyme4ts)", female: "여성", male: "남성", timeUnknown: "시간 미상" },
  ru: { kick: "AI-отчёт по Ба-цзы 八字", titleFallback: "Сводка натальной карты", dm: "Хозяин дня (日主)", structure: "Структура (格局)", badge: "✓ Сводка AI-мастера · по реальной карте (TST + tyme4ts)", female: "жен.", male: "муж.", timeUnknown: "время неизвестно" },
  es: { kick: "Informe resumen de BaZi con IA 八字", titleFallback: "Resumen de la carta natal", dm: "Amo del Día (日主)", structure: "Estructura (格局)", badge: "✓ Resumen del maestro IA · desde la carta real (TST + tyme4ts)", female: "mujer", male: "hombre", timeUnknown: "hora desconocida" },
};
function coverI18n(lang: string) { return COVER_I18N[lang] || COVER_I18N.en; }

/* ── เรียก /api/chart (fusion-internal cookie · ดึงดวง server-side) ── */
type ChartInputs = { profileId?: string; birth?: Record<string, unknown> };
type ChartBody = { date: string; time: string; longitude: number; gender: string; dayBoundary: string; birthTimeKnown: boolean; name?: string; place?: string };
export type ChartCtx = { chartBody: ChartBody; cookie: string };

/** โหลดดวงจาก profiles (org-scoped · กันอ่านข้ามบัญชี) → ChartBody · ใช้เมื่อส่ง profileId มาแทน birth */
async function loadBirthFromProfile(profileId: string, userId: string, orgId: string | null): Promise<ChartBody | null> {
  const row = await q1<{ name: string | null; nickname: string | null; birth_datetime: string | null; birth_lng: number | null; gender: string | null; birth_time_known: boolean | null; day_boundary: string | null }>(
    `SELECT name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
            birth_lng, gender, birth_time_known, day_boundary
       FROM profiles WHERE id=$1::uuid AND (created_by_user_id=$2::uuid OR ($3::uuid IS NOT NULL AND org_id=$3::uuid)) AND is_archived=false`,
    [profileId, userId, orgId]
  );
  if (!row || !row.birth_datetime) return null;
  const [date, timeRaw] = row.birth_datetime.split("T");
  return {
    date,
    time: (timeRaw || "12:00").slice(0, 5),
    longitude: Number(row.birth_lng ?? 100.5018),
    gender: String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M",
    dayBoundary: row.day_boundary === "00:00" ? "00:00" : "23:00",
    birthTimeKnown: row.birth_time_known !== false,
    name: (row.nickname || row.name || "").slice(0, 40),
  };
}

/** normalize inputs.birth (จาก client _chartLast.birth) → ChartBody */
function birthToChartBody(birth: Record<string, unknown>): ChartBody | null {
  const date = String(birth.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const g = String(birth.gender || "M").trim().toLowerCase().charAt(0) === "f" ? "F" : "M";
  return {
    date,
    time: String(birth.time || "12:00").slice(0, 5),
    longitude: Number(birth.longitude ?? 100.5018),
    gender: g,
    dayBoundary: birth.dayBoundary === "00:00" ? "00:00" : "23:00",
    birthTimeKnown: birth.birthTimeKnown !== false,
    name: String(birth.name || "").slice(0, 40),
    place: birth.place ? String(birth.place).slice(0, 80) : undefined,
  };
}

async function fetchChart(cookie: string, body: ChartBody): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(new URL("/api/chart", INTERNAL_BASE), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": cookie },
      body: JSON.stringify({ date: body.date, time: body.time, longitude: body.longitude, gender: body.gender, dayBoundary: body.dayBoundary, birthTimeKnown: body.birthTimeKnown }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return j && (j as { pillars?: unknown }).pillars ? j : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/* ── สกัดข้อเท็จจริงจากผัง (deterministic) สำหรับ prompt ── */
function pillarGz(p: Record<string, { stem?: string; branch?: string }>, k: string): string {
  const pp = p[k] || {}; return (pp.stem || "") + (pp.branch || "");
}
function elJoin(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr.map((e) => `${EL_ZH[String(e)] || ""}(${String(e)})`).filter((x) => x.length > 3).join(" · ");
}
function extractFacts(data: Record<string, unknown>): { name: string; factBlock: string; dm: string; structure: string; pillars: Record<string, { stem?: string; branch?: string }> } {
  const p = (data.pillars || {}) as Record<string, { stem?: string; branch?: string }>;
  const a = (data.analysis || {}) as Record<string, unknown>;
  const yv2 = (data.yongshen_v2 || {}) as Record<string, unknown>;
  const dm = (p.day && p.day.stem) || "";
  const dmEl = STEM_EL[dm] || "";
  const structure = String(yv2.structure_label || (a.ge_ju as { structure?: string })?.structure || "");
  const vs = (a.voytek_strength || {}) as Record<string, unknown>;
  const strength = String(vs.level_th || vs.level_en || vs.level_zh || "");
  const lp = (a.luck_pillars || []) as Array<{ stem?: string; branch?: string; element?: string; age_start?: number }>;
  const curIdx = Number(a.current_luck_idx || 0);
  const luckLines = lp.slice(0, 8).map((d, i) => `${i === curIdx ? "▶" : " "} ${d.age_start != null ? Math.floor(d.age_start) + "ปี" : "?"} ${(d.stem || "") + (d.branch || "")}${d.element ? " " + EL_ZH[d.element] : ""}`).join("\n");
  const ed = (a.element_distribution || {}) as { pctDisplay?: Record<string, number>; pctRaw?: Record<string, number> };
  const pct = ed.pctDisplay || ed.pctRaw || {};
  const elsSorted = Object.keys(pct).sort((x, y) => (pct[y] || 0) - (pct[x] || 0));
  const strongEl = elsSorted[0] ? `${EL_ZH[elsSorted[0]]}(${elsSorted[0]})` : "";
  const weakEl = elsSorted.length ? `${EL_ZH[elsSorted[elsSorted.length - 1]]}(${elsSorted[elsSorted.length - 1]})` : "";
  const inter = (a.interactions || []) as Array<{ type?: string; pillars_pair?: string[] }>;
  const interTxt = inter.slice(0, 6).map((f) => `${f.type || ""}(${(f.pillars_pair || []).join("·")})`).filter((x) => x.length > 2).join(" · ");
  const name = String(((data as { snapshot?: { name?: string } }).snapshot?.name) || "");

  const lines = [
    `สี่เสา 四柱: 年 ${pillarGz(p, "year")} · 月 ${pillarGz(p, "month")} · 日 ${pillarGz(p, "day")} · 時 ${pillarGz(p, "hour")}`,
    `日主 (ธาตุประจำวัน): ${dm}${dmEl ? ` ${EL_ZH[dmEl]}(${dmEl})` : ""}`,
    structure ? `格局 โครงสร้าง: ${structure}` : "",
    strength ? `強弱 กำลังวัน: ${strength}` : "",
    strongEl ? `ธาตุเด่นสุด: ${strongEl} · ธาตุพร่องสุด: ${weakEl}` : "",
    yv2.primary_yongshen ? `用神 (ธาตุอุปถัมภ์): ${elJoin(yv2.primary_yongshen)}` : "",
    yv2.xishen ? `喜神 (ธาตุชอบรอง): ${elJoin(yv2.xishen)}` : "",
    yv2.jishen ? `忌神 (ธาตุเลี่ยง): ${elJoin(yv2.jishen)}` : "",
    yv2.tiaohou_required ? `調候 (ปรับฤดู): ${EL_ZH[String(yv2.tiaohou_required)] || ""}(${yv2.tiaohou_required})` : "",
    Array.isArray(yv2.diseases) && yv2.diseases.length ? `病 (จุดอ่อนโครงสร้าง): ${(yv2.diseases as string[]).join(" · ")}` : "",
    Array.isArray(yv2.medicine) && yv2.medicine.length ? `藥 (ทางแก้): ${(yv2.medicine as string[]).join(" · ")}` : "",
    interTxt ? `ปฏิกิริยากิ่ง/ก้าน 合冲刑害: ${interTxt}` : "",
    luckLines ? `大運 วัยจร (▶ = รอบปัจจุบัน):\n${luckLines}` : "",
  ].filter(Boolean);
  return { name, factBlock: lines.join("\n"), dm, structure, pillars: p };
}

/* ── prompt สรุป 5 หัวข้อ (## H2 · ให้ buildDocHtml ตัด section) ── */
function buildSummaryPrompt(facts: ReturnType<typeof extractFacts>, lang: string, displayName: string): string {
  const langDir = LANG_ANSWER_DIRECTIVE[lang] || "";
  const target = langName(lang);
  return [
    `คุณคือซินแสปาจื้อผู้เชี่ยวชาญ หน้าที่: สรุป "ผังดวงจริง" ด้านล่างเป็นรายงานกระชับ อ่านง่าย สำหรับ Export เป็น PDF`,
    `⚠️ Engine คำนวณผังเสร็จแล้ว (ด้านล่าง) — ห้ามเดา/แก้ตัวเลข เสา ธาตุ 用神 หรือวัยจรใหม่ ให้ยึดข้อมูลนี้เท่านั้น แล้วอธิบายเป็นภาษาคน`,
    ``,
    `ชื่อเจ้าของดวง: ${displayName || "(ไม่ระบุ)"}`,
    `━━━ ผังดวงจริง (deterministic) ━━━`,
    facts.factBlock,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `เขียนรายงานเป็น Markdown ด้วยหัวข้อระดับ 2 (ขึ้นต้น "## ") ตามนี้ครบ 5 หัวข้อ เรียงลำดับ ห้ามข้าม ห้ามเพิ่มหัวข้ออื่นนอกเหนือนี้:`,
    `## 1. ภาพรวมดวง — สรุปนิสัย/แก่นตัวตนจาก 日主 + โครงสร้าง 格局 + ธาตุเด่น/พร่อง`,
    `## 2. จุดแข็งและธาตุที่หนุนดวง (用神) — จุดแข็งจากผัง + อธิบาย 用神/喜神 ว่าหนุนชีวิตอย่างไร + 忌神 ที่ควรระวัง`,
    `## 3. งาน · เงิน · ความรัก — ฟันธงแนวทางการงาน/การเงิน และภาพคู่ครอง/ความสัมพันธ์จากผัง`,
    `## 4. จังหวะชีวิต 大運 (วัยจร) — อ่านรอบ大運ปัจจุบันและช่วงถัดไป ว่าจังหวะไหนหนุน/ท้าทาย`,
    `## 5. คำแนะนำ — ข้อแนะนำที่ทำได้จริง 3–5 ข้อ (ธาตุ/ทิศทาง/จังหวะ) ตามผัง`,
    ``,
    `กติกาการเขียน (เคร่งครัด):`,
    `- โทนซินแสที่กล้า "ฟันธง" ชัดเจน ไม่กั๊ก ไม่พูดลอย แต่สุภาพ ให้กำลังใจ`,
    `- ⛔ ห้ามพูด 6 เรื่องต้องห้ามเด็ดขาด: วันตาย/อายุขัย · โรคร้ายแรงเจาะจง · การแท้ง–มี/ไม่มีบุตร · การหย่าร้างฟันธง · ภัยพิบัติ/อุบัติเหตุถึงชีวิต (ให้พูดเชิงดูแล/ป้องกันแทน)`,
    `- ⛔ NO_PERCENT: ห้ามใส่ตัวเลขเปอร์เซ็นต์ คะแนน หรือสถิติใด ๆ ในคำอ่าน (ใช้คำเชิงคุณภาพแทน)`,
    `- ใช้ bullet (- ) และ **ตัวหนา** ได้ ให้อ่านง่าย · แต่ละหัวข้อ 2–5 ย่อหน้าสั้น`,
    `- ศัพท์วิชาจีนคงตัวจีนในวงเล็บครั้งแรก (用神/大運/格局 ฯลฯ) แล้วอธิบายด้วยภาษาเป้าหมาย`,
    `- เริ่มที่เนื้อหาเลย ห้ามเกริ่นว่ากำลังอ่านไฟล์/ข้อมูล/prompt`,
    langDir ? `\n${langDir}` : `\n⚠️ ภาษา: เขียนทั้งฉบับเป็น ${target}`,
  ].join("\n");
}

/* ── SVG figs (server-side · deterministic · escape ค่าจริง) ── */
function pillarSvg(p: Record<string, { stem?: string; branch?: string }>): string {
  const cx: Record<string, number> = { year: 76, month: 208, day: 345, hour: 482 };
  const bx: Record<string, number> = { year: 20, month: 152, day: 289, hour: 426 };
  const hdr: Record<string, string> = { year: "年", month: "月", day: "日 ★", hour: "時" };
  let s = '<svg viewBox="0 0 560 176" width="560" role="img" aria-label="four pillars">';
  s += '<rect x="1" y="1" width="558" height="174" rx="10" fill="#fffdf7" stroke="#e5ddc9"/>';
  s += '<g font-size="12" text-anchor="middle" fill="#8a6d2a">';
  for (const k of PILLAR_ORDER) s += `<text x="${cx[k]}" y="20">${esc(hdr[k])}</text>`;
  s += "</g>";
  for (const k of PILLAR_ORDER) {
    const pp = p[k] || {}, st = pp.stem || "", br = pp.branch || "";
    const sc = EL_COLOR[STEM_EL[st]] || "#9a7d3a", bc = EL_COLOR[BRANCH_EL[br]] || "#4a6f8a";
    const hl = k === "day", by = hl ? 26 : 30, bh = hl ? 138 : 130;
    s += `<g><rect x="${bx[k]}" y="${by}" width="112" height="${bh}" rx="8" fill="${hl ? "#fbf3dd" : "#fefcf5"}" stroke="${hl ? "#c8a44d" : "#e5ddc9"}"${hl ? ' stroke-width="2"' : ""}/>`;
    s += `<circle cx="${cx[k]}" cy="66" r="24" fill="${sc}"/><text x="${cx[k]}" y="74" text-anchor="middle" font-size="26" fill="#fff">${esc(st)}</text>`;
    s += `<circle cx="${cx[k]}" cy="122" r="24" fill="${bc}"/><text x="${cx[k]}" y="130" text-anchor="middle" font-size="26" fill="#fff">${esc(br)}</text></g>`;
  }
  return s + "</svg>";
}
function elementBarsSvg(data: Record<string, unknown>): string {
  const a = (data.analysis || {}) as Record<string, unknown>;
  const ed = (a.element_distribution || {}) as { pctDisplay?: Record<string, number>; pctRaw?: Record<string, number> };
  const pct = ed.pctDisplay || ed.pctRaw || {};
  const order = ["water", "fire", "earth", "metal", "wood"];
  let max = 1; for (const e of order) if ((pct[e] || 0) > max) max = pct[e] || 0;
  let s = '<svg viewBox="0 0 560 150" width="560" role="img" aria-label="five elements">';
  s += '<rect x="1" y="1" width="558" height="148" rx="10" fill="#fffdf7" stroke="#e5ddc9"/>';
  order.forEach((e, i) => {
    const v = pct[e] == null ? 0 : Math.round(pct[e]);
    const h = Math.round((v / max) * 90), x = 46 + i * 100;
    s += `<rect x="${x}" y="${118 - h}" width="56" height="${h}" rx="5" fill="${EL_COLOR[e]}"/>`;
    s += `<text x="${x + 28}" y="136" text-anchor="middle" font-size="13" fill="#5f5847">${esc(EL_ZH[e])}</text>`;
  });
  return s + "</svg>";
}
function buildFigs(data: Record<string, unknown>): ExportFigArr {
  const p = (data.pillars || {}) as Record<string, { stem?: string; branch?: string }>;
  const figs: ExportFigArr = [];
  if (p.day) figs.push({ svg: pillarSvg(p), cap: "四柱 · สี่เสาหลัก (วงกลม = ธาตุ · เสาวัน = ตัวเรา)" });
  figs.push({ svg: elementBarsSvg(data), cap: "五行 · สมดุลห้าธาตุ" });
  return figs;
}
type ExportFigArr = Array<{ svg: string; cap: string }>;

function buildCover(lang: string, chartBody: ChartBody, data: Record<string, unknown>, facts: ReturnType<typeof extractFacts>, displayName: string): Record<string, unknown> {
  const ci = coverI18n(lang);
  const p = facts.pillars;
  const dayGz = pillarGz(p, "day");
  const dmEl = STEM_EL[facts.dm] || "";
  const gender = chartBody.gender ? (chartBody.gender.charAt(0).toUpperCase() === "F" ? ci.female : ci.male) : "";
  const who = (displayName || ci.titleFallback) + (gender ? ` · ${gender}` : "");
  const timeStr = chartBody.birthTimeKnown === false ? ci.timeUnknown : chartBody.time;
  const pillarsStr = PILLAR_ORDER.map((k) => pillarGz(p, k)).join(" · ");
  const metaHtml = esc([chartBody.date, timeStr, chartBody.place || ""].filter(Boolean).join(" · ")) + "<br>" + esc(pillarsStr);
  const tst = (data.tst || {}) as { appliedTimeStr?: string };
  const sub = `${ci.dm}: ${facts.dm}${dmEl ? ` ${EL_ZH[dmEl]}` : ""}` + (facts.structure ? ` · ${ci.structure}: ${facts.structure}` : "") + (tst.appliedTimeStr ? ` · TST ${tst.appliedTimeStr}` : "");
  return { kick: ci.kick, title: displayName || ci.titleFallback, who, metaHtml, big: dayGz, sub, badge: ci.badge, qrLabel: "hourkey.io" };
}

export const chartHandler: PageHandler<ChartCtx> = {
  async resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<ChartCtx> | ResolveErr> {
    const userId = session.userId;
    const orgId = session.orgId ?? null;
    const inputs = rawInputs as ChartInputs;

    let chartBody: ChartBody | null = null;
    if (inputs.birth && typeof inputs.birth === "object") chartBody = birthToChartBody(inputs.birth as Record<string, unknown>);
    if (!chartBody) {
      const pid = cleanId(inputs.profileId);
      if (pid) chartBody = await loadBirthFromProfile(pid, userId, orgId);
    }
    if (!chartBody) return { error: "invalid_inputs", status: 400 };

    // data_hash = sha256(hashInputs) · normalize เฉพาะ field ที่กระทบผล (page+lang กรองซ้ำอยู่แล้วในคำสั่ง SQL cache ที่ route.ts)
    const hashInputs = { d: chartBody.date, t: chartBody.time, lng: chartBody.longitude, g: chartBody.gender, db: chartBody.dayBoundary, tk: chartBody.birthTimeKnown };
    const dataHash = createHash("sha256").update(JSON.stringify(hashInputs)).digest("hex");
    const cookie = await authCookie(session);
    return { dataHash, ctx: { chartBody, cookie } };
  },

  async generate(ctx: ChartCtx, lang: string): Promise<GenerateResult> {
    const data = await fetchChart(ctx.cookie, ctx.chartBody);
    if (!data) throw new Error("chart_fetch_failed");
    const facts = extractFacts(data);
    const displayName = facts.name || ctx.chartBody.name || "";
    const prompt = buildSummaryPrompt(facts, lang, displayName);
    const ai = await callSifu(ctx.cookie, prompt);
    if (!ai.ok || !ai.reply) throw new Error(ai.error || "ai_failed");
    return {
      markdown: ai.reply,
      cover: buildCover(lang, ctx.chartBody, data, facts, displayName),
      figs: buildFigs(data),
    };
  },
};
