import { createHmac } from "crypto";
import {
  QIAN_CANON_VERSION,
  qianCard,
  type QianCard,
} from "@/lib/shrine-qian-canon";

/**
 * ผลพิธีภายในวัด HourKey เท่านั้น
 *
 * ผลทั้งหมดถูกตัดสินบนเครื่องแม่ข่ายและผูกกับผู้ใช้ + idempotency key
 * จึงยิงซ้ำแล้วได้คำตอบเดิม โดยไม่กล่าวอ้างว่าเป็นข้อเท็จจริงภายนอกวัด
 * หรือคำรับรองผลในโลกจริง
 */

export const HOURKEY_RITUAL_IDS = [
  "offering-shop",
  "auspicious-lamp",
  "incense",
  "moktak",
  "fortune-sticks",
  "oracle-liuyao",
  "donation",
  "jiaobei",
  "tea-fruit-offering",
  "talisman",
  "vow-fulfillment",
  "guanyin-prayer",
  "forecourt-bell",
  "forecourt-drum",
  "tiangong-incense",
  "forecourt-guanyin-worship",
  "east-garden-koi-feed",
  "east-garden-wish-tie",
  "east-garden-pavilion",
  "east-garden-guanyin-worship",
] as const;

export type HourKeyRitualId = (typeof HOURKEY_RITUAL_IDS)[number];

export const HOURKEY_RITUAL_LOCALES = [
  "th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es",
] as const;

export type HourKeyRitualLocale =
  (typeof HOURKEY_RITUAL_LOCALES)[number];

type LocalizedText = Readonly<Record<HourKeyRitualLocale, string>>;

export type HourKeyRitualInput = Readonly<{
  idempotencyKey: string;
  intentCategory: "work" | "finance" | "health" | "family" | "peace" | null;
  locale: HourKeyRitualLocale;
  ritualId: HourKeyRitualId;
  wishText: string | null;
}>;

export type HourKeyRitualResult = Readonly<{
  authoritative: true;
  display: Readonly<{ body: string; footer: string; title: string }>;
  ok: true;
  resultCode: string;
  ritualId: HourKeyRitualId;
  status: "authorized";
  values: Readonly<{
    fortuneStickCard: QianCard | null;
    fortuneStickCanonVersion: string | null;
    fortuneStickNumber: number | null;
    jiaobeiOutcome: "sheng" | "xiao" | "yin" | "li" | null;
    liuyaoLines: readonly number[] | null;
    meritBeat: number | null;
  }>;
}>;

const IDEMPOTENCY_PATTERN = /^ritual_[0-9a-f]{32}$/u;
const RITUAL_SET = new Set<string>(HOURKEY_RITUAL_IDS);
const LOCALE_SET = new Set<string>(HOURKEY_RITUAL_LOCALES);
const INTENT_SET = new Set<string>([
  "work", "finance", "health", "family", "peace",
]);

