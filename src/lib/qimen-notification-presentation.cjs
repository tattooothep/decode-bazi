"use strict";

// Pure Qimen notification presentation shared by reservation and retry
// attestation. This module must stay free of DB, environment, worker, and
// scheduler initialization.
const payloadRuntime = require("./qimen-three-layer-notification.cjs");
const componentCatalog = require("./qimen-component-catalog.cjs");

const DIRECTION = Object.freeze({
  N: { th: "เหนือ", en: "north", zh: "北" }, NE: { th: "ตะวันออกเฉียงเหนือ", en: "northeast", zh: "東北" },
  E: { th: "ตะวันออก", en: "east", zh: "東" }, SE: { th: "ตะวันออกเฉียงใต้", en: "southeast", zh: "東南" },
  S: { th: "ใต้", en: "south", zh: "南" }, SW: { th: "ตะวันตกเฉียงใต้", en: "southwest", zh: "西南" },
  W: { th: "ตะวันตก", en: "west", zh: "西" }, NW: { th: "ตะวันตกเฉียงเหนือ", en: "northwest", zh: "西北" },
});

const STATE_COPY = Object.freeze({
  th: Object.freeze({ supportive: "✓ ส่งเสริม", contextual: "• ขึ้นกับบริบท", unsupportive: "! ไม่ส่งเสริม", unavailable: "? ยังไม่มีข้อมูล" }),
  en: Object.freeze({ supportive: "✓ Supportive", contextual: "• Contextual", unsupportive: "! Unsupportive", unavailable: "? Unavailable" }),
  zh: Object.freeze({ supportive: "✓ 助", contextual: "• 視情境", unsupportive: "! 不助", unavailable: "? 無資料" }),
});
const LAYER_COPY = Object.freeze({
  th: Object.freeze({ month: "เดือน", day: "วัน", hour: "ยาม" }),
  en: Object.freeze({ month: "M", day: "D", hour: "H" }),
  zh: Object.freeze({ month: "月", day: "日", hour: "時" }),
});
const COMPONENT_KINDS = Object.freeze(["deity", "door", "star"]);
const LAYER_KINDS = Object.freeze(["month", "day", "hour"]);
const DECISION_COPY = Object.freeze({
  th: Object.freeze({ clear: "ทิศเดินทางดีชัดเจน", conditional: "ทิศเดินทางดีแบบมีเงื่อนไข", usable: "ใช้ได้ แต่ยังไม่ใช่ดีชัดเจน", authority: "ผังยามเป็นผู้ตัดสิน" }),
  en: Object.freeze({ clear: "Clearly good travel direction", conditional: "Conditional travel direction", usable: "Usable, not clearly good", authority: "Hour governs" }),
  zh: Object.freeze({ clear: "明確出行吉方", conditional: "有條件的出行吉方", usable: "可用，但非明確吉方", authority: "時家盤主導行動" }),
});

function localizedComponent(language, kind, evidence) {
  const entry = componentCatalog.resolveQimenComponent(kind, evidence[`${kind}Code`]);
  const quality = evidence[`${kind}BaseQuality`];
  if (!entry || entry.zh !== evidence[`${kind}Zh`] || entry.baseQuality !== quality) {
    throw new TypeError("qimen_snapshot_invalid");
  }
  const presentation = componentCatalog.componentPresentation(quality);
  const state = STATE_COPY[language][presentation];
  if (!state) throw new TypeError("qimen_snapshot_invalid");
  let name;
  if (language === "zh") name = entry.names.zh;
  else if (language === "en") {
    const plainEnglish = /\(([^()]+)\)\s*$/u.exec(entry.names.en)?.[1] || entry.names.en;
    name = `${plainEnglish} (${entry.zh})`;
  } else name = `${entry.names.th} (${entry.zh})`;
  return `${name}${state.slice(0, 1)}`;
}

