/**
 * src/lib/export/fusion.ts · PageHandler "fusion" — สรุป PDF จากผลดูดวงรวม 5 ศาสตร์ (fusion5)
 * ⚠️ ไม่คำนวณใหม่ (ไม่เรียก panel/judge ซ้ำ · ไม่หักยาม fusion5 ซ้ำ) — ดึง fusion5_jobs ที่ "done" ล่าสุด
 *    ของ user+profileIds ตัวนี้ (client ส่ง inputs.profileIds ชุดเดียวกับที่ดูดวงรวมไปแล้ว)
 * resolveInputs: หา job ล่าสุด → ดึง judge(หลอมรวม)+resonance ผูกลง ctx
 * generate: ป้อน judge+resonance เข้า AI (1 call) ให้เรียบเรียงเป็นรายงาน PDF 5 หัวข้อ
 */
import type { Session } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { createHash } from "crypto";
import { langName } from "@/lib/palm/prompt";
import { LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { authCookie, callSifu, cleanId } from "./shared";
import type { PageHandler, ResolveOk, ResolveErr, GenerateResult } from "./types";

export type FusionCtx = {
  judgeText: string;
  resonanceSummary: string | null;
  profileNames: string[];
  cookie: string;
};

/* ── ปกหลายภาษา (9 ภาษา) ── */
const COVER_I18N: Record<string, { kick: string; title: string; badge: string }> = {
  th: { kick: "หลอมรวม 5 ศาสตร์ · AI", title: "สรุปดูดวงรวม 5 ศาสตร์", badge: "✓ สรุปโดย AI ซินแส · หลอมรวมจากผลดูดวงรวมที่บันทึกไว้" },
  en: { kick: "AI 5-science fusion report", title: "Fusion reading summary", badge: "✓ AI sifu summary · synthesized from your saved fusion reading" },
  zh: { kick: "AI 五術合盤總結", title: "合盤解讀總結", badge: "✓ AI 命理師總結 · 依已保存的合盤結果" },
  cn: { kick: "AI 五术合盘总结", title: "合盘解读总结", badge: "✓ AI 命理师总结 · 依已保存的合盘结果" },
  vi: { kick: "Báo cáo hợp nhất 5 môn bằng AI", title: "Tổng hợp luận giải Fusion", badge: "✓ AI luận giải · tổng hợp từ kết quả Fusion đã lưu" },
  ja: { kick: "AI 5術統合まとめレポート", title: "統合鑑定まとめ", badge: "✓ AI 鑑定まとめ · 保存済みの統合結果に基づく" },
  ko: { kick: "AI 5술 융합 요약 리포트", title: "융합 풀이 요약", badge: "✓ AI 명리 요약 · 저장된 융합 결과 기반" },
  ru: { kick: "AI-отчёт синтеза 5 систем", title: "Сводка Fusion-разбора", badge: "✓ Сводка AI-мастера · синтез сохранённого разбора Fusion" },
  es: { kick: "Informe de fusión de 5 ciencias con IA", title: "Resumen de lectura Fusion", badge: "✓ Resumen del maestro IA · sintetizado de tu lectura Fusion guardada" },
};
function coverI18n(lang: string) { return COVER_I18N[lang] || COVER_I18N.en; }

type Fusion5JobRow = { id: string; result: unknown; resonance: unknown; profile_ids: string[] | null };

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function buildFusionSummaryPrompt(judgeText: string, resonanceSummary: string | null, profileNames: string[], lang: string): string {
  const langDir = LANG_ANSWER_DIRECTIVE[lang] || "";
  const target = langName(lang);
  const who = profileNames.filter(Boolean).join(" · ") || "(ไม่ระบุ)";
  return [
    `คุณคือซินแสผู้เชี่ยวชาญ "หลอมรวม 5 ศาสตร์" (八字/七政四餘/紫微斗數/โหราตะวันตก/โหราพระเวท) หน้าที่: เรียบเรียง "คำพยากรณ์หลอมรวมจริง" ด้านล่าง (หลอมรวมจากหลายศาสตร์เสร็จแล้ว) ให้เป็นรายงานฉบับเต็มสำหรับ Export เป็น PDF`,
    `⚠️ เนื้อหาด้านล่างคือผลหลอมรวม (judge) + จุดตรงกันข้ามศาสตร์ (Resonance) ที่ระบบวิเคราะห์เสร็จแล้ว — ห้ามเดา/แต่งข้อมูลใหม่ ห้ามขัดแย้งกับคำพยากรณ์เดิม ให้เรียบเรียง/จัดหมวดหมู่ให้อ่านลื่นเป็นรายงานฉบับเต็มเท่านั้น`,
    ``,
    `เจ้าของดวง: ${who}`,
    `━━━ คำพยากรณ์หลอมรวม 5 ศาสตร์ (judge · จากระบบ) ━━━`,
    judgeText,
    resonanceSummary ? `━━━ Cross-Science Resonance (จุดหลายศาสตร์ตรงกัน) ━━━\n${resonanceSummary}` : "",
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `เขียนรายงานเป็น Markdown ด้วยหัวข้อระดับ 2 (ขึ้นต้น "## ") ตามนี้ครบ 5 หัวข้อ เรียงลำดับ ห้ามข้าม ห้ามเพิ่มหัวข้ออื่นนอกเหนือนี้:`,
    `## 1. ภาพรวมดวง — สรุปแก่นตัวตน/จังหวะชีวิตจากคำพยากรณ์หลอมรวมทุกศาสตร์`,
    `## 2. Resonance — จุดที่หลายศาสตร์เห็นตรงกัน (ถ้ามีข้อมูล Resonance ด้านบน) ว่าหนักแน่นเรื่องอะไร`,
    `## 3. งาน · เงิน · ความรัก — ฟันธงแนวทางจากคำพยากรณ์หลอมรวม`,
    `## 4. จังหวะเวลา (Timeline) — ช่วงเวลา/ปีสำคัญที่คำพยากรณ์ชี้ไว้`,
    `## 5. คำแนะนำ — ข้อแนะนำที่ทำได้จริง 3–5 ข้อ ตามคำพยากรณ์หลอมรวม`,
    ``,
    `กติกาการเขียน (เคร่งครัด):`,
    `- โทนซินแสที่กล้า "ฟันธง" ชัดเจน ไม่กั๊ก ไม่พูดลอย แต่สุภาพ ให้กำลังใจ (ยึดคำพยากรณ์เดิมเป็นหลัก เรียบเรียงให้ลื่นและเป็นระบบขึ้น)`,
    `- ⛔ ห้ามพูด 6 เรื่องต้องห้ามเด็ดขาด: วันตาย/อายุขัย · โรคร้ายแรงเจาะจง · การแท้ง–มี/ไม่มีบุตร · การหย่าร้างฟันธง · ภัยพิบัติ/อุบัติเหตุถึงชีวิต (ให้พูดเชิงดูแล/ป้องกันแทน)`,
    `- ⛔ NO_PERCENT: ห้ามใส่ตัวเลขเปอร์เซ็นต์ คะแนน หรือสถิติใด ๆ ในคำอ่าน (ใช้คำเชิงคุณภาพแทน)`,
    `- ถ้าไม่มีข้อมูล Resonance ด้านบน ให้เขียนหัวข้อ 2 สั้น ๆ ว่ายังไม่มีจุดหลายศาสตร์ที่เทียบได้ในรอบนี้ ห้ามแต่งจุดตรงกันขึ้นเอง`,
    `- ใช้ bullet (- ) และ **ตัวหนา** ได้ ให้อ่านง่าย · แต่ละหัวข้อ 2–5 ย่อหน้าสั้น`,
    `- เริ่มที่เนื้อหาเลย ห้ามเกริ่นว่ากำลังอ่านไฟล์/ข้อมูล/prompt`,
    langDir ? `\n${langDir}` : `\n⚠️ ภาษา: เขียนทั้งฉบับเป็น ${target}`,
  ].filter(Boolean).join("\n");
}

export const fusionHandler: PageHandler<FusionCtx> = {
  async resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<FusionCtx> | ResolveErr> {
    const userId = session.userId;
    const inputsRaw = rawInputs as { profileIds?: unknown };
    const profileIds = (Array.isArray(inputsRaw.profileIds) ? inputsRaw.profileIds : [inputsRaw.profileIds])
      .map(cleanId).filter((x): x is string => !!x).slice(0, 4);
    if (!profileIds.length) return { error: "invalid_inputs", status: 400 };

    // หา fusion5_jobs done ล่าสุดของ user นี้ที่ตรงชุด profileIds (ตาม convention เดียวกับ GET ?latest=1 ใน fusion5 route)
    const where = ["user_id=$1", "status='done'"];
    const params: unknown[] = [userId];
    if (profileIds.length >= 2) { params.push(profileIds); where.push(`profile_ids=$${params.length}::text[]`); }
    else { params.push(profileIds); where.push(`profile_ids @> $${params.length}::text[]`); }

    const row = await q1<Fusion5JobRow>(
      `SELECT id, result, resonance, profile_ids FROM fusion5_jobs WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 1`,
      params
    );
    if (!row) return { error: "fusion_job_not_found", status: 404 };

    const result = asRecord(row.result) || {};
    const judgeText = typeof result.reply === "string" ? result.reply.trim() : "";
    if (!judgeText) return { error: "fusion_no_reply", status: 409 };

    const fusion5 = asRecord(result.fusion5) || {};
    const profileNames = Array.isArray(fusion5.profileNames) ? (fusion5.profileNames as unknown[]).map(String) : [];
    const resonance = asRecord(row.resonance);
    const resonanceSummary = resonance && typeof resonance.summaryTh === "string" && resonance.summaryTh.trim() ? resonance.summaryTh.trim() : null;

    // dataHash ผูกกับ job ที่ดึงมา (job เดิม = cache เดิม · มี fusion5 job ใหม่กว่า = data_hash เปลี่ยน = export ใหม่)
    const dataHash = createHash("sha256").update(row.id).digest("hex");
    const cookie = await authCookie(session);
    return { dataHash, ctx: { judgeText, resonanceSummary, profileNames, cookie } };
  },

  async generate(ctx: FusionCtx, lang: string): Promise<GenerateResult> {
    const prompt = buildFusionSummaryPrompt(ctx.judgeText, ctx.resonanceSummary, ctx.profileNames, lang);
    const ai = await callSifu(ctx.cookie, prompt);
    if (!ai.ok || !ai.reply) throw new Error(ai.error || "ai_failed");
    const ci = coverI18n(lang);
    const who = ctx.profileNames.filter(Boolean).join(" · ");
    const cover: Record<string, unknown> = {
      kick: ci.kick,
      title: ci.title,
      who,
      metaHtml: "",
      big: "☯",
      badge: ci.badge,
      qrLabel: "hourkey.io",
    };
    return { markdown: ai.reply, cover, figs: [] };
  },
};