const TITLES: Readonly<Record<HourKeyRitualId, LocalizedText>> = {
  "offering-shop": localized("เครื่องบูชา", "Offering station", "供品處", "供品处", "Quầy lễ phẩm", "供物所", "Подношения", "공양소", "Ofrendas"),
  "auspicious-lamp": localized("จุดโคมมงคล", "Auspicious lamp", "點吉祥燈", "点吉祥灯", "Thắp đèn cát tường", "吉祥灯を灯す", "Благоприятный светильник", "길상등 밝히기", "Lámpara auspiciosa"),
  incense: localized("จุดธูป", "Incense offering", "上香", "上香", "Dâng hương", "焼香", "Воскурение благовоний", "분향", "Ofrenda de incienso"),
  moktak: localized("เคาะปลาไม้", "Wooden fish", "敲木魚", "敲木鱼", "Gõ mõ", "木魚", "Деревянная рыба", "목탁", "Pez de madera"),
  "fortune-sticks": localized("เซียมซี HourKey", "HourKey fortune stick", "HourKey 靈籤", "HourKey 灵签", "Thẻ xăm HourKey", "HourKey おみくじ", "Жребий HourKey", "HourKey 운세 제비", "Vara de fortuna HourKey"),
  "oracle-liuyao": localized("ผลลิ่วเหยา HourKey", "HourKey Liuyao", "HourKey 六爻", "HourKey 六爻", "Lục hào HourKey", "HourKey 六爻", "Лю Яо HourKey", "HourKey 육효", "Liuyao HourKey"),
  donation: localized("ตั้งใจทำบุญ", "Merit intention", "善願", "善愿", "Tâm nguyện công đức", "功徳の志", "Намерение о добром деле", "공덕 발원", "Intención de mérito"),
  jiaobei: localized("ผลเสี่ยงปวย HourKey", "HourKey moon blocks", "HourKey 擲筊", "HourKey 掷筊", "Kết quả âm dương bôi HourKey", "HourKey ポエ占い", "Лунные блоки HourKey", "HourKey 자오베이", "Bloques lunares HourKey"),
  "tea-fruit-offering": localized("ถวายชาและผลไม้", "Tea and fruit offering", "奉茶果", "奉茶果", "Dâng trà và quả", "茶果の供養", "Подношение чая и фруктов", "차와 과일 공양", "Ofrenda de té y fruta"),
  talisman: localized("รับยันต์ HourKey", "HourKey talisman", "HourKey 靈符", "HourKey 灵符", "Linh phù HourKey", "HourKey 霊符", "Талисман HourKey", "HourKey 부적", "Talismán HourKey"),
  "vow-fulfillment": localized("ตั้งใจแก้บน", "Vow fulfillment", "還願", "还愿", "Hoàn nguyện", "願ほどき", "Исполнение обета", "환원", "Cumplimiento de promesa"),
  "guanyin-prayer": localized("คำตอบจากลานเจ้าแม่กวนอิม", "Guanyin garden result", "觀音園結果", "观音园结果", "Kết quả vườn Quan Âm", "観音庭園の結果", "Ответ сада Гуаньинь", "관음 정원 결과", "Resultado del jardín de Guanyin"),
  "forecourt-bell": localized("ตีระฆังหน้าวิหาร", "Forecourt bell", "前庭鳴鐘", "前庭鸣钟", "Thỉnh chuông sân trước", "前庭の鐘", "Колокол перед храмом", "앞마당 종 울리기", "Campana del atrio"),
  "forecourt-drum": localized("ตีกลองหน้าวิหาร", "Forecourt drum", "前庭擊鼓", "前庭击鼓", "Đánh trống sân trước", "前庭の太鼓", "Барабан перед храмом", "앞마당 북 치기", "Tambor del atrio"),
  "tiangong-incense": localized("ถวายธูปเทียนกง", "Tiangong incense", "天公上香", "天公上香", "Dâng hương Thiên Công", "天公への焼香", "Благовоние Тянь-гуну", "천공 분향", "Incienso a Tiangong"),
  "forecourt-guanyin-worship": localized("ไหว้เจ้าแม่หน้าลาน", "Forecourt Guanyin worship", "前庭禮拜觀音", "前庭礼拜观音", "Lễ Quan Âm sân trước", "前庭の観音礼拝", "Поклонение Гуаньинь во дворе", "앞마당 관음 예배", "Veneración a Guanyin en el atrio"),
  "east-garden-koi-feed": localized("ให้อาหารปลาคาร์ป", "Feed the koi", "餵錦鯉", "喂锦鲤", "Cho cá koi ăn", "鯉への餌やり", "Кормление карпов", "비단잉어 먹이 주기", "Alimentar a las carpas koi"),
  "east-garden-wish-tie": localized("ผูกคำอธิษฐาน", "Tie a wish", "繫願箋", "系愿笺", "Buộc thẻ nguyện", "願い札を結ぶ", "Завязать пожелание", "소원 매달기", "Atar un deseo"),
  "east-garden-pavilion": localized("พักใจที่ศาลา", "Garden pavilion", "園亭靜心", "园亭静心", "Tĩnh tâm tại đình", "庭園の東屋", "Садовый павильон", "정원 정자", "Pabellón del jardín"),
  "east-garden-guanyin-worship": localized("ไหว้เจ้าแม่กวนอิมพันกร", "Thousand-arms Guanyin worship", "禮拜千手觀音", "礼拜千手观音", "Lễ Quan Âm Thiên Thủ", "千手観音礼拝", "Поклонение Тысячерукой Гуаньинь", "천수관음 예배", "Veneración a Guanyin de Mil Brazos"),
};

const CAMPUS_BODIES: Readonly<Partial<
  Record<HourKeyRitualId, LocalizedText>
