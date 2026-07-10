/**
 * src/lib/export/qimen.ts · PageHandler "qimen" — สรุป PDF จากผังฉีเหมินตุ้นเจี่ย (奇門遁甲)
 * ⚠️ ลอกแบบ palm.ts (แม่แบบตรงที่สุด): client ส่ง snapshot ผังที่คำนวณเสร็จแล้วมา → ไม่ re-fetch/ไม่คำนวณซ้ำ
 *    client ส่ง inputs.qimen = window._qimenLast (chart + palaces 9 วัง + stored/compound/source_formations + yongshen_selector)
 * resolveInputs: validate ว่ามี palaces ครบ 9 วังจริง · dataHash ผูกกับเนื้อผัง + lang (เปลี่ยนภาษา/คำนวณผังใหม่ = cache ใหม่)
 * generate: ไม่เรียก engine ฉีเหมินซ้ำ — สกัดข้อเท็จจริง (局/遁干/9 วัง/格局/用神 selector) ที่ engine คำนวณเสร็จแล้ว
 *           ป้อนเข้า AI ให้เรียบเรียงเป็นรายงาน PDF 4 หัวข้อ (ภาพรวมผัง/用神·格局/ทิศ·應期/คำแนะนำ)
 * ⚠️ ไม่แตะ src/app/api/export/summary/route.ts (เจ้าของ route จะ register HANDLERS.qimen เอง กัน conflict)
 */
import type { Session } from "@/lib/auth";
import { createHash } from "crypto";
import { langName } from "@/lib/palm/prompt";
import { LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { authCookie, callSifu } from "./shared";
import { assertAiSectionCount, assertEvidenceBoundMeasurements, makeAiDocument } from "./pdf-v2";
import type { PageHandler, ResolveOk, ResolveErr, GenerateResult } from "./types";

export type QimenCtx = { qimen: Record<string, unknown>; cookie: string };

/* ── ปกหลายภาษา (9 ภาษา) ── */
const COVER_I18N: Record<string, { kick: string; title: string; badge: string }> = {
  th: { kick: "รายงานฉีเหมินตุ้นเจี่ย · AI 奇門", title: "สรุปผังฉีเหมิน", badge: "✓ สรุปโดย AI ซินแส · อิงผังฉีเหมินจริงที่คำนวณไว้" },
  en: { kick: "AI Qi Men report 奇門", title: "Qi Men chart summary", badge: "✓ AI sifu summary · from your calculated Qi Men chart" },
  zh: { kick: "AI 奇門遁甲總結報告", title: "奇門盤總結", badge: "✓ AI 命理師總結 · 依已排出的奇門盤" },
  cn: { kick: "AI 奇门遁甲总结报告", title: "奇门盘总结", badge: "✓ AI 命理师总结 · 依已排出的奇门盘" },
  vi: { kick: "Báo cáo Kỳ Môn Độn Giáp bằng AI 奇門", title: "Tổng hợp cục Kỳ Môn", badge: "✓ AI luận giải · từ cục Kỳ Môn đã lập" },
  ja: { kick: "AI 奇門遁甲まとめレポート 奇門", title: "奇門盤まとめ", badge: "✓ AI 鑑定まとめ · 作成済みの奇門盤に基づく" },
  ko: { kick: "AI 기문둔갑 요약 리포트 奇門", title: "기문 국 요약", badge: "✓ AI 명리 요약 · 이미 계산된 기문 국 기반" },
  ru: { kick: "AI-отчёт по Ци Мэнь 奇門", title: "Сводка карты Ци Мэнь", badge: "✓ Сводка AI-мастера · по рассчитанной карте Ци Мэнь" },
  es: { kick: "Informe de Qi Men Dun Jia con IA 奇門", title: "Resumen de la carta Qi Men", badge: "✓ Resumen del maestro IA · desde tu carta Qi Men calculada" },
};
function coverI18n(lang: string) { return COVER_I18N[lang] || COVER_I18N.en; }

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((x) => asRecord(x)) as Record<string, unknown>[]) : [];
}
function str(v: unknown): string { return v == null ? "" : String(v); }

/** window._qimenLast จาก qimen.html: { chart, palaces, stored_formations, compound_formations, source_formations, yongshen_selector } */
function extractQimen(raw: unknown): Record<string, unknown> | null {
  const r = asRecord(raw);
  if (!r) return null;
  const palaces = asArray(r.palaces);
  if (palaces.length < 9) return null; // ต้องครบ 9 วังจริง (ไม่รับผังบางส่วน/mock)
  return r;
}