function parsedHourDecision(snapshot) {
  const reasonCodes = snapshot?.hourDecision?.reasonCodes;
  if (!Array.isArray(reasonCodes) || reasonCodes.length < 2 || reasonCodes.length > 4) {
    throw new TypeError("qimen_snapshot_invalid");
  }
  const decisionClass = reasonCodes[0] === "hour_clear_good" ? "clear"
    : reasonCodes[0] === "hour_conditional_good" ? "conditional" : null;
  const reading = /^hour_reading_([A-Za-z0-9_:-]{1,64})$/u.exec(String(reasonCodes[1] || ""));
  const warnings = reasonCodes.slice(2).map((value) => {
    const match = /^hour_warning_([A-Z0-9_]{2,80})$/u.exec(String(value || ""));
    return match?.[1] || null;
  });
  if (!decisionClass || !reading || warnings.some((value) => value === null)
    || new Set(warnings).size !== warnings.length
    || (decisionClass === "clear" && (reading[1] !== "suitable" || warnings.length !== 0))
    || (decisionClass === "conditional" && reading[1] === "suitable" && warnings.length === 0)) {
    throw new TypeError("qimen_snapshot_invalid");
  }
  return Object.freeze({ decisionClass, readingCode: reading[1], warnings: Object.freeze(warnings) });
}

function localizedDecisionWarning(language, code) {
  const fixed = {
    KONG_WANG: { th: "ช่องว่าง", en: "void", zh: "空亡" },
    MEN_PO: { th: "ประตูถูกบีบ", en: "gate pressure", zh: "門迫" },
    RU_MU: { th: "เข้าคลัง", en: "tomb state", zh: "入墓" },
    INTRINSIC_DEITY_BAD: { th: "เทพไม่ส่งเสริม", en: "unsupportive deity", zh: "神不助" },
    INTRINSIC_DOOR_BAD: { th: "ประตูไม่ส่งเสริม", en: "unsupportive gate", zh: "門不助" },
    INTRINSIC_STAR_BAD: { th: "ดาวไม่ส่งเสริม", en: "unsupportive star", zh: "星不助" },
    NEAR_HOUR_BOUNDARY: { th: "ใกล้ขอบยาม", en: "near hour boundary", zh: "近時辰交界" },
    LARGE_TIME_CORRECTION: { th: "ควรตรวจพิกัด", en: "check location", zh: "請核對位置" },
    NEAR_SOLAR_TERM_START: { th: "ใกล้จุดเปลี่ยนฤดูกาล", en: "near solar-term change", zh: "近節氣交界" },
    TENG_SHE_YAO_JIAO: { th: "เส้นทางอาจสับสนหรือติดขัด", en: "route may be confusing or delayed", zh: "行程可能迷亂或受阻" },
  }[code];
  if (fixed) return fixed[language];
  const stem = {
    STEM_RESPONSE_GUI_OVER_REN: {
      th: "เรื่องเดิมหรือความสับสนอาจย้อนกลับ", en: "old issues/confusion may return", zh: "舊事或混亂可能反覆",
    },
    STEM_RESPONSE_GUI_OVER_JI: {
      th: "เหมาะงานเงียบ ไม่เหมาะเปิดเผย", en: "quiet work favored; avoid publicity", zh: "宜靜務，不宜公開",
    },
    STEM_RESPONSE_XIN_OVER_BING: {
      th: "เงินหรือผลประโยชน์อาจพิพาท", en: "money/interests may cause disputes", zh: "錢財或利益恐生爭議",
    },
    STEM_RESPONSE_BING_OVER_GUI: {
      th: "ข้อมูลซ่อนอาจทำให้ยุ่งยาก", en: "hidden information may complicate matters", zh: "隱藏資訊恐添紛擾",
    },
    STEM_RESPONSE_JI_OVER_DING: {
      th: "ข่าวหรือเอกสารอาจติดขัด", en: "news/documents may be delayed", zh: "消息或文書恐受阻",
    },
    STEM_RESPONSE_BING_OVER_XIN: {
      th: "มีทางสำเร็จเมื่อแผนและข้อมูลพร้อม", en: "may succeed with sound planning", zh: "規劃與資料周全時較有機會成",
    },
    STEM_RESPONSE_GUI_OVER_GENG: {
      th: "เสี่ยงพิพาทกับกฎหรือฝ่ายแข็ง", en: "rules or a stronger party may cause disputes", zh: "與規則或強勢一方恐生爭議",
    },
    STEM_RESPONSE_JI_OVER_BING: {
      th: "เอกสารอาจติดเงื่อนไข อย่าเร่งเซ็น", en: "documents constrained; do not rush", zh: "文書恐受牽制，不宜急簽",
    },
    STEM_RESPONSE_JI_OVER_WU: {
      th: "เรื่องอาจสับสน ควรจัดข้อมูลก่อน", en: "may be tangled; simplify information first", zh: "事情恐紛亂，宜先整理資訊",
    },
    STEM_RESPONSE_REN_OVER_GUI: {
      th: "ระวังข่าวลือหรือขอบเขตความสัมพันธ์", en: "watch rumors and relationship boundaries", zh: "須留意流言與關係界線",
    },
    STEM_RESPONSE_XIN_OVER_WU: {
      th: "อาจเสียเปรียบในข้อพิพาท", en: "may be disadvantaged in disputes", zh: "在爭議中可能較為不利",
    },
    STEM_RESPONSE_YI_OVER_WU: {
      th: "เหมาะงานเบื้องหลังมากกว่างานเปิดเผย", en: "behind-the-scenes work is better supported", zh: "幕後事務較公開行動有利",
    },
  }[code];
  if (stem) return stem[language];
  return language === "th" ? `คำเตือนผัง ${code}`
    : language === "zh" ? `盤局提醒 ${code}` : `chart warning ${code}`;
}