>> = {
  "forecourt-bell": localized("วัด HourKey รับการตีระฆังรอบนี้แล้ว", "The HourKey temple has accepted this bell ringing.", "HourKey 寺已接收本次鐘聲。", "HourKey 寺已接收本次钟声。", "Đền HourKey đã tiếp nhận tiếng chuông này.", "HourKey寺院が今回の鐘の音を受け取りました。", "Храм HourKey принял этот звон.", "HourKey 사원이 이번 종소리를 받았습니다.", "El templo HourKey recibió este toque de campana."),
  "forecourt-drum": localized("วัด HourKey รับการตีกลองรอบนี้แล้ว", "The HourKey temple has accepted this drum beat.", "HourKey 寺已接收本次鼓聲。", "HourKey 寺已接收本次鼓声。", "Đền HourKey đã tiếp nhận nhịp trống này.", "HourKey寺院が今回の太鼓を受け取りました。", "Храм HourKey принял этот удар барабана.", "HourKey 사원이 이번 북소리를 받았습니다.", "El templo HourKey recibió este toque de tambor."),
  "tiangong-incense": localized("วัด HourKey รับการถวายธูปเทียนกงรอบนี้แล้ว", "The HourKey temple has received this Tiangong incense offering.", "HourKey 寺已接收本次天公香供。", "HourKey 寺已接收本次天公香供。", "Đền HourKey đã tiếp nhận lễ dâng hương Thiên Công này.", "HourKey寺院が今回の天公への焼香を受け取りました。", "Храм HourKey принял это подношение благовоний Тянь-гуну.", "HourKey 사원이 이번 천공 분향을 받았습니다.", "El templo HourKey recibió esta ofrenda de incienso a Tiangong."),
  "forecourt-guanyin-worship": localized("การไหว้เจ้าแม่หน้าลานรอบนี้เสร็จสมบูรณ์แล้ว", "This forecourt Guanyin worship is complete.", "本次前庭觀音禮拜已完成。", "本次前庭观音礼拜已完成。", "Lễ Quan Âm tại sân trước đã hoàn tất.", "前庭での観音礼拝が完了しました。", "Поклонение Гуаньинь во дворе завершено.", "앞마당 관음 예배를 마쳤습니다.", "La veneración a Guanyin en el atrio ha terminado."),
  "east-garden-koi-feed": localized("วัด HourKey รับการให้อาหารปลาคาร์ปรอบนี้แล้ว", "The HourKey temple has accepted this koi feeding.", "HourKey 寺已接收本次餵錦鯉。", "HourKey 寺已接收本次喂锦鲤。", "Đền HourKey đã tiếp nhận lần cho cá koi ăn này.", "HourKey寺院が今回の鯉への餌やりを受け取りました。", "Храм HourKey принял это кормление карпов.", "HourKey 사원이 이번 비단잉어 먹이 주기를 받았습니다.", "El templo HourKey recibió esta alimentación de carpas koi."),
  "east-garden-wish-tie": localized("คำอธิษฐานถูกผูกไว้ใน East Garden ของ HourKey แล้ว", "Your wish has been tied in HourKey's East Garden.", "願箋已繫於 HourKey 東園。", "愿笺已系于 HourKey 东园。", "Thẻ nguyện đã được buộc trong Vườn Đông HourKey.", "願い札をHourKey東庭園に結びました。", "Пожелание привязано в Восточном саду HourKey.", "소원이 HourKey 동쪽 정원에 매달렸습니다.", "Tu deseo quedó atado en el Jardín Este de HourKey."),
  "east-garden-pavilion": localized("ช่วงพักใจที่ศาลา East Garden เสร็จสมบูรณ์แล้ว", "Your quiet pause at the East Garden pavilion is complete.", "東園亭中的靜心片刻已完成。", "东园亭中的静心片刻已完成。", "Khoảnh khắc tĩnh tâm tại đình Vườn Đông đã hoàn tất.", "東庭園の東屋での静かなひとときが完了しました。", "Тихая пауза в павильоне Восточного сада завершена.", "동쪽 정원 정자에서의 고요한 시간을 마쳤습니다.", "Tu pausa serena en el pabellón del Jardín Este ha terminado."),
  "east-garden-guanyin-worship": localized("พิธีไหว้เจ้าแม่กวนอิมพันกรใน East Garden เสร็จสมบูรณ์แล้ว", "The Thousand-arms Guanyin worship in the East Garden is complete.", "東園千手觀音禮拜已完成。", "东园千手观音礼拜已完成。", "Lễ Quan Âm Thiên Thủ tại Vườn Đông đã hoàn tất.", "東庭園の千手観音礼拝が完了しました。", "Поклонение Тысячерукой Гуаньинь в Восточном саду завершено.", "동쪽 정원의 천수관음 예배를 마쳤습니다.", "La veneración a Guanyin de Mil Brazos en el Jardín Este ha terminado."),
};

