/* HK_SIFU_EVIDENCE_TRACE_V1 — soft trace ว่าคำตอบดูดวง "เดินครบ" ขั้นสำคัญของอาเจ๊กฮ้งไหม
 * วัตถุประสงค์: วัดผล (log-only · ไม่ retry ไม่ตัด stream) ว่า P1(กฎ4.2)+P2(confidence note)
 *   ทำให้ AI อ้าง用神/忌神 + ปฏิกิริยา/ราก ในคำตอบดูดวงจริงไหม
 * ไม่ block คำตอบ · ไม่แตะ streaming logic · ผลเก็บใน responseMeta.evidence_trace เพื่อ audit
 *
 * ⚠️ ไม่ใช่ตัวบังคับ — แค่ตัววัด · การบังคับให้เดิน用神อยู่ที่ prompt (sifu-qa.md กฎ 2,4.2)
 */

export type SifuEvidenceTrace = {
  /** คำถามนี้เป็นการ "ดูดวง" (มี packet/expectedDM) ไม่ใช่คำถามเชิงระบบ */
  isReadingQuestion: boolean;
  hasYongshen: boolean;     // อ้าง 用神/忌神/ธาตุช่วย/ธาตุระวัง
  hasInteraction: boolean;  // อ้างปฏิกิริยา 合/冲/刑/害/破/三合/三會/拱/暗合
  hasRoot: boolean;         // อ้างราก/透干/通根/月令/當令
  /** ผ่านเกณฑ์ soft (คำถามดูดวงควรมี用神 + อย่างน้อยปฏิกิริยาหรือราก) */
  ok: boolean;
  missing: string[];
};

/* คำถามเชิงระบบ (ไม่ใช่ดูดวง) — ไม่บังคับเดิน用神 */
const SYSTEM_Q_RE = /กี่เล่ม|กี่คัมภีร์|มีคัมภีร์|ระบบ|prompt|packet|แพ็กเก็ต|engine|โค้ด|ส่งมาให้นาย|อาเจ๊กฮ้ง.{0,12}(ส่ง|มี|ใช้)|วิธีใช้|เป็นไงบ้างระบบ|debug|admin/i;

const YONGSHEN_RE = /用神|忌神|喜神|ธาตุช่วย|ธาตุระวัง|ธาตุใช้เสริม|ตัวช่วย(ดวง|หลัก)|用神/;
const INTERACTION_RE = /合|冲|沖|刑|害|破|三合|三會|半合|拱|暗合|ชน|ผสาน|ปฏิกิริยา/;
const ROOT_RE = /透干|通根|當令|月令|ราก(ธาตุ|แข็ง|บาง|ไร้)|มีราก|ไร้ราก|ก้านซ่อน|藏干/;

/**
 * @param reply คำตอบเต็มของ AI (หลังตัด ID line หรือก่อนก็ได้ · regex ทนทั้งคู่)
 * @param message คำถามของผู้ใช้
 * @param hasPacket มี chart packet/expectedDM (= คำถามผูกกับดวงจริง)
 */
export function checkSifuEvidenceTrace(
  reply: string,
  message: string,
  hasPacket: boolean,
): SifuEvidenceTrace {
  const isSystemQ = SYSTEM_Q_RE.test(message || "");
  // ดูดวงจริง = มี packet + ไม่ใช่คำถามระบบ + คำตอบยาวพอ (กันคำตอบสั้น/ทักทาย)
  const isReadingQuestion = hasPacket && !isSystemQ && (reply || "").length >= 200;

  const hasYongshen = YONGSHEN_RE.test(reply || "");
  const hasInteraction = INTERACTION_RE.test(reply || "");
  const hasRoot = ROOT_RE.test(reply || "");

  const missing: string[] = [];
  if (!hasYongshen) missing.push("用神/忌神");
  if (!hasInteraction && !hasRoot) missing.push("ปฏิกิริยา-หรือ-ราก");

  // เกณฑ์ soft: คำถามดูดวงควรมี用神 + (ปฏิกิริยา หรือ ราก) อย่างน้อยอย่างละ
  const ok = !isReadingQuestion || (hasYongshen && (hasInteraction || hasRoot));

  return { isReadingQuestion, hasYongshen, hasInteraction, hasRoot, ok, missing };
}
