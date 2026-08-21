"use strict";

const STEMS = Object.freeze(["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]);
const BRANCHES = Object.freeze(["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]);
const SIXTY = Object.freeze(Array.from({ length: 60 }, (_, index) => `${STEMS[index % 10]}${BRANCHES[index % 12]}`));
const XUN_HEADS = Object.freeze(["甲子", "甲戌", "甲申", "甲午", "甲辰", "甲寅"]);
const XUN_INSTRUMENTS = Object.freeze(["戊", "己", "庚", "辛", "壬", "癸"]);
const INSTRUMENTS = Object.freeze(["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"]);
const NATIVE_STARS = Object.freeze({
  1: "天蓬", 2: "天芮", 3: "天衝", 4: "天輔", 5: "天禽",
  6: "天心", 7: "天柱", 8: "天任", 9: "天英",
});
const NATIVE_DOORS = Object.freeze({
  1: "休門", 2: "死門", 3: "傷門", 4: "杜門",
  6: "開門", 7: "驚門", 8: "生門", 9: "景門",
});
const PALACE_DIRECTIONS = Object.freeze({
  1: "N", 2: "SW", 3: "E", 4: "SE", 5: "C",
  6: "NW", 7: "W", 8: "NE", 9: "S",
});
const DOOR_PALACE_CYCLES = Object.freeze({
  yang: Object.freeze([1, 2, 3, 4, 6, 7, 8, 9]),
  yin: Object.freeze([9, 8, 7, 6, 4, 3, 2, 1]),
});
const DOOR_NAME_CYCLES = Object.freeze({
  yang: Object.freeze(["休門", "死門", "傷門", "杜門", "開門", "驚門", "生門", "景門"]),
  yin: Object.freeze(["景門", "生門", "驚門", "開門", "杜門", "傷門", "死門", "休門"]),
});
const DEITY_PALACE_CYCLES = Object.freeze({
  yang: Object.freeze([1, 8, 3, 4, 9, 2, 7, 6]),
  yin: Object.freeze([9, 4, 3, 8, 1, 6, 7, 2]),
});
const DEITY_NAME_CYCLES = Object.freeze({
  yang: Object.freeze(["直符", "螣蛇", "太陰", "六合", "勾陳", "朱雀", "九地", "九天"]),
  yin: Object.freeze(["直符", "螣蛇", "太陰", "六合", "白虎", "玄武", "九地", "九天"]),
});
const CENTER_POLICY = "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1";

function canonicalError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function wrapPalace(value) {
  return ((value - 1) % 9 + 9) % 9 + 1;
}

function placeCycle(target, item, palaceCycle, itemCycle) {
  const targetIndex = palaceCycle.indexOf(target);
  const itemIndex = itemCycle.indexOf(item);
  if (targetIndex < 0 || itemIndex < 0) throw canonicalError("QIMEN_FEIPAN_INTERNAL_INVARIANT");
  const placed = new Map();
  for (let offset = 0; offset < palaceCycle.length; offset += 1) {
    const palace = palaceCycle[(targetIndex + offset) % palaceCycle.length];
    placed.set(palace, itemCycle[(itemIndex + offset) % itemCycle.length]);
  }
  return placed;
}

/**
 * Build the source-worked flying plate for an already resolved Dun/Ju and
 * subject pillar. Calendar/Ju resolution is deliberately outside this
 * function and remains fail-closed until its boundary table is signed.
 */
function buildFaqiaoFeipan(input) {
  if (!input || typeof input !== "object" || input.centerLodgingPolicy !== CENTER_POLICY) {
    throw canonicalError("QIMEN_CENTER_LODGING_POLICY_REQUIRED");
  }
  const { dun, ju, subjectPillarZh } = input;
  const subjectIndex = SIXTY.indexOf(subjectPillarZh);
  if ((dun !== "yang" && dun !== "yin")
    || !Number.isInteger(ju) || ju < 1 || ju > 9
    || subjectIndex < 0) {
    throw canonicalError("QIMEN_FEIPAN_INPUT_INVALID");
  }

  const sign = dun === "yang" ? 1 : -1;
  const centerLodgingPalace = dun === "yang" ? 8 : 2;
  const xunNumber = Math.floor(subjectIndex / 10);
  const xunHead = XUN_HEADS[xunNumber];
  const xunInstrument = XUN_INSTRUMENTS[xunNumber];
  const subjectStem = STEMS[subjectIndex % 10];
  const subjectInstrument = subjectStem === "甲" ? xunInstrument : subjectStem;

  const earthByPalace = new Map();
  const earthPalaceByInstrument = new Map();
  for (let index = 0; index < INSTRUMENTS.length; index += 1) {
    const palace = wrapPalace(ju + sign * index);
    const instrument = INSTRUMENTS[index];
    earthByPalace.set(palace, instrument);
    earthPalaceByInstrument.set(instrument, palace);
  }

  const xunSourcePalace = earthPalaceByInstrument.get(xunInstrument);
  const subjectTargetPalace = earthPalaceByInstrument.get(subjectInstrument);
  if (!xunSourcePalace || !subjectTargetPalace) throw canonicalError("QIMEN_FEIPAN_INTERNAL_INVARIANT");
  const heavenShift = subjectTargetPalace - xunSourcePalace;
  const heavenByPalace = new Map();
  const starByPalace = new Map();
  for (let sourcePalace = 1; sourcePalace <= 9; sourcePalace += 1) {
    const targetPalace = wrapPalace(sourcePalace + heavenShift);
    heavenByPalace.set(targetPalace, earthByPalace.get(sourcePalace));
    starByPalace.set(targetPalace, NATIVE_STARS[sourcePalace]);
  }

  const directSymbolStar = NATIVE_STARS[xunSourcePalace];
  const effectiveXunPalace = xunSourcePalace === 5 ? centerLodgingPalace : xunSourcePalace;
  const directEnvoyDoor = NATIVE_DOORS[effectiveXunPalace];
  if (!directEnvoyDoor) throw canonicalError("QIMEN_FEIPAN_INTERNAL_INVARIANT");

  const withinXunOffset = subjectIndex % 10;
  const rawDoorTarget = wrapPalace(xunSourcePalace + sign * withinXunOffset);
  const effectiveDoorTarget = rawDoorTarget === 5 ? centerLodgingPalace : rawDoorTarget;
  const doorByPalace = placeCycle(
    effectiveDoorTarget,
    directEnvoyDoor,
    DOOR_PALACE_CYCLES[dun],
    DOOR_NAME_CYCLES[dun],
  );

  const effectiveDeityTarget = subjectTargetPalace === 5 ? centerLodgingPalace : subjectTargetPalace;
  const deityByPalace = placeCycle(
    effectiveDeityTarget,
    "直符",
    DEITY_PALACE_CYCLES[dun],
    DEITY_NAME_CYCLES[dun],
  );

  const palaces = Object.freeze(Array.from({ length: 9 }, (_, index) => {
    const palace = index + 1;
    return Object.freeze({
      palace,
      direction: PALACE_DIRECTIONS[palace],
      earthInstrument: earthByPalace.get(palace),
      heavenInstrument: heavenByPalace.get(palace),
      star: starByPalace.get(palace),
      door: palace === 5 ? null : doorByPalace.get(palace),
      deity: palace === 5 ? null : deityByPalace.get(palace),
      centerRaw: palace === 5,
      centerLodgingPalace: palace === 5 ? centerLodgingPalace : null,
    });
  }));

  if (new Set(palaces.map((palace) => palace.earthInstrument)).size !== 9
    || new Set(palaces.map((palace) => palace.heavenInstrument)).size !== 9
    || new Set(palaces.map((palace) => palace.star)).size !== 9
    || new Set(palaces.filter((palace) => palace.door).map((palace) => palace.door)).size !== 8
    || new Set(palaces.filter((palace) => palace.deity).map((palace) => palace.deity)).size !== 8) {
    throw canonicalError("QIMEN_FEIPAN_INTERNAL_INVARIANT");
  }

  return Object.freeze({
    sourceFamily: "QIMEN_FAQIAO_FEIPAN",
    centerLodgingPolicy: CENTER_POLICY,
    dun,
    ju,
    subjectPillarZh,
    xunHead,
    xunInstrument,
    directSymbolStar,
    directEnvoyDoor,
    rawDoorTarget,
    effectiveDoorTarget,
    rawDeityTarget: subjectTargetPalace,
    effectiveDeityTarget,
    centerLodgingPalace,
    palaces,
  });
}

module.exports = Object.freeze({ buildFaqiaoFeipan });