const FIXED_RESULT_CODES: Readonly<Partial<
  Record<HourKeyRitualId, string>
>> = {
  "forecourt-bell": "forecourt-bell-rung",
  "forecourt-drum": "forecourt-drum-struck",
  "tiangong-incense": "forecourt-tiangong-incense-lit",
  "forecourt-guanyin-worship": "forecourt-guanyin-worship-completed",
  "east-garden-koi-feed": "east-garden-koi-fed",
  "east-garden-wish-tie": "east-garden-wish-tied",
  "east-garden-pavilion": "east-garden-pavilion-visited",
  "east-garden-guanyin-worship": "east-garden-guanyin-worship-completed",
};

const COMPLETED: LocalizedText = localized(
  "ระบบวัด HourKey รับผลพิธีรอบนี้แล้ว",
  "The HourKey temple has accepted this ritual result.",
  "HourKey 寺院系統已接收本次儀式結果。",
  "HourKey 寺院系统已接收本次仪式结果。",
  "Hệ thống đền HourKey đã tiếp nhận kết quả nghi thức này.",
  "HourKey寺院システムが今回の儀式結果を受け取りました。",
  "Система храма HourKey приняла результат этого ритуала.",
  "HourKey 사원 시스템이 이번 의식 결과를 받았습니다.",
  "El templo HourKey ha recibido el resultado de este ritual.",
);

const QIAN_SEALED_BODY: LocalizedText = localized(
  "ได้ใบเซียมซีแล้ว แต่ใบยังผนึกอยู่ตามธรรมเนียม ไปโยนจอกหน้าองค์เทพให้ได้ซิ่วปัว 3 ครั้งติดเพื่อยืนยันและคลี่อ่าน",
  "Your slip is drawn but remains sealed by temple custom. Cast the moon blocks before the deity and receive three shengjiao in a row to confirm and unseal it.",
  "籤已抽得，依例尚未開啟。請在神前擲筊，連得三聖筊後即可確認開籤。",
  "签已抽得，依例尚未开启。请在神前掷筊，连得三圣筊后即可确认开签。",
  "Thẻ xăm đã được rút nhưng vẫn còn niêm theo nghi thức. Hãy xin âm dương bôi trước thần và được ba thánh bôi liên tiếp để xác nhận rồi mở thẻ.",
  "おみくじは引かれましたが、作法によりまだ封じられています。神前でポエを投げ、聖筊を3回続けて得ると確認して開けます。",
  "Жребий вытянут, но по обычаю пока запечатан. Бросьте лунные блоки перед божеством и получите три шэн подряд, чтобы подтвердить и открыть его.",
  "운세 제비를 뽑았지만 의식에 따라 아직 봉인되어 있습니다. 신전에서 교배를 던져 성교를 세 번 연속 받으면 확인 후 펼칠 수 있습니다.",
  "La vara ya fue extraída, pero permanece sellada por la costumbre del templo. Lanza los bloques lunares ante la deidad y obtén tres shengjiao seguidos para confirmarla y abrirla.",
);

const QIAN_SEALED_FOOTER: LocalizedText = localized(
  "เนื้อใบและคำแปลของ HourKey แนบมากับผลจากระบบแล้ว และจะเปิดหลังยืนยัน",
  "The canonical Chinese slip text is attached to this server result; a full translation is not yet available in this language.",
  "HourKey 籤文原文已隨系統結果附上，確認後開啟。",
  "HourKey 签文原文已随系统结果附上，确认后开启。",
  "Nguyên văn tiếng Hoa được đính kèm với kết quả hệ thống; bản dịch đầy đủ sang ngôn ngữ này chưa có.",
  "中国語の原文はシステム結果に含まれています。この言語の完全な翻訳はまだありません。",
  "Китайский оригинал приложен к результату системы; полного перевода на этот язык пока нет.",
  "중국어 원문은 시스템 결과에 포함되어 있으며, 이 언어의 전체 번역은 아직 제공되지 않습니다.",
  "El texto chino original está adjunto al resultado del sistema; aún no hay traducción completa a este idioma.",
);

