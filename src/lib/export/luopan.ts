import { createHash } from "crypto";
import type { Session } from "@/lib/auth";
import { LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { langName } from "@/lib/palm/prompt";
import { authCookie, callSifu } from "./shared";
import { assertAiSectionCount, assertEvidenceBoundMeasurements, makeAiDocument } from "./pdf-v2";
import type { GenerateResult, PageHandler, ResolveErr, ResolveOk } from "./types";

type JsonRecord = Record<string, unknown>;
type LuopanCtx = { evidence: JsonRecord; cookie: string };

const COVER_I18N: Record<string, { kick: string; title: string; badge: string }> = {
  th: { kick: "รายงานหล่อแกเชิงลึก · AI 羅盤", title: "วิเคราะห์บ้านและทิศทาง", badge: "AI ซินแสเรียบเรียงจากข้อมูลหล่อแกและ Engine จริง" },
  en: { kick: "AI Luopan report 羅盤", title: "House and direction analysis", badge: "AI sifu interpretation from verified Luopan engine evidence" },
  zh: { kick: "AI 羅盤深度報告", title: "宅向與方位分析", badge: "AI 命理師依羅盤引擎實證資料整理" },
  cn: { kick: "AI 罗盘深度报告", title: "宅向与方位分析", badge: "AI 命理师依罗盘引擎实证资料整理" },
  vi: { kick: "Báo cáo La Bàn AI 羅盤", title: "Phân tích nhà và phương hướng", badge: "AI diễn giải từ dữ liệu La Bàn đã tính" },
  ja: { kick: "AI 羅盤詳細レポート", title: "宅向・方位分析", badge: "羅盤エンジンの計算根拠に基づくAI鑑定" },
  ko: { kick: "AI 나경 심층 리포트 羅盤", title: "주택과 방향 분석", badge: "나경 엔진 근거에 기반한 AI 해석" },
  ru: { kick: "Подробный AI-отчёт Лопань 羅盤", title: "Анализ дома и направлений", badge: "Интерпретация AI по расчётам движка Лопань" },
  es: { kick: "Informe profundo de Luopan con IA 羅盤", title: "Análisis de vivienda y direcciones", badge: "Interpretación de IA basada en evidencia del motor Luopan" },
};

function rec(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}
function arr(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((v): v is JsonRecord => !!rec(v)) : [];
}
function str(value: unknown): string { return value == null ? "" : String(value); }

function validateEvidence(value: unknown): JsonRecord | null {
  const evidence = rec(value);
  if (!evidence || evidence.version !== "luopan_evidence_v2") return null;
  if (!rec(evidence.house) || !rec(evidence.focus) || !rec(evidence.summary) || !rec(evidence.completeness)) return null;
  const serialized = JSON.stringify(evidence);
  if (serialized.length > 180_000) return null;
  return evidence;
}

function evidenceText(evidence: JsonRecord): string {
  const house = rec(evidence.house) || {};
  const focus = rec(evidence.focus) || {};
  const summary = rec(evidence.summary) || {};
  const completeness = rec(evidence.completeness) || {};
  const pins = arr(evidence.pins);
  const lines = [
    `บ้าน: ${str(house.name) || "—"}`,
    `坐向: facing=${str(house.facingDegree)}° ${str(house.facingMountain)} · sitting=${str(house.sittingDegree)}° ${str(house.sittingMountain)} · period=${str(house.period)} · built=${str(house.year)}`,
    `เจ้าของ/ผู้อยู่: ${str(house.ownerName) || "ยังไม่ระบุ"} · timing=${str(house.timing)} · qimen_school=${str(house.qimenSchool)}`,
    `องศาที่กำลังอ่าน: ${str(focus.degree)}° · ${str(focus.mountain)} · ${str(focus.direction)} · engine_score=${str(focus.score) || "—"}`,
    `หลักฐานองศา: ${Array.isArray(focus.evidence) ? focus.evidence.map(str).join(" · ") : "—"}`,
    `ทิศเด่น: ${arr(summary.topGood).map((x) => `${str(x.degree)}° ${str(x.mountain)} score=${str(x.score)}`).join(" · ") || "—"}`,
    `ทิศควรระวัง: ${arr(summary.topBad).map((x) => `${str(x.degree)}° ${str(x.mountain)} score=${str(x.score)}`).join(" · ") || "—"}`,
    `用喜忌: ${str(summary.profileElements) || "ยังไม่มีข้อมูล"}`,
    `Pins: ${pins.map((p) => `${str(p.type)}@${str(p.degree)}° ${str(p.mountain)} score=${str(p.score) || "—"}`).join(" · ") || "ไม่มี"}`,
    `ความครบถ้วน: house_locked=${str(completeness.houseLocked)} · plan=${str(completeness.hasPlan)} · profile=${str(completeness.hasProfile)} · pins=${str(completeness.pinCount)} · water_pins=${str(completeness.waterPinCount)} · water_complete=${str(completeness.waterComplete)}`,
    `SCIENCE EVIDENCE:\n${str(evidence.sciences).slice(0, 80_000)}`,
  ];
  return lines.join("\n");
}

function promptFor(evidence: JsonRecord, lang: string): string {
  const directive = LANG_ANSWER_DIRECTIVE[lang] || `เขียนทั้งฉบับเป็น ${langName(lang)}`;
  return [
    `คุณคือซินแสฮวงจุ้ยผู้เชี่ยวชาญหล่อแก (羅盤) เรียบเรียงรายงานจาก EvidencePacket ที่ engine คำนวณแล้วเท่านั้น`,
    `ห้ามสร้างองศา ทิศ ดาว ผัง 格局 水法 pin คะแนน วิธีแก้ หรือข้อเท็จจริงที่ไม่มีใน packet`,
    `หาก house_locked=false, ไม่มีแปลน, ไม่มี profile หรือข้อมูลน้ำไม่ครบ ต้องระบุข้อจำกัดและห้ามฟันธงส่วนนั้น`,
    `\n━━━ LUOPAN EVIDENCE PACKET ━━━\n${evidenceText(evidence)}\n━━━━━━━━━━━━━━━━━━━━━`,
    `เขียน Markdown ด้วยหัวข้อระดับ 2 ตามนี้ครบและห้ามเพิ่มหัวข้อ:`,
    `## คำวินิจฉัยบ้านโดยรวม`,
    `สรุปภาพรวม坐向 ยุคบ้าน องศาที่อ่าน จุดเด่นและจุดเสี่ยงจากหลักฐานจริง`,
    `## คนและสุขภาพ · 山星`,
    `อธิบายเฉพาะ山星/วัง/ทิศที่ packet ให้มา หากไม่มีหลักฐานให้บอกว่ายังสรุปไม่ได้`,
    `## ทรัพย์และการเคลื่อนไหว · 向星`,
    `อธิบายเฉพาะ向星 ประตู การเคลื่อนไหว และน้ำที่มีข้อมูลจริง`,
    `## ประตู เตียง เตา โต๊ะ และจุดน้ำ`,
    `อ่านทีละ pin ที่มีอยู่จริง ห้ามเสนอให้ย้ายสิ่งที่ไม่ได้ปักหรือไม่มีในแปลน`,
    `## จุดเสี่ยงที่ต้องจัดการก่อน`,
    `เรียงคำเตือนตามหลักฐาน engine โดยไม่ขยายเป็นเหตุร้ายรุนแรง`,
    `## แผนปรับบ้านตามลำดับความสำคัญ`,
    `ให้คำแนะนำที่ทำได้จริงและผูกกับ pin/ทิศที่มีอยู่ ห้ามสร้างสูตรแก้เคล็ด`,
    `## ข้อมูลที่ยังขาดและยังไม่ควรฟันธง`,
    `ระบุช่องว่างข้อมูลและสิ่งที่ต้องวัดหรือปักเพิ่ม`,
    `กติกา: ใช้ย่อหน้าสั้นและ bullet ได้ ห้ามสร้างตาราง ห้ามใช้เปอร์เซ็นต์หรือสถิติแต่งขึ้น และห้ามเกริ่นถึง prompt`,
    directive,
  ].join("\n");
}

function compassSvg(evidence: JsonRecord): string {
  const house = rec(evidence.house) || {};
  const summary = rec(evidence.summary) || {};
  const facing = Number(house.facingDegree) || 0;
  const good = arr(summary.topGood).slice(0, 5);
  const bad = arr(summary.topBad).slice(0, 5);
  const points: Array<{ degree: unknown; color: string }> = [
    ...good.map((x) => ({ degree: x.degree, color: "#1f6b4f" })),
    ...bad.map((x) => ({ degree: x.degree, color: "#9f3434" })),
  ];
  const dots = points.map((x) => {
    const degree = Number(x.degree) || 0;
    const rad = (degree - 90) * Math.PI / 180;
    const cx = 210 + Math.cos(rad) * 150;
    const cy = 210 + Math.sin(rad) * 150;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="${x.color}"/>`;
  }).join("");
  const fr = (facing - 90) * Math.PI / 180;
  const fx = 210 + Math.cos(fr) * 165;
  const fy = 210 + Math.sin(fr) * 165;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 420" role="img" aria-label="Luopan direction summary"><rect width="420" height="420" fill="#fff"/><circle cx="210" cy="210" r="185" fill="#fffefa" stroke="#a47f2d" stroke-width="3"/><circle cx="210" cy="210" r="130" fill="none" stroke="#d8d1c1"/><line x1="210" y1="210" x2="${fx.toFixed(1)}" y2="${fy.toFixed(1)}" stroke="#a47f2d" stroke-width="5"/><circle cx="210" cy="210" r="8" fill="#725516"/>${dots}<text x="210" y="28" text-anchor="middle" font-size="18" fill="#171b24">北 N</text><text x="210" y="407" text-anchor="middle" font-size="18" fill="#171b24">南 S</text><text x="15" y="216" font-size="18" fill="#171b24">西 W</text><text x="365" y="216" font-size="18" fill="#171b24">東 E</text></svg>`;
}

export const luopanHandler: PageHandler<LuopanCtx> = {
  async resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<LuopanCtx> | ResolveErr> {
    const evidence = validateEvidence(rawInputs.luopan);
    if (!evidence) return { error: "invalid_inputs", status: 400 };
    const cookie = await authCookie(session);
    const dataHash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    return { dataHash, ctx: { evidence, cookie } };
  },

  async generate(ctx: LuopanCtx, lang: string): Promise<GenerateResult> {
    const ai = await callSifu(ctx.cookie, promptFor(ctx.evidence, lang));
    if (!ai.ok || !ai.reply) throw new Error(ai.error || "ai_failed");
    assertAiSectionCount(ai.reply, 7);
    assertEvidenceBoundMeasurements(ai.reply, ctx.evidence);
    const ci = COVER_I18N[lang] || COVER_I18N.en;
    const house = rec(ctx.evidence.house) || {};
    const summary = rec(ctx.evidence.summary) || {};
    const topRows = [
      ...arr(summary.topGood).slice(0, 5).map((x) => ({ type: "Recommended", degree: `${str(x.degree)}°`, mountain: str(x.mountain), score: str(x.score) })),
      ...arr(summary.topBad).slice(0, 5).map((x) => ({ type: "Caution", degree: `${str(x.degree)}°`, mountain: str(x.mountain), score: str(x.score) })),
    ];
    const document = makeAiDocument({
      prefix: "HKLP",
      evidence: ctx.evidence,
      lang,
      title: ci.title,
      headerTitle: ci.kick,
      verificationLabel: "Luopan engine evidence · AI interpretation",
      cover: {
        kick: ci.kick,
        title: ci.title,
        who: str(house.name),
        meta: [`${str(house.facingDegree)}° ${str(house.facingMountain)}`, `Period ${str(house.period)}`, str(house.ownerName)].filter(Boolean),
        glyph: "羅",
        badge: ci.badge,
      },
      markdown: ai.reply,
      deterministicFirstPage: [
        { type: "figure", svg: compassSvg(ctx.evidence), caption: "Facing and engine-ranked directions" },
        {
          type: "facts", columns: 2, items: [
            { label: "House", value: str(house.name) || "—" },
            { label: "Facing / sitting", value: `${str(house.facingDegree)}° / ${str(house.sittingDegree)}°` },
            { label: "Period", value: str(house.period) || "—" },
            { label: "Owner", value: str(house.ownerName) || "—" },
          ],
        },
        {
          type: "table", compact: true,
          columns: [
            { key: "type", label: "Engine status", width: "24%" },
            { key: "degree", label: "Degree", width: "18%" },
            { key: "mountain", label: "24山", width: "34%" },
            { key: "score", label: "Score", width: "24%" },
          ],
          rows: topRows,
        },
      ],
    });
    const cover = { kick: ci.kick, title: ci.title, who: str(house.name), big: "羅", badge: ci.badge, qr: false };
    return { markdown: ai.reply, cover, figs: [], document };
  },
};
