import { createHmac } from "crypto";

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
  let resultCode = `${input.ritualId}-started`;
  let body = COMPLETED[locale];
  let fortuneStickNumber: number | null = null;
  let jiaobeiOutcome: "sheng" | "xiao" | "yin" | "li" | null = null;
  let liuyaoLines: readonly number[] | null = null;
  let meritBeat: number | null = null;

  if (input.ritualId === "moktak") {
    meritBeat = 1 + (digest.readUInt16BE(0) % 108);
    resultCode = `moktak-merit-${meritBeat}`;
    body = locale === "th"
      ? `จังหวะสติ HourKey รอบนี้: ${meritBeat}`
      : `${COMPLETED[locale]} #${meritBeat}`;
  } else if (input.ritualId === "fortune-sticks") {
    fortuneStickNumber = 1 + (digest.readUInt16BE(0) % 60);
    resultCode = `fortune-stick-${fortuneStickNumber}`;
    body = locale === "th"
      ? `เซียมซี HourKey ใบที่ ${fortuneStickNumber}`
      : `${TITLES["fortune-sticks"][locale]} #${fortuneStickNumber}`;
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
      footer: FOOTER[locale],
      title: TITLES[input.ritualId][locale],
    }),
    ok: true,
    resultCode,
    ritualId: input.ritualId,
    status: "authorized",
    values: Object.freeze({
      fortuneStickNumber,
      jiaobeiOutcome,
      liuyaoLines,
      meritBeat,
    }),
  });
}