const FOOTER: LocalizedText = localized(
  "ผลกิจกรรมภายในวัด HourKey เพื่อการสะท้อนใจ ไม่ใช่ข้อเท็จจริงหรือคำรับรองผลในโลกจริง",
  "An in-temple HourKey reflection result; not a real-world fact or guarantee.",
  "此為 HourKey 寺內反思活動結果，並非現實世界的事實或保證。",
  "此为 HourKey 寺内反思活动结果，并非现实世界的事实或保证。",
  "Đây là kết quả chiêm nghiệm trong đền HourKey, không phải sự thật hay bảo đảm ngoài đời.",
  "HourKey寺院内の内省結果であり、現実世界の事実や保証ではありません。",
  "Это результат практики внутри храма HourKey, а не факт или гарантия в реальном мире.",
  "HourKey 사원 안의 성찰 결과이며 현실의 사실이나 보장이 아닙니다.",
  "Es un resultado de reflexión dentro del templo HourKey, no un hecho ni una garantía del mundo real.",
);

const JIAOBEI_LABELS: Readonly<Record<string, LocalizedText>> = {
  sheng: localized("ซิ่วปวย — เปิดทางให้ดำเนินต่อ", "Sheng — proceed", "聖筊—可繼續", "圣筊—可继续", "Thánh bôi — có thể tiếp tục", "聖筊—進んでよい", "Шэн — можно продолжать", "성교 — 계속 진행", "Sheng — puedes continuar"),
  xiao: localized("ชั่วปวย — พักแล้วตั้งคำถามใหม่", "Xiao — pause and ask again", "笑筊—暫停後再問", "笑筊—暂停后再问", "Tiếu bôi — tạm dừng rồi hỏi lại", "笑筊—休んで問い直す", "Сяо — сделайте паузу и спросите снова", "소교 — 잠시 멈추고 다시 묻기", "Xiao — pausa y vuelve a preguntar"),
  yin: localized("อิมปวย — ยังไม่ใช่จังหวะนี้", "Yin — not at this moment", "陰筊—此刻未宜", "阴筊—此刻未宜", "Âm bôi — chưa phải lúc này", "陰筊—今はその時ではない", "Инь — сейчас не время", "음교 — 아직 때가 아님", "Yin — aún no es el momento"),
  li: localized("จอกตั้ง — ยังไม่ตัดสิน ให้เริ่มใหม่", "Standing block — no decision; begin again", "立筊—未決，請重來", "立筊—未决，请重来", "Bôi đứng — chưa có kết luận, hãy làm lại", "立筊—未決、やり直してください", "Стоящий блок — решения нет, начните снова", "입교 — 미결, 다시 시작", "Bloque de pie — sin decisión; empieza de nuevo"),
};

function localized(
  th: string,
  en: string,
  zh: string,
  cn: string,
  vi: string,
  ja: string,
  ru: string,
  ko: string,
  es: string,
): LocalizedText {
  return { th, en, zh, cn, vi, ja, ru, ko, es };
}

class HourKeyRitualInputError extends Error {
  constructor(field: string) {
    super(`invalid_${field}`);
  }
}

export function parseHourKeyRitualInput(raw: unknown): HourKeyRitualInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HourKeyRitualInputError("body");
  }
  const body = raw as Record<string, unknown>;
  const ritualId = body.ritual_id;
  if (typeof ritualId !== "string" || !RITUAL_SET.has(ritualId)) {
    throw new HourKeyRitualInputError("ritual_id");
  }
  const locale = body.locale;
  if (typeof locale !== "string" || !LOCALE_SET.has(locale)) {
    throw new HourKeyRitualInputError("locale");
  }
  const idempotencyKey = typeof body.idempotency_key === "string"
    ? body.idempotency_key.trim()
    : "";
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new HourKeyRitualInputError("idempotency_key");
  }
  const rawIntent = body.intent_category;
  const intentCategory = rawIntent === undefined || rawIntent === null
    ? null
    : typeof rawIntent === "string" && INTENT_SET.has(rawIntent)
      ? rawIntent as HourKeyRitualInput["intentCategory"]
      : (() => { throw new HourKeyRitualInputError("intent_category"); })();
  const rawWish = body.wish_text;
  const wishText = rawWish === undefined || rawWish === null
    ? null
    : typeof rawWish === "string"
      ? rawWish.trim()
      : (() => { throw new HourKeyRitualInputError("wish_text"); })();
  if (wishText !== null && (wishText.length < 1 || wishText.length > 280)) {
    throw new HourKeyRitualInputError("wish_text");
  }
  if (
    ritualId === "guanyin-prayer"
    && (intentCategory === null || wishText === null)
  ) {
    throw new HourKeyRitualInputError("prayer_context");
  }
  if (ritualId === "east-garden-wish-tie" && wishText === null) {
    throw new HourKeyRitualInputError("wish_context");
  }
  return {
    idempotencyKey,
    intentCategory,
    locale: locale as HourKeyRitualLocale,
    ritualId: ritualId as HourKeyRitualId,
    wishText,
  };
}