/* reason/formation text อาจมาเป็น string หรือ object {text_th|th|label_th|summary_th|text} */
function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const r = asRecord(v);
  if (!r) return "";
  return str(r.text_th || r.th || r.label_th || r.summary_th || r.text || "");
}

const DIR_TH: Record<string, string> = { N: "เหนือ 北", NE: "ตะวันออกเฉียงเหนือ 東北", E: "ตะวันออก 東", SE: "ตะวันออกเฉียงใต้ 東南", S: "ใต้ 南", SW: "ตะวันตกเฉียงใต้ 西南", W: "ตะวันตก 西", NW: "ตะวันตกเฉียงเหนือ 西北", C: "กลาง 中" };

function palaceLine(p: Record<string, unknown>): string {
  const pid = Number(p.palace_id);
  const dir = DIR_TH[str(p.direction)] || str(p.direction) || "-";
  const trig = str(p.trigram_zh);
  const stem = [str(p.heaven_stem_zh), str(p.earth_stem_zh)].filter(Boolean).join("/");
  const door = str(p.door_zh);
  const star = str(p.star_zh);
  const deity = str(p.deity_zh);
  const scoreRaw = p.display_score ?? p.score;
  const score = typeof scoreRaw === "number" ? scoreRaw : (Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null);
  const br = asRecord(p.beginner_reading);
  const label = br ? str(br.label_th) : "";
  const summary = br ? str(br.summary_th) : "";
  const parts = [
    `วัง ${pid}${trig ? ` (${trig})` : ""} · ทิศ ${dir}`,
    stem ? `ก้าน/กิ่ง ${stem}` : "",
    door ? `ประตู門 ${door}` : "",
    (star || deity) ? `ดาว/เทพ ${[star, deity].filter(Boolean).join(" · ")}` : "",
    score != null ? `คะแนน ${score}` : "",
    label ? `ป้ายอ่านเบื้องต้น: ${label}` : "",
  ].filter(Boolean).join(" · ");
  return summary ? `${parts}\n    ${summary}` : parts;
}

/* รูปแบบพิเศษ (格局): รวม stored+compound+source แล้ว dedupe ตามชื่อ (ลอก qimenUniqueFormations แต่ทำฝั่ง server) */
function formationLines(qimen: Record<string, unknown>): string[] {
  const all = [...asArray(qimen.stored_formations), ...asArray(qimen.compound_formations), ...asArray(qimen.source_formations)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of all) {
    const nameTh = str(f.name_th || f.label_th);
    const nameZh = str(f.name_zh || f.label_zh);
    const key = `${nameTh}|${nameZh}|${str(f.scope)}|${str(f.scope_ref ?? f.palace_id)}`;
    if (!nameTh && !nameZh) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const note = str(f.note_th || f.description_th || f.note);
    const quality = str(f.quality);
    const scopeRef = f.scope_ref ?? f.palace_id;
    const scopeTxt = scopeRef != null ? ` (วัง ${scopeRef})` : "";
    out.push([nameTh, nameZh ? `(${nameZh})` : "", scopeTxt, quality ? `[${quality}]` : "", note ? `— ${note}` : ""].filter(Boolean).join(" "));
  }
  return out.slice(0, 20); // กันยาวเกิน (ที่เห็นจริงในผังไม่เกินนี้)
}

function yongshenLines(qimen: Record<string, unknown>): string[] {
  const chart = asRecord(qimen.chart) || {};
  const selector = asRecord(qimen.yongshen_selector) || asRecord(chart.yongshen_selector);
  if (!selector) return [];
  const out: string[] = [];
  const intent = asRecord(selector.intent);
  if (intent && (intent.label_th || intent.label_zh)) out.push(`เจตนา/สิ่งที่ดู: ${str(intent.label_th || intent.label_zh)}`);
  const targets = asArray(selector.target_palaces).slice(0, 3);
  for (const t of targets) {
    const reasons = asArray(t.reasons).map(textOf).filter(Boolean).slice(0, 3);
    const scoreRaw = t.selector_score;
    const scoreTxt = Number.isFinite(Number(scoreRaw)) ? ` · คะแนนชี้ 用神 ${scoreRaw}` : "";
    out.push(`วังที่เกี่ยวกับ 用神${scoreTxt}: วัง ${t.palace_id}${reasons.length ? " — " + reasons.join(" · ") : ""}`);
  }
  return out;
}

