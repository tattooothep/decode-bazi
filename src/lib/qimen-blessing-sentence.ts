/**
 * ประกอบ "คำอวยพรจากองค์เทพ" ให้เป็นประโยคที่ท่านพูดกับผู้ใช้
 *
 * ── ทำไมต้องมีไฟล์นี้ (30 ก.ค. 69) ──────────────────────────
 * เจ้าของแจ้ง "เสียงอวยพรเป็นคำแนะนำ ไม่ใช่ประโยคอวยพร"
 * ตรวจแล้วจริง — แอพหยิบ `directionalAction.text` จากผังมาอ่านดิบๆ
 * ซึ่งเป็น **คำแนะนำว่าควรทำอะไรทางทิศนี้** เช่น "เหมาะแก่การเจรจา"
 * ฟังแล้วเหมือนคู่มือ ไม่เหมือนองค์เทพประทานพร
 *
 * ── ทำไมประกอบที่เซิร์ฟเวอร์ ไม่ให้แอพแต่ง ──────────────────
 * 🔴 กฎเดิมของระบบ: "คำอวยพรต้องมาจากผังจริง ห้ามแอพแต่งเอง"
 * (src/qimen/arBlessing.ts ฝั่งแอพ) — กฎนี้ถูกและต้องรักษาไว้
 * เพราะผู้ใช้กลุ่มนี้เชื่อจริงและทำตามจริง
 *
 * ไฟล์นี้จึงแยกสองส่วนให้ชัด
 *   · **เนื้อความ** = มาจากผังทั้งหมด (ชื่อองค์ · ทิศ · คำจากเครื่องยนต์)
 *     ไม่มีคำทำนายหรือคำวินิจฉัยใดที่เราแต่งขึ้นเองเลยสักคำ
 *   · **โครงประโยค** = ถ้อยคำพิธี ที่ทำให้ของจากผังฟังเป็นคำจากองค์ท่าน
 *     เทียบได้กับการที่พระอ่านคาถา — คาถาไม่เปลี่ยน สิ่งที่เปลี่ยนคือเนื้อใน
 *
 * ── ห้ามข้ามขั้น ────────────────────────────────────────────
 * ไม่มีคำจากผัง = **ไม่คืนประโยค** ไม่ใช่แต่งพรลอยๆ ให้
 * เพราะพรที่ไม่มีที่มาคือการหลอกผู้ใช้
 */

export type BlessingLocale = "th" | "en" | "zh";

/**
 * ประกอบประโยคให้ครบทั้งสามภาษาจากข้อมูลกังหนึ่งช่อง
 *
 * 🔴 บทเรียน 31 ก.ค. — เจ้าของเจอเองว่า "เสียงยาวไม่ทุกทิศ"
 * ของเดิมประกอบประโยคเฉพาะตอนกดฟังเสียง และใช้คำภาษาไทยชุดเดียว
 * ยัดเข้าโครงอังกฤษกับจีนด้วย ผลคือประโยคอังกฤษมีชื่อทิศไทยโผล่กลางประโยค
 *
 * ตัวนี้รับคำที่ **แยกภาษามาแล้ว** ถ้าภาษาไหนขาดชิ้นส่วน จะไม่คืนประโยคภาษานั้น
 * ดีกว่าคืนประโยคที่มีภาษาอื่นปน
 */
export function buildBlessingSentences(
  parts: Readonly<Record<BlessingLocale, BlessingParts | null>>,
): Readonly<Partial<Record<BlessingLocale, string>>> {
  const out: Partial<Record<BlessingLocale, string>> = {};
  for (const locale of ["th", "en", "zh"] as const) {
    const p = parts[locale];
    if (p === null || p === undefined) continue;
    const sentence = buildBlessingSentence(p, locale);
    if (sentence.length > 0) out[locale] = sentence;
  }
  return Object.freeze(out);
}

