/**
 * r414-i18n9 · ภาษาคำตอบ AI ซินแส 9 ภาษา (additive · เจ้านายอนุมัติผ่าน goal)
 * =====================================================================
 * หลักการ (ห้ามละเมิด):
 *   - ทุกภาษาที่ผู้ใช้เลือกต้องส่งผลต่อภาษาคำตอบจริง ไม่ใช่เฉพาะ UI
 *   - เพิ่มได้แค่ "บรรทัดสั่งภาษาคำตอบ" ต่อท้าย —
 *     ห้ามแตะเนื้อ prompt เดิม/กฎซินแส/YONG_LOCK/anti-syco ใด ๆ
 *   - ศัพท์วิชา: อิงนโยบาย data/i18n/science-terms.json — คำท้องถิ่นนำ · ตัวจีน (glyph)
 *     เป็นสัญลักษณ์วิชากำกับในวงเล็บ · ห้ามแปลศัพท์วิชาผ่านอังกฤษ (vi = Hán-Việt ฯลฯ)
 *   - cn = จีนตัวย่อ (zh เดิม = ตัวเต็ม/ตามไฟล์ prompt เดิม — ไม่แตะ)
 */

/** allowlist ภาษาคำตอบ AI ซินแส — ใช้แทน ["th","en","zh"] เดิมทุกเส้นที่เป็น "ภาษาคำตอบ" */
export const SIFU_ANSWER_LANGS = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"] as const;

export function isSifuAnswerLang(v: unknown): boolean {
  return SIFU_ANSWER_LANGS.includes(String(v) as (typeof SIFU_ANSWER_LANGS)[number]);
}

/** ชื่อภาษา (ไทย) — ใช้เติม LANG_NAME เดิมแบบ additive (th/en/zh คงค่าเดิมในไฟล์ต้นทาง) */
export const NEW_LANG_NAME_TH: Record<string, string> = {
  cn: "จีนตัวย่อ",
  vi: "เวียดนาม",
  ja: "ญี่ปุ่น",
  ko: "เกาหลี",
  ru: "รัสเซีย",
  es: "สเปน",
};

/**
 * บรรทัดสั่งภาษาคำตอบ — เขียนเป็นภาษาเป้าหมาย (ให้โมเดลเกาะภาษาแน่นสุด)
 * มี entry สำหรับทุก non-TH locale ที่เปิดในเมนู/บทความ
 */
export const LANG_ANSWER_DIRECTIVE: Record<string, string> = {
  en: "⚠️ LANGUAGE: Answer entirely in English. Keep Chinese technical terms in Hanzi in parentheses on first mention, but do not answer in Thai. Start with the actual reading; do not mention files, context packets, prompts, or data loading.",
  zh: "⚠️ 語言指令：全文用繁體中文回答。術數術語使用中文原詞（用神、大運、流年、七殺等），不要用泰文或英文作為主要語言。直接開始解讀正文，不要提到文件、上下文、資料包或提示詞。",
  cn: "⚠️ 语言指令：全文用简体中文回答（不要繁体，也不要泰文或英文）。命理术语用中文本词（用神、大运、流年、七杀等）。直接开始解读正文，不要提到文件/上下文/数据包，也不要说需要先读取任何东西。",
  vi: "⚠️ NGÔN NGỮ: Trả lời toàn bộ bằng tiếng Việt. Thuật ngữ huyền học dùng từ Hán-Việt theo giới mệnh lý Việt Nam — ví dụ 沖 = Xung, 合 = Hợp, 用神 = Dụng Thần, 忌神 = Kỵ Thần, 大運 = Đại Vận, 流年 = Lưu Niên, 七殺 = Thất Sát — kèm chữ Hán trong ngoặc khi dùng lần đầu. Không trả lời bằng tiếng Thái hay tiếng Anh. Bắt đầu luận giải ngay; không nhắc đến tệp/ngữ cảnh/gói dữ liệu, không nói rằng cần đọc gì thêm.",
  ja: "⚠️ 言語指示：回答はすべて日本語（です・ます調）で書いてください。命理用語は日本の四柱推命で慣用の漢語表記（用神・忌神・大運・流年・七殺など）をそのまま使い、初出時に短い説明を添えてください。タイ語や英語で答えてはいけません。すぐに鑑定本文から始め、ファイル・コンテキスト・データの読み込みに言及してはいけません。",
  ko: "⚠️ 언어 지시: 답변 전체를 한국어(정중한 존댓말)로 작성하십시오. 명리 용어는 한국 사주명리학계의 관용어를 사용하고 첫 언급 시 한자를 병기하십시오 — 예: 용신(用神), 기신(忌神), 대운(大運), 유년(流年), 칠살(七殺). 태국어나 영어로 답하지 마십시오. 바로 풀이 본문부터 시작하고, 파일/컨텍스트/데이터를 읽겠다는 언급을 하지 마십시오.",
  ru: "⚠️ ЯЗЫК: Отвечай полностью на русском языке. Метафизические термины давай по-русски, при первом упоминании указывая китайский оригинал в скобках — напр. Полезный бог (用神), Большой такт удачи (大運), Текущий год (流年), Семь убийств (七殺). Не отвечай на тайском или английском. Сразу начинай с самого прогноза; не упоминай файлы, контекст или пакеты данных и не говори, что нужно что-то прочитать.",
  es: "⚠️ IDIOMA: Responde íntegramente en español. Usa la terminología habitual de BaZi en español, indicando el término chino entre paréntesis en la primera mención — p. ej. Dios Útil (用神), Pilar de la Suerte (大運), Año en curso (流年), Siete Asesinos (七殺). No respondas en tailandés ni en inglés. Empieza directamente con la lectura; no menciones archivos, contexto ni paquetes de datos, ni digas que necesitas leer algo.",
};