function factBlockFromQimen(qimen: Record<string, unknown>): string {
  const chart = asRecord(qimen.chart) || {};
  const palaces = asArray(qimen.palaces).sort((a, b) => Number(a.palace_id) - Number(b.palace_id));
  const pole = str(chart.dun_type).toLowerCase() === "yin" ? "陰" : "陽";
  const juZh = `${pole}${str(chart.ju_number) || "?"}局`;
  const dun = str(chart.dun_gan_zh) || "-";
  const yuan = str(chart.yuan_cycle_zh) || "-";
  const systemType = str(chart.system_type) || "-";
  const pillars = asRecord(chart.pillars) || {};
  const pgz = (k: string) => { const pp = asRecord(pillars[k]); return pp ? `${str(pp.stem)}${str(pp.branch)}` : ""; };

  const L: string[] = [];
  L.push(`局 (Ju): ${juZh} · 遁干 (Dun stem): ${dun} · ห้วง 元 (Cycle): ${yuan} · ระบบ: ${systemType}`);
  const pillarStr = ["year", "month", "day", "hour"].map((k) => pgz(k)).filter(Boolean).join(" · ");
  if (pillarStr) L.push(`四柱 (สี่เสาเวลาตั้งผัง): ${pillarStr}`);
  const ys = yongshenLines(qimen);
  if (ys.length) { L.push(`━━━ 用神 (จุดโฟกัสของผัง) ━━━`); L.push(...ys); }
  L.push(`━━━ ผัง 9 วัง 九宮 (ประตู門/ดาว星/เทพ神/ก้าน干/คะแนน) ━━━`);
  for (const p of palaces) L.push(palaceLine(p));
  const forms = formationLines(qimen);
  if (forms.length) { L.push(`━━━ รูปแบบพิเศษ 格局 ━━━`); L.push(...forms); }
  const timing = asArray(qimen.yingqi_evidence).concat(asArray(chart.yingqi_evidence));
  if (timing.length) {
    L.push(`━━━ หลักฐานจังหวะเกิดผล 應期 (ใช้ได้เฉพาะรายการนี้) ━━━`);
    L.push(...timing.map(textOf).filter(Boolean));
  } else {
    L.push(`━━━ หลักฐานจังหวะเกิดผล 應期 ━━━`);
    L.push(`ไม่มีหลักฐาน應期ที่ engine ส่งมา — ห้ามระบุวัน/เวลาเกิดผล ให้บอกว่ายังระบุไม่ได้`);
  }
  return L.join("\n");
}

