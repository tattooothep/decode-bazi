"use strict";

const MONTH_YEAR_GROUPS = Object.freeze({
  upper: Object.freeze("甲子乙丑丙寅丁卯戊辰甲午乙未丙申丁酉戊戌己卯庚辰辛巳壬午癸未己酉庚戌辛亥壬子癸丑".match(/../gu)),
  middle: Object.freeze("甲寅乙卯丙辰丁巳戊午甲申乙酉丙戌丁亥戊子己巳庚午辛未壬申癸酉己亥庚子辛丑壬寅癸卯".match(/../gu)),
  lower: Object.freeze("甲辰乙巳丙午丁未戊申甲戌乙亥丙子丁丑戊寅己丑庚寅辛卯壬辰癸巳己未庚申辛酉壬戌癸亥".match(/../gu)),
});

const MONTH_YEAR_JU = Object.freeze({ upper: 1, middle: 4, lower: 7 });
const MONTH_YEAR_LOOKUP = new Map();
for (const [yuan, pillars] of Object.entries(MONTH_YEAR_GROUPS)) {
  for (const pillar of pillars) {
    if (MONTH_YEAR_LOOKUP.has(pillar)) throw new Error("QIMEN_MONTH_SOURCE_TABLE_DUPLICATE");
    MONTH_YEAR_LOOKUP.set(pillar, Object.freeze({ dun: "yin", ju: MONTH_YEAR_JU[yuan], yuan }));
  }
}
if (MONTH_YEAR_LOOKUP.size !== 60) throw new Error("QIMEN_MONTH_SOURCE_TABLE_INCOMPLETE");

function canonicalError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function resolveMonthYearJu(yearPillarZh) {
  if (typeof yearPillarZh !== "string" || !/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/u.test(yearPillarZh)) {
    throw canonicalError("QIMEN_MONTH_YEAR_PILLAR_INVALID");
  }
  const result = MONTH_YEAR_LOOKUP.get(yearPillarZh);
  if (!result) throw canonicalError("QIMEN_MONTH_YEAR_PILLAR_INVALID");
  return result;
}

module.exports = Object.freeze({
  MONTH_YEAR_GROUPS,
  resolveMonthYearJu,
});