export function resolveHourKeyRitual(
  userId: string,
  input: HourKeyRitualInput,
  secret: string,
): HourKeyRitualResult {
  if (!userId.trim()) throw new Error("ritual_user_required");
  if (secret.length < 32) throw new Error("ritual_secret_required");
  const digest = createHmac("sha256", secret)
    .update(`${userId}:${input.ritualId}:${input.idempotencyKey}`)
    .digest();
  const locale = input.locale;
  let resultCode = FIXED_RESULT_CODES[input.ritualId]
    ?? `${input.ritualId}-started`;
  let body = CAMPUS_BODIES[input.ritualId]?.[locale] ?? COMPLETED[locale];
  let fortuneStickNumber: number | null = null;
  let jiaobeiOutcome: "sheng" | "xiao" | "yin" | "li" | null = null;
  let liuyaoLines: readonly number[] | null = null;
  let meritBeat: number | null = null;
  let fortuneStickCard: QianCard | null = null;
  let fortuneStickCanonVersion: string | null = null;
  let footer = FOOTER[locale];

  if (input.ritualId === "moktak") {
    meritBeat = 1 + (digest.readUInt16BE(0) % 108);
    resultCode = `moktak-merit-${meritBeat}`;
    body = locale === "th"
      ? `จังหวะสติ HourKey รอบนี้: ${meritBeat}`
      : `${COMPLETED[locale]} #${meritBeat}`;
  } else if (input.ritualId === "fortune-sticks") {
    fortuneStickNumber = 1 + (digest.readUInt16BE(0) % 60);
    fortuneStickCard = qianCard(fortuneStickNumber);
    fortuneStickCanonVersion = QIAN_CANON_VERSION;
    resultCode = `fortune-stick-${fortuneStickNumber}`;
    body = QIAN_SEALED_BODY[locale];
    footer = QIAN_SEALED_FOOTER[locale];
  } else if (input.ritualId === "oracle-liuyao") {
    liuyaoLines = Object.freeze(
      Array.from({ length: 6 }, (_, index) => 6 + (digest[index] % 4)),
    );
    resultCode = `oracle-lines-${liuyaoLines.join("-")}`;
    body = locale === "th"
      ? `เส้นลิ่วเหยา HourKey: ${liuyaoLines.join(" · ")}`
      : `HourKey lines: ${liuyaoLines.join(" · ")}`;
  } else if (
    input.ritualId === "jiaobei"
    || input.ritualId === "guanyin-prayer"
  ) {
    const selector = digest[0];
    jiaobeiOutcome = selector < 128
      ? "sheng"
      : selector < 192
        ? "xiao"
        : selector < 250
          ? "yin"
          : "li";
    resultCode = input.ritualId === "jiaobei"
      ? `jiaobei-${jiaobeiOutcome}`
      : `${jiaobeiOutcome}-jiao`;
    body = JIAOBEI_LABELS[jiaobeiOutcome][locale];
  }

  return Object.freeze({
    authoritative: true,
    display: Object.freeze({
      body,
      footer,
      title: TITLES[input.ritualId][locale],
    }),
    ok: true,
    resultCode,
    ritualId: input.ritualId,
    status: "authorized",
    values: Object.freeze({
      fortuneStickCanonVersion,
      fortuneStickCard,
      fortuneStickNumber,
      jiaobeiOutcome,
      liuyaoLines,
      meritBeat,
    }),
  });
}

/**
 * Keyed fingerprint of the complete semantic request. Domain separation keeps
 * low-entropy private wishes from becoming offline-dictionary targets if the
 * ledger is ever exposed.
 */
export function hashHourKeyRitualRequest(
  input: HourKeyRitualInput,
  secret: string,
  userId: string,
): string {
  if (secret.length < 32) throw new Error("ritual_secret_required");
  return createHmac("sha256", secret)
    .update("hourkey:shrine:ritual-request:v1\0")
    .update(JSON.stringify([
      userId,
      input.ritualId,
      input.locale,
      input.intentCategory,
      input.wishText,
    ]))
    .digest("hex");
}