function qimenGridSvg(qimen: Record<string, unknown>): string {
  const palaces = asArray(qimen.palaces);
  const byId = new Map(palaces.map((p) => [Number(p.palace_id), p]));
  const order = [4, 9, 2, 3, 5, 7, 8, 1, 6];
  const xml = (value: unknown) => str(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] || c));
  const cells = order.map((id, index) => {
    const p = byId.get(id) || {};
    const x = (index % 3) * 190 + 15;
    const y = Math.floor(index / 3) * 155 + 15;
    const score = Number(p.display_score ?? p.score);
    const scoreText = Number.isFinite(score) ? ` · ${score}` : "";
    const dir = DIR_TH[str(p.direction)] || str(p.direction) || "中";
    const line1 = `${id}宮 · ${dir}${scoreText}`;
    const line2 = [str(p.door_zh), str(p.star_zh), str(p.deity_zh)].filter(Boolean).join(" · ") || "—";
    const line3 = [str(p.heaven_stem_zh), str(p.earth_stem_zh)].filter(Boolean).join(" / ") || "—";
    return `<g><rect x="${x}" y="${y}" width="180" height="145" rx="4" fill="#fffefa" stroke="#a47f2d"/>` +
      `<text x="${x + 10}" y="${y + 25}" font-size="14" font-weight="700" fill="#725516">${xml(line1)}</text>` +
      `<text x="${x + 10}" y="${y + 65}" font-size="18" fill="#171b24">${xml(line2)}</text>` +
      `<text x="${x + 10}" y="${y + 102}" font-size="15" fill="#4f5664">${xml(line3)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 485" role="img" aria-label="Qi Men nine palaces"><rect width="600" height="485" fill="#fff"/>${cells}</svg>`;
}

function buildQimenSummaryPrompt(qimen: Record<string, unknown>, lang: string): string {
  const langDir = LANG_ANSWER_DIRECTIVE[lang] || "";
  const target = langName(lang);
  const factBlock = factBlockFromQimen(qimen);
  return [
    `คุณคือซินแสฉีเหมินตุ้นเจี่ย (奇門遁甲) หน้าที่: เรียบเรียง "ผังฉีเหมินจริงที่ engine คำนวณเสร็จแล้ว" ด้านล่าง ให้เป็นรายงานฉบับเต็มสำหรับ Export เป็น PDF`,
    `⚠️ ผังด้านล่างคือผลคำนวณจริงจาก engine — ห้ามเดา/แต่งประตู ดาว เทพ ก้าน คะแนน หรือ格局ใหม่ ห้ามขัดแย้งกับข้อมูลที่ให้มา ให้อธิบายเป็นภาษาคนและฟันธงจากข้อมูลนี้เท่านั้น`,
    ``,
    `━━━ ผังฉีเหมินจริง (จากระบบ) ━━━`,
    factBlock,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `เขียนรายงานเป็น Markdown ด้วยหัวข้อระดับ 2 (ขึ้นต้น "## ") ตามนี้ครบ เรียงลำดับ ห้ามข้าม ห้ามเพิ่มหัวข้ออื่น:`,
    `## คำตอบตรงต่อคำถาม`,
    `ตอบสิ่งที่ packet รองรับก่อน หาก packet ไม่มีเจตนา/คำถามเฉพาะ ให้บอกว่าเป็นการอ่านภาพรวมและยังไม่ฟันธงเรื่องเฉพาะ`,
    `## โครงสร้างผังและจุดชี้ขาด`,
    `สรุป局/遁干/ห้วง元/值符值使และองค์ประกอบที่ตัดสินผัง โดยยึดข้อมูลจริง`,
    `## ผู้ถาม–คู่กรณี–เรื่องที่ถาม · 主客用神`,
    `อธิบายเฉพาะ selector/วังเป้าหมายที่ packet ให้มา หากไม่มี主客ให้ระบุว่าข้อมูลไม่พอ ห้ามตั้งตัวแทนเอง`,
    `## ทิศและวิธีลงมือ`,
    `เลือกทิศจากวังที่ engine ส่งมา อธิบายวิธีใช้และเงื่อนไข ห้ามสร้างทิศใหม่`,
    `## จังหวะเวลาและเงื่อนไขการเกิดผล`,
    `ใช้เฉพาะหลักฐาน應期ที่ packet ระบุ หาก packet บอกว่าไม่มี ต้องเขียนว่ายังระบุวัน/เวลาเกิดผลไม่ได้ ห้ามอนุมานวันเอง`,
    `## สิ่งที่ควรหลีกเลี่ยง`,
    `สรุปวัง/สัญญาณ/格局ที่ควรระวังจาก packet เท่านั้น`,
    `## หลักฐานและข้อจำกัด`,
    `สรุปหลักฐานชี้ขาดและข้อมูลที่ยังขาด เพื่อให้ผู้ใช้นำไปใช้โดยไม่เกินขอบเขต`,
    ``,
    `กติกาการเขียน (เคร่งครัด):`,
    `- โทนซินแสที่กล้า "ฟันธง" ชัดเจน ไม่กั๊ก ไม่พูดลอย แต่สุภาพ ให้กำลังใจ (ยึดข้อมูลผังจริงเป็นหลัก)`,
    `- ⛔ ห้ามพูด 6 เรื่องต้องห้ามเด็ดขาด: วันตาย/อายุขัย · โรคร้ายแรงเจาะจง · การแท้ง–มี/ไม่มีบุตร · การหย่าร้างฟันธง · ภัยพิบัติ/อุบัติเหตุถึงชีวิต (ให้พูดเชิงดูแล/ป้องกันแทน)`,
    `- ⛔ NO_PERCENT: ห้ามใส่ตัวเลขเปอร์เซ็นต์ คะแนน หรือสถิติใด ๆ ในคำอ่าน (ใช้คำเชิงคุณภาพแทน) ยกเว้นคะแนนวัง/用神ที่ให้ไว้แล้วในข้อมูลเท่านั้น`,
    `- ใช้ย่อหน้าสั้นและ bullet (- ) ได้ ห้ามสร้างตาราง เพราะผังและตารางข้อเท็จจริงวาดโดยระบบ`,
    `- ห้ามใส่วัน เวลา คะแนน ทิศ ประตู ดาว เทพ ก้าน 格局 หรือ應期ที่ไม่มีใน packet`,
    `- ศัพท์วิชาจีนคงตัวจีนในวงเล็บครั้งแรก (奇門/用神/格局/應期 ฯลฯ) แล้วอธิบายด้วยภาษาเป้าหมาย`,
    `- เริ่มที่เนื้อหาเลย ห้ามเกริ่นว่ากำลังอ่านไฟล์/ข้อมูล/prompt`,
    langDir ? `\n${langDir}` : `\n⚠️ ภาษา: เขียนทั้งฉบับเป็น ${target}`,
  ].join("\n");
}

export const qimenHandler: PageHandler<QimenCtx> = {
  async resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<QimenCtx> | ResolveErr> {
    const inputs = rawInputs as { qimen?: unknown };
    const qimen = extractQimen(inputs.qimen);
    if (!qimen) return { error: "invalid_inputs", status: 400 };

    // dataHash ผูกกับเนื้อผังเท่านั้น (route.ts คำนวณ cache key ร่วมกับคอลัมน์ page/lang อยู่แล้ว)
    const dataHash = createHash("sha256").update(JSON.stringify({ pdfVersion: "hourkey.pdf.v2", qimen })).digest("hex");
    const cookie = await authCookie(session);
    return { dataHash, ctx: { qimen, cookie } };
  },

  async generate(ctx: QimenCtx, lang: string): Promise<GenerateResult> {
    const prompt = buildQimenSummaryPrompt(ctx.qimen, lang);
    const ai = await callSifu(ctx.cookie, prompt);
    if (!ai.ok || !ai.reply) throw new Error(ai.error || "ai_failed");
    const evidence = { version: "qimen_evidence_v2", qimen: ctx.qimen };
    assertAiSectionCount(ai.reply, 7);
    assertEvidenceBoundMeasurements(ai.reply, evidence);
    const ci = coverI18n(lang);
    const chart = asRecord(ctx.qimen.chart) || {};
    const pole = str(chart.dun_type).toLowerCase() === "yin" ? "陰" : "陽";
    const juZh = `${pole}${str(chart.ju_number) || "?"}局`;
    const cover: Record<string, unknown> = {
      kick: ci.kick,
      title: ci.title,
      who: "",
      metaHtml: juZh,
      big: "奇",
      badge: ci.badge,
      qr: false,
    };
    const palaces = asArray(ctx.qimen.palaces).sort((a, b) => Number(a.palace_id) - Number(b.palace_id));
    const palaceRows = palaces.map((p) => ({
      palace: `${str(p.palace_id)}宮`,
      direction: DIR_TH[str(p.direction)] || str(p.direction) || "中",
      door: str(p.door_zh) || "—",
      star: str(p.star_zh) || "—",
      deity: str(p.deity_zh) || "—",
      stems: [str(p.heaven_stem_zh), str(p.earth_stem_zh)].filter(Boolean).join("/") || "—",
    }));
    const document = makeAiDocument({
      prefix: "HKQM",
      evidence,
      lang,
      title: ci.title,
      headerTitle: ci.kick,
      verificationLabel: "Qi Men engine evidence · AI interpretation",
      cover: {
        kick: ci.kick,
        title: ci.title,
        who: "",
        meta: [juZh, str(chart.system_type)].filter(Boolean),
        glyph: "奇",
        badge: ci.badge,
      },
      markdown: ai.reply,
      deterministicFirstPage: [
        { type: "figure", svg: qimenGridSvg(ctx.qimen), caption: "九宮 · deterministic engine chart" },
        {
          type: "table",
          compact: true,
          columns: [
            { key: "palace", label: "宮", width: "9%" },
            { key: "direction", label: "Direction", width: "22%" },
            { key: "door", label: "門", width: "14%" },
            { key: "star", label: "星", width: "14%" },
            { key: "deity", label: "神", width: "18%" },
            { key: "stems", label: "天/地干", width: "23%" },
          ],
          rows: palaceRows,
        },
      ],
    });
    return { markdown: ai.reply, cover, figs: [], document };
  },
};