function verifyCurrentSnapshot(snapshot) {
  return snapshot?.snapshotSchema === 4 ? payloadRuntime.verifyQimenThreeLayerSnapshotV4(snapshot)
    : payloadRuntime.verifyQimenThreeLayerSnapshotV3(snapshot);
}

function buildQimenCopy(locale, snapshot) {
  if (!verifyCurrentSnapshot(snapshot)) throw new TypeError("qimen_snapshot_invalid");
  const language = locale === "th" || locale === "zh" ? locale : "en";
  const decision = parsedHourDecision(snapshot);
  const direction = DIRECTION[snapshot.selectedDirection]?.[language] || snapshot.selectedDirection;
  const lines = LAYER_KINDS.map((layer) => {
    const components = COMPONENT_KINDS.map((kind) => localizedComponent(
      language,
      kind,
      snapshot.selectedEvidence[layer],
    ));
    return `${LAYER_COPY[language][layer]} ${components.join(" · ")}`;
  });
  const legend = Object.values(STATE_COPY[language]).join(" ");
  const warningText = decision.warnings.map((code) => localizedDecisionWarning(language, code)).join("; ");
  const decisionText = decision.decisionClass === "clear" ? DECISION_COPY[language].clear
    : warningText ? `△ ${warningText}` : DECISION_COPY[language].usable;
  const copy = Object.freeze({
    title: language === "th"
      ? `${decision.decisionClass === "clear" ? "✓" : "△"} ฉีเหมิน · ${DECISION_COPY.th[decision.decisionClass]} · ${direction}`
      : language === "zh"
        ? `${decision.decisionClass === "clear" ? "✓" : "△"} 奇門 · ${DECISION_COPY.zh[decision.decisionClass]} · ${direction}方`
        : `${decision.decisionClass === "clear" ? "✓" : "△"} Qimen · ${DECISION_COPY.en[decision.decisionClass]} · ${direction}`,
    body: `${lines.join(" | ")} | ${legend}\n${decisionText} · ${DECISION_COPY[language].authority}`,
  });
  if (copy.body.length > 400) throw new RangeError("qimen_copy_too_long");
  return copy;
}

module.exports = Object.freeze({ buildQimenCopy, verifyCurrentSnapshot });
