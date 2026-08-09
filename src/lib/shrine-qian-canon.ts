import { readFileSync } from "fs";
import path from "path";

/**
 * คัมภีร์เซียมซี 六十甲子籤 60 ใบ — ตัวอ่านฝั่งเครื่องแม่ข่าย
 * ต้นฉบับ: /root/canon-inbox-shrine-qian/ (ดู SOURCES.md)
 * แฟ้มที่ใช้จริง: data/shrine/qian-60.json (ถอดมาจากคัมภีร์ที่แปลไทยไว้แล้ว)
 *
 * 🔴 ข้อห้ามตามคัมภีร์ (ยกมาจากต้นทาง ห้ามละเมิด):
 *  1. ต้นฉบับไม่มีป้ายระดับดี-ร้าย (大吉/中吉/下下) สักใบ — ห้ามคิดระดับขึ้นเอง
 *     ห้ามทำตราหรือแถบสีจัดอันดับใบเซียมซี
 *  2. ช่อง 凡事 คือ "เนื้อคำแก้" ไม่ใช่ป้ายระดับของทั้งใบ
 *  3. ห้ามเติมคำทำนายที่ต้นฉบับไม่ได้พูด และห้ามตัดสิ่งที่ต้นฉบับพูดไว้
 *  4. ต้องส่งตัวจีนคู่คำแปลเสมอ ผู้ใช้ต้องเห็นต้นฉบับได้
 */

export interface QianText {
  zh: string;
  th?: string;
  en?: string;
}

export interface QianCard {
  no: number;
  ganzhi: string;
  trigram: string;
  elementDirection: QianText;
  poem: QianText[];
  fanshi: QianText;
  storyTitles: QianText[];
  interpretation: Record<string, QianText>;
}

interface CanonFile {
  source: string;
  count: number;
  cards: QianCard[];
}

export const QIAN_CANON_VERSION = "60jiazi-v1";
export const QIAN_SLIP_COUNT = 60;

let cache: CanonFile | null = null;

function loadCanon(): CanonFile {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "shrine", "qian-60.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as CanonFile;
  if (!Array.isArray(parsed.cards) || parsed.cards.length !== QIAN_SLIP_COUNT) {
    throw new Error("qian_canon_incomplete");
  }
  cache = parsed;
  return parsed;
}

export function qianCard(slipNo: number): QianCard {
  const canon = loadCanon();
  const card = canon.cards.find((entry) => entry.no === slipNo);
  if (!card) throw new Error("qian_slip_not_found");
  return card;
}

export function qianCanonSource(): string {
  return loadCanon().source;
}

/** หัวข้อคำแก้ที่ส่งขึ้นหน้าจอก่อน — ที่เหลือเปิดดูได้ทั้ง 29 หัวข้อ */
export const QIAN_TOPIC_ORDER: readonly string[] = [
  "凡事", "作事", "家事", "家運", "婚姻", "求兒", "六甲", "求財", "功名",
  "歲君", "治病", "出外", "經商", "來人", "行舟", "移居", "失物", "求雨",
  "官事", "六畜", "耕作", "築室", "墳墓", "討海", "作塭", "魚苗", "月令",
  "尋人", "遠信",
];

/** ป้ายหัวข้อ 3 ภาษา — เป็นชื่อหัวข้อ ไม่ใช่เนื้อคำทำนาย จึงแปลได้ */
export const QIAN_TOPIC_LABELS: Record<
  string,
  { th: string; en: string; zh: string }
> = {
  凡事: { th: "ทุกเรื่องโดยรวม", en: "All matters", zh: "凡事" },
  作事: { th: "การงานที่ลงมือ", en: "Undertakings", zh: "作事" },
  家事: { th: "เรื่องในบ้าน", en: "Household matters", zh: "家事" },
  家運: { th: "ดวงของครอบครัว", en: "Family fortune", zh: "家運" },
  婚姻: { th: "การแต่งงาน", en: "Marriage", zh: "婚姻" },
  求兒: { th: "การขอบุตร", en: "Seeking a child", zh: "求兒" },
  六甲: { th: "การตั้งครรภ์", en: "Pregnancy", zh: "六甲" },
  求財: { th: "การหาทรัพย์", en: "Seeking wealth", zh: "求財" },
  功名: { th: "ยศตำแหน่งและการสอบ", en: "Rank and examinations", zh: "功名" },
  歲君: { th: "ดวงประจำปี", en: "The year's fortune", zh: "歲君" },
  治病: { th: "การรักษาโรค", en: "Treating illness", zh: "治病" },
  出外: { th: "การออกนอกบ้าน", en: "Travel away", zh: "出外" },
  經商: { th: "การค้าขาย", en: "Trade", zh: "經商" },
  來人: { th: "คนที่กำลังจะมา", en: "One who is coming", zh: "來人" },
  行舟: { th: "การเดินเรือ", en: "Sailing", zh: "行舟" },
  移居: { th: "การย้ายที่อยู่", en: "Moving house", zh: "移居" },
  失物: { th: "ของหาย", en: "Lost items", zh: "失物" },
  求雨: { th: "การขอฝน", en: "Praying for rain", zh: "求雨" },
  官事: { th: "คดีความ", en: "Legal matters", zh: "官事" },
  六畜: { th: "สัตว์เลี้ยง", en: "Livestock", zh: "六畜" },
  耕作: { th: "การเพาะปลูก", en: "Farming", zh: "耕作" },
  築室: { th: "การปลูกสร้าง", en: "Building", zh: "築室" },
  墳墓: { th: "ที่ฝังศพ", en: "Grave sites", zh: "墳墓" },
  討海: { th: "การออกทะเลหาปลา", en: "Fishing at sea", zh: "討海" },
  作塭: { th: "การทำบ่อเลี้ยงสัตว์น้ำ", en: "Fish ponds", zh: "作塭" },
  魚苗: { th: "ลูกปลาที่เลี้ยง", en: "Fry stock", zh: "魚苗" },
  月令: { th: "ดวงของเดือนนี้", en: "This month's fortune", zh: "月令" },
  尋人: { th: "การตามหาคน", en: "Searching for someone", zh: "尋人" },
  遠信: { th: "ข่าวจากที่ไกล", en: "News from afar", zh: "遠信" },
};

/**
 * คำกำกับที่ต้องขึ้นคู่ใบเซียมซีทุกครั้ง — กันคนอ่านผิดว่าเป็นป้ายระดับ
 * และบอกตรง ๆ ว่าช่องอังกฤษยังไม่มีในคัมภีร์
 */
export const QIAN_DISCLOSURE = {
  th: "คัมภีร์ต้นฉบับไม่มีป้ายระดับดี-ร้ายสักใบ ข้อความที่เห็นคือคำแก้ตามต้นฉบับ ไม่ใช่การจัดอันดับ",
  en: "The source canon carries no good/bad grade on any slip. What you see is the canonical wording, not a ranking.",
  zh: "原典六十籤皆無吉凶等第,所見為原文籤解,非評級。",
};