export type BlessingParts = Readonly<{
  /** ชื่อองค์เทพประจำกังนั้น — มาจากผัง */
  deity: string;
  /** ชื่อทิศ — มาจากผัง */
  direction: string;
  /** คำจากเครื่องยนต์ฉีเหมินสำหรับทิศนี้ในยามนี้ */
  words: string;
}>;

/**
 * โครงประโยคพิธีต่อภาษา
 *
 * เจ้าของสั่ง 30 ก.ค. "เจนคำอวยพรให้มันยาวกว่านี้หน่อย"
 * จึงขยายจากสามประโยคเป็นเจ็ดท่อน ราว 25-30 วินาทีเมื่ออ่านออกเสียง
 * ยาวพอให้รู้สึกเป็นคำจากองค์ท่านจริง ไม่ใช่ประกาศสั้นๆ
 * แต่ยังไม่ยาวจนผู้ใช้เลื่อนมือถือลงก่อนจบ
 *
 * 🔴 จีนใช้ถ้อยคำจีนล้วน ห้ามปนไทย (กฎ 3 ภาษาเข้มของโปรเจกต์)
 */
const FRAMES: Readonly<Record<BlessingLocale, (p: BlessingParts) => string>> =
  Object.freeze({
    th: (p) =>
      `ข้าคือ${p.deity} ผู้สถิต ณ ทิศ${p.direction} `
      + `ยามนี้ประตูแห่งทิศนี้เปิดออกแล้ว ผู้ใดมาถึงย่อมได้รับ `
      + `${p.words} `
      + `จงตั้งใจให้มั่น อย่าลังเลในสิ่งที่ตั้งใจไว้ `
      + `สิ่งที่เจ้าเริ่มในยามนี้ ณ ทิศนี้ ย่อมมีแรงหนุนส่ง `
      + `ขอพรจงคุ้มครองเจ้า ให้กิจที่หมายสำเร็จดังตั้งใจ `
      + `ให้ทางข้างหน้าโปร่ง ให้ผู้คนที่พบเจอเป็นคุณแก่เจ้า เทอญ`,
    en: (p) =>
      `I am ${p.deity}, who presides over the ${p.direction}. `
      + `In this hour the gate of this direction stands open, and whoever comes receives it. `
      + `${p.words} `
      + `Hold your intention steady, and do not waver in what you have set out to do. `
      + `What you begin in this hour, facing this way, carries force behind it. `
      + `May this blessing keep you and bring your purpose to completion. `
      + `May the road ahead be clear, and may those you meet be of good to you.`,
    zh: (p) =>
      `吾乃${p.deity}，鎮守${p.direction}。`
      + `此時此方之門已開，來者皆得其應。`
      + `${p.words}`
      + `當堅其志，勿疑所行。`
      + `此時向此方而起之事，自有氣機相助。`
      + `願此福佑護持於汝，所求皆成，前路通達，所遇皆吉。`,
  });

/** ตัดช่องว่างซ้ำและจุดจบซ้ำ ให้เสียงอ่านไม่สะดุด */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").replace(/ ([。，、])/g, "$1").trim();
}

/**
 * ประกอบประโยคคำอวยพร
 *
 * คืนสตริงว่างเมื่อไม่มีคำจากผัง — ตัวเรียกต้องไม่อ่านอะไรเลยในกรณีนั้น
 */
export function buildBlessingSentence(
  parts: BlessingParts,
  locale: BlessingLocale,
): string {
  const words = parts.words.trim();
  // 🔴 ไม่มีคำจากผัง = ไม่มีพร ห้ามแต่งขึ้นเอง
  if (words === "") return "";

  const deity = parts.deity.trim();
  const direction = parts.direction.trim();
  // ขาดชื่อองค์หรือทิศ = อ่านเฉพาะคำจากผัง ดีกว่าพูดชื่อผิดองค์
  if (deity === "" || direction === "") return tidy(words);

  const frame = FRAMES[locale] ?? FRAMES.th;
  return tidy(frame({ deity, direction, words }));
}
