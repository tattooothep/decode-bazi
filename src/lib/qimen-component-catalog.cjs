"use strict";

const QUALITY = Object.freeze({
  great_auspicious: "supportive",
  auspicious: "supportive",
  contextual: "contextual",
  neutral: "contextual",
  normal: "contextual",
  inauspicious: "unsupportive",
  severe: "unsupportive",
});

function componentPresentation(value) {
  return QUALITY[String(value || "")] || "unavailable";
}

function component(code, zh, th, en, baseQuality) {
  return Object.freeze({
    code,
    zh,
    names: Object.freeze({ th, en, zh }),
    baseQuality,
    presentation: componentPresentation(baseQuality),
  });
}

const CATALOG = Object.freeze({
  deity: Object.freeze({
    BAI_HU: component("BAI_HU", "白虎", "พยัคฆ์ขาว", "Bai Hu (White Tiger)", "severe"),
    GOU_CHEN: component("GOU_CHEN", "勾陳", "โกวเฉิน (ขอเกี่ยว)", "Gou Chen (Hooked Earth)", "inauspicious"),
    JIU_DI: component("JIU_DI", "九地", "เก้าพื้นดิน", "Jiu Di (Nine Earth)", "auspicious"),
    JIU_TIAN: component("JIU_TIAN", "九天", "เก้าสวรรค์", "Jiu Tian (Nine Heaven)", "auspicious"),
    LIU_HE: component("LIU_HE", "六合", "ลิ่วเหอ", "Liu He (Six Harmony)", "auspicious"),
    TAI_YIN: component("TAI_YIN", "太陰", "ไท่อิน", "Tai Yin (Great Yin)", "auspicious"),
    TENG_SHE: component("TENG_SHE", "螣蛇", "เถิงเสอ", "Teng She (Snake)", "inauspicious"),
    XUAN_WU: component("XUAN_WU", "玄武", "เสวียนอู่", "Xuan Wu (Black Tortoise)", "inauspicious"),
    ZHI_FU: component("ZHI_FU", "值符", "จื้อฝู (เทพหัวหน้า)", "Zhi Fu (Chief Deity)", "great_auspicious"),
    ZHU_QUE: component("ZHU_QUE", "朱雀", "จูเชวี่ย (นกแดง)", "Zhu Que (Vermillion Sparrow)", "inauspicious"),
  }),
  door: Object.freeze({
    DU_MEN: component("DU_MEN", "杜門", "ประตูปิดกั้น", "Du Men (Block Gate)", "contextual"),
    JING_FEAR_MEN: component("JING_FEAR_MEN", "驚門", "ประตูตกใจ", "Jing Men (Shock Gate)", "inauspicious"),
    JING_VIEW_MEN: component("JING_VIEW_MEN", "景門", "ประตูทิวทัศน์", "Jing Men (View Gate)", "auspicious"),
    KAI_MEN: component("KAI_MEN", "開門", "ประตูเปิด", "Kai Men (Open Gate)", "great_auspicious"),
    SHANG_MEN: component("SHANG_MEN", "傷門", "ประตูบาดเจ็บ", "Shang Men (Wound Gate)", "inauspicious"),
    SHENG_MEN: component("SHENG_MEN", "生門", "ประตูชีวิต", "Sheng Men (Life Gate)", "great_auspicious"),
    SI_MEN: component("SI_MEN", "死門", "ประตูตาย", "Si Men (Death Gate)", "severe"),
    XIU_MEN: component("XIU_MEN", "休門", "ประตูพักผ่อน", "Xiu Men (Rest Gate)", "great_auspicious"),
  }),
  star: Object.freeze({
    TIAN_CHONG: component("TIAN_CHONG", "天沖", "ดาวเทียนชง", "Tian Chong (Heavenly Rushing)", "contextual"),
    TIAN_FU: component("TIAN_FU", "天輔", "ดาวเทียนฝู่", "Tian Fu (Heavenly Assistant)", "great_auspicious"),
    TIAN_PENG: component("TIAN_PENG", "天蓬", "ดาวเทียนเผิง", "Tian Peng (Heavenly Mast)", "severe"),
    TIAN_QIN: component("TIAN_QIN", "天禽", "ดาวเทียนฉิน", "Tian Qin (Heavenly Bird)", "great_auspicious"),
    TIAN_REN: component("TIAN_REN", "天任", "ดาวเทียนเหริน", "Tian Ren (Heavenly Task)", "auspicious"),
    TIAN_RUI: component("TIAN_RUI", "天芮", "ดาวเทียนรุ่ย", "Tian Rui (Heavenly Ailment)", "severe"),
    TIAN_XIN: component("TIAN_XIN", "天心", "ดาวเทียนซิน", "Tian Xin (Heavenly Heart)", "great_auspicious"),
    TIAN_YING: component("TIAN_YING", "天英", "ดาวเทียนอิง", "Tian Ying (Heavenly Hero)", "inauspicious"),
    TIAN_ZHU: component("TIAN_ZHU", "天柱", "ดาวเทียนจู้", "Tian Zhu (Heavenly Pillar)", "inauspicious"),
  }),
});

function resolveQimenComponent(kind, code) {
  return CATALOG[kind]?.[String(code || "").toUpperCase()] || null;
}

module.exports = Object.freeze({ CATALOG, componentPresentation, resolveQimenComponent });
