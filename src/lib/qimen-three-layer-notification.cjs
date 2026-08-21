"use strict";

const crypto = require("node:crypto");
const sourceManifestRuntime = require("./qimen-canonical-source-manifest.cjs");
const { buildFaqiaoFeipan } = require("./qimen-canonical-context-engine.cjs");

const TOP_INPUT_KEYS = Object.freeze([
  "event", "notificationId", "accountId", "purpose", "selectedDirection",
  "createdAt", "route", "hourDecision", "layers",
]);
const TOP_OUTPUT_KEYS = Object.freeze([
  "snapshotSchema", "event", "notificationId", "accountId", "purpose",
  "selectedDirection", "createdAt", "route", "hourDecision", "versionTuple",
  "sourceTuple", "layers", "selectedEvidence", "snapshotDigest",
]);
const DECISION_KEYS = Object.freeze(["direction", "purpose", "recommendationCode", "reasonCodes"]);
const LAYER_KEYS = Object.freeze([
  "kind", "calculationVersion", "sourceCode", "schoolCode", "validFrom", "validUntil",
  "centerLodgingPolicy", "stateCode", "explanationCodes", "conflictCodes", "unavailableCodes",
  "boundaryEvidence", "contextEvidence", "palaces",
]);
const BOUNDARY_EVIDENCE_KEYS = Object.freeze(["clock", "policy"]);
const CONTEXT_EVIDENCE_KEYS = Object.freeze([
  "dun", "ju", "subjectPillarZh", "yearPillarZh", "monthPillarZh", "dayPillarZh",
  "yearMonthBoundaryClock", "dayBoundaryPolicy", "centerEvidence",
]);
const CENTER_EVIDENCE_KEYS = Object.freeze([
  "policy", "sourceConflictCode", "rawCenterPalace", "effectiveLodgingPalace",
  "rawDoorTargetPalace", "effectiveDoorTargetPalace", "rawDeityTargetPalace", "effectiveDeityTargetPalace",
]);
const PALACE_KEYS = Object.freeze([
  "palace", "direction", "earthInstrument", "heavenInstrument", "starCode", "starZh",
  "doorCode", "doorZh", "deityCode", "deityZh", "formationCodes", "warningCodes",
  "clashCodes", "doorVigor", "starVigor", "isVoid", "isHorse",
]);
const LAYER_KINDS = Object.freeze(["month", "day", "hour"]);
const DIRECTIONS = Object.freeze(["N", "SW", "E", "SE", "C", "NW", "W", "NE", "S"]);
const ACTION_DIRECTIONS = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const SOURCE_CODES = Object.freeze({
  month: "QIMEN_FAQIAO_FEIPAN",
  day: "QIMEN_FAQIAO_FEIPAN",
  hour: "QIMEN_VERIFIED_ZHUANPAN_SHIJIA",
});
const SCHOOL_CODES = Object.freeze({
  month: "faqiao_feipan",
  day: "faqiao_feipan",
  hour: "zhuanpan_chai_bu",
});
const CENTER_POLICIES = Object.freeze({
  month: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
  day: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
  hour: "hour_engine_source_policy",
});
const DECISION_ROLES = Object.freeze({
  month: "raw_context_only",
  day: "raw_context_only",
  hour: "sole_action_authority",
});
const LAYER_EVIDENCE = Object.freeze({
  month: Object.freeze({
    stateCode: "raw_context",
    explanationCodes: Object.freeze(["MONTH_RAW_CONTEXT_ONLY"]),
    conflictCodes: Object.freeze(["CENTER_LODGING_SOURCE_CONFLICT_DECLARED"]),
    unavailableCodes: Object.freeze(["CONTEXT_VIGOR_NOT_DEFINED", "CONTEXT_CLASH_NOT_EVALUATED"]),
    boundaryEvidence: Object.freeze({
      clock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1",
      policy: "GLOBAL_JIE_MONTH_HALF_OPEN_V1",
    }),
  }),
  day: Object.freeze({
    stateCode: "raw_context",
    explanationCodes: Object.freeze(["DAY_RAW_CONTEXT_ONLY"]),
    conflictCodes: Object.freeze(["CENTER_LODGING_SOURCE_CONFLICT_DECLARED"]),
    unavailableCodes: Object.freeze(["CONTEXT_VIGOR_NOT_DEFINED", "CONTEXT_CLASH_NOT_EVALUATED"]),
    boundaryEvidence: Object.freeze({
      clock: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1",
      policy: "FOUR_QI_INTERSECT_TRUE_SOLAR_DAY_HALF_OPEN_V1",
    }),
  }),
  hour: Object.freeze({
    stateCode: "action_authority",
    explanationCodes: Object.freeze(["HOUR_SOLE_ACTION_AUTHORITY"]),
    conflictCodes: Object.freeze([]),
    unavailableCodes: Object.freeze([]),
    boundaryEvidence: Object.freeze({
      clock: "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1",
      policy: "TRUE_SOLAR_SHICHEN_HALF_OPEN_V1",
    }),
  }),
});
const PROVIDER_KEYS = Object.freeze([
  "v", "event", "accountId", "notificationId", "purpose", "direction",
  "hourStart", "hourEnd", "layers", "snapshotDigest", "url",
]);
const PROVIDER_LAYER_KEYS = Object.freeze([
  "version", "sourceCode", "deityCode", "deityZh", "doorCode", "doorZh", "starCode", "starZh",
]);
const PROVIDER_MAX_BYTES = 3_500;

function invalid() {
  const error = new TypeError("QIMEN_THREE_LAYER_SNAPSHOT_INVALID");
  error.code = "QIMEN_THREE_LAYER_SNAPSHOT_INVALID";
  return error;
}

function invalidProvider() {
  const error = new TypeError("QIMEN_V2_PROVIDER_PAYLOAD_INVALID");
  error.code = "QIMEN_V2_PROVIDER_PAYLOAD_INVALID";
  return error;
}

function sameKeys(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function captureRecord(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let prototype;
  let ownKeys;
  try {
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  if ((prototype !== Object.prototype && prototype !== null)
    || ownKeys.some((key) => typeof key !== "string")
    || (expectedKeys && !sameKeys(ownKeys, expectedKeys))) return null;
  const captured = Object.create(null);
  for (const key of ownKeys) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) return null;
    captured[key] = descriptor.value;
  }
  return captured;
}

function captureArray(value, minimum = 0, maximum = 100) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return null;
  let ownKeys;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  const expectedKeys = [...Array.from({ length: value.length }, (_, index) => String(index)), "length"];
  if (ownKeys.some((key) => typeof key !== "string") || !sameKeys(ownKeys, expectedKeys)) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || lengthDescriptor.enumerable !== false || !("value" in lengthDescriptor)) return null;
  const captured = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) return null;
    captured.push(descriptor.value);
  }
  return captured;
}

function cleanText(value, minimum = 1, maximum = 160) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function cleanCode(value, maximum = 96) {
  return cleanText(value, 1, maximum) && /^[A-Za-z0-9_:-]+$/u.test(value);
}

function validIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function readCodeArray(value) {
  const array = captureArray(value, 0, 16);
  if (!array || !array.every((entry) => cleanCode(entry)) || new Set(array).size !== array.length) return null;
  return Object.freeze([...array]);
}

function readPalace(value, index, layerKind) {
  const record = captureRecord(value, PALACE_KEYS);
  if (!record || record.palace !== index + 1 || record.direction !== DIRECTIONS[index]
    || !/^[甲乙丙丁戊己庚辛壬癸]$/u.test(record.earthInstrument)
    || !/^[甲乙丙丁戊己庚辛壬癸]$/u.test(record.heavenInstrument)
    || !cleanCode(record.starCode) || !cleanText(record.starZh, 1, 24)
    || typeof record.isVoid !== "boolean" || typeof record.isHorse !== "boolean") return null;
  const center = record.direction === "C";
  if (center) {
    if (record.doorCode !== null || record.doorZh !== null || record.deityCode !== null || record.deityZh !== null) return null;
  } else if (!cleanCode(record.doorCode) || !cleanText(record.doorZh, 1, 24)
    || !cleanCode(record.deityCode) || !cleanText(record.deityZh, 1, 24)) return null;
  const formationCodes = readCodeArray(record.formationCodes);
  const warningCodes = readCodeArray(record.warningCodes);
  const clashCodes = readCodeArray(record.clashCodes);
  const vigor = new Set(["旺", "相", "休", "囚", "死"]);
  if (!formationCodes || !warningCodes || !clashCodes) return null;
  if (layerKind === "hour") {
    if (!vigor.has(record.starVigor) || (!center && !vigor.has(record.doorVigor))
      || (center && record.doorVigor !== null)) return null;
  } else if (record.starVigor !== null || record.doorVigor !== null || clashCodes.length !== 0) return null;
  return Object.freeze({ ...record, formationCodes, warningCodes, clashCodes });
}

function readContextEvidence(value, palaces) {
  const record = captureRecord(value, CONTEXT_EVIDENCE_KEYS);
  const center = record ? captureRecord(record.centerEvidence, CENTER_EVIDENCE_KEYS) : null;
  if (!record || !center || !["yang", "yin"].includes(record.dun)
    || !Number.isInteger(record.ju) || record.ju < 1 || record.ju > 9
    || !/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/u.test(record.subjectPillarZh)
    || ![record.yearPillarZh, record.monthPillarZh, record.dayPillarZh]
      .every((pillar) => /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/u.test(pillar))
    || record.yearMonthBoundaryClock !== "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1"
    || record.dayBoundaryPolicy !== "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1"
    || center.policy !== CENTER_POLICIES.month
    || center.sourceConflictCode !== "FAQIAO_VOL2_SEASONAL_VS_VOL6_FIXED_YINYANG"
    || center.rawCenterPalace !== 5
    || center.effectiveLodgingPalace !== (record.dun === "yang" ? 8 : 2)) return null;
  let rebuilt;
  try {
    rebuilt = buildFaqiaoFeipan({
      dun: record.dun, ju: record.ju, subjectPillarZh: record.subjectPillarZh,
      centerLodgingPolicy: CENTER_POLICIES.month,
    });
  } catch {
    return null;
  }
  if (center.rawDoorTargetPalace !== rebuilt.rawDoorTarget
    || center.effectiveDoorTargetPalace !== rebuilt.effectiveDoorTarget
    || center.rawDeityTargetPalace !== rebuilt.rawDeityTarget
    || center.effectiveDeityTargetPalace !== rebuilt.effectiveDeityTarget
    || palaces.some((palace, index) => palace.earthInstrument !== rebuilt.palaces[index].earthInstrument
      || palace.heavenInstrument !== rebuilt.palaces[index].heavenInstrument
      || palace.starZh !== rebuilt.palaces[index].star
      || palace.doorZh !== rebuilt.palaces[index].door
      || palace.deityZh !== rebuilt.palaces[index].deity)) return null;
  return Object.freeze({ ...record, centerEvidence: Object.freeze({ ...center }) });
}

function readLayer(value, expectedKind, versions) {
  const record = captureRecord(value, LAYER_KEYS);
  const palacesInput = record ? captureArray(record.palaces, 9, 9) : null;
  const expectedEvidence = LAYER_EVIDENCE[expectedKind];
  const explanationCodes = record ? readCodeArray(record.explanationCodes) : null;
  const conflictCodes = record ? readCodeArray(record.conflictCodes) : null;
  const unavailableCodes = record ? readCodeArray(record.unavailableCodes) : null;
  const boundaryEvidence = record ? captureRecord(record.boundaryEvidence, BOUNDARY_EVIDENCE_KEYS) : null;
  if (!record || record.kind !== expectedKind || !palacesInput
    || record.calculationVersion !== versions[expectedKind].calculationVersion
    || record.sourceCode !== SOURCE_CODES[expectedKind]
    || record.schoolCode !== SCHOOL_CODES[expectedKind]
    || record.centerLodgingPolicy !== CENTER_POLICIES[expectedKind]
    || record.stateCode !== expectedEvidence.stateCode
    || !explanationCodes || !conflictCodes || !unavailableCodes || !boundaryEvidence
    || canonicalStringify(explanationCodes) !== canonicalStringify(expectedEvidence.explanationCodes)
    || canonicalStringify(conflictCodes) !== canonicalStringify(expectedEvidence.conflictCodes)
    || canonicalStringify(unavailableCodes) !== canonicalStringify(expectedEvidence.unavailableCodes)
    || boundaryEvidence.clock !== expectedEvidence.boundaryEvidence.clock
    || boundaryEvidence.policy !== expectedEvidence.boundaryEvidence.policy
    || !validIso(record.validFrom) || !validIso(record.validUntil)
    || Date.parse(record.validFrom) >= Date.parse(record.validUntil)) return null;
  if (expectedKind !== "hour") {
    try {
      sourceManifestRuntime.assertAllowedContextVersion(expectedKind, record.calculationVersion);
    } catch {
      return null;
    }
  }
  const palaces = palacesInput.map((palace, index) => readPalace(palace, index, expectedKind));
  if (palaces.some((palace) => !palace)) return null;
  if (new Set(palaces.map((palace) => palace.earthInstrument)).size !== 9
    || new Set(palaces.map((palace) => palace.heavenInstrument)).size !== 9
    || new Set(palaces.map((palace) => palace.starCode)).size !== 9
    || new Set(palaces.filter((palace) => palace.direction !== "C").map((palace) => palace.doorCode)).size !== 8
    || new Set(palaces.filter((palace) => palace.direction !== "C").map((palace) => palace.deityCode)).size !== 8) return null;
  const contextEvidence = expectedKind === "hour"
    ? (record.contextEvidence === null ? null : undefined)
    : readContextEvidence(record.contextEvidence, palaces);
  if (contextEvidence === undefined || (expectedKind !== "hour" && !contextEvidence)) return null;
  return Object.freeze({
    ...record,
    explanationCodes,
    conflictCodes,
    unavailableCodes,
    boundaryEvidence: Object.freeze({ ...boundaryEvidence }),
    contextEvidence,
    decisionRole: DECISION_ROLES[expectedKind],
    palaces: Object.freeze(palaces),
  });
}

function readDecision(value, purpose, selectedDirection) {
  const record = captureRecord(value, DECISION_KEYS);
  const reasonCodes = record ? readCodeArray(record.reasonCodes) : null;
  if (!record || record.direction !== selectedDirection || record.purpose !== purpose
    || record.recommendationCode !== "recommended" || !reasonCodes || reasonCodes.length === 0) return null;
  return Object.freeze({ ...record, reasonCodes });
}

function selectedTuple(layer, direction) {
  const palace = layer.palaces.find((candidate) => candidate.direction === direction);
  if (!palace || !palace.deityCode || !palace.deityZh || !palace.doorCode || !palace.doorZh) return null;
  return Object.freeze({
    direction,
    deityCode: palace.deityCode,
    deityZh: palace.deityZh,
    doorCode: palace.doorCode,
    doorZh: palace.doorZh,
    starCode: palace.starCode,
    starZh: palace.starZh,
  });
}

function canonicalClone(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const array = captureArray(value, 0, 10_000);
  if (array) {
    const cloned = array.map(canonicalClone);
    return cloned.some((entry) => entry === undefined) ? undefined : cloned;
  }
  const record = captureRecord(value);
  if (!record) return undefined;
  const cloned = Object.create(null);
  for (const key of Object.keys(record).sort()) {
    const entry = canonicalClone(record[key]);
    if (entry === undefined) return undefined;
    cloned[key] = entry;
  }
  return cloned;
}

function canonicalStringify(value) {
  const cloned = canonicalClone(value);
  if (cloned === undefined) throw invalid();
  return JSON.stringify(cloned);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

function buildQimenThreeLayerSnapshot(input) {
  const top = captureRecord(input, TOP_INPUT_KEYS);
  const layersRecord = top ? captureRecord(top.layers, LAYER_KINDS) : null;
  const manifest = sourceManifestRuntime.loadCanonicalSourceManifest();
  if (!top || !layersRecord || top.event !== "qimen_three_layer"
    || !cleanCode(top.notificationId, 128) || !cleanCode(top.accountId, 128)
    || !cleanCode(top.purpose, 48) || !ACTION_DIRECTIONS.has(top.selectedDirection)
    || !validIso(top.createdAt) || top.route !== "/qimen/notification-detail") throw invalid();

  const layers = Object.create(null);
  for (const kind of LAYER_KINDS) {
    layers[kind] = readLayer(layersRecord[kind], kind, manifest.layers);
    if (!layers[kind]) throw invalid();
  }
  const hourDecision = readDecision(top.hourDecision, top.purpose, top.selectedDirection);
  if (!hourDecision) throw invalid();

  const hourStart = Date.parse(layers.hour.validFrom);
  const hourEnd = Date.parse(layers.hour.validUntil);
  for (const kind of ["month", "day"]) {
    if (hourStart < Date.parse(layers[kind].validFrom) || hourEnd > Date.parse(layers[kind].validUntil)) throw invalid();
  }
  const createdAt = Date.parse(top.createdAt);
  if (createdAt > hourEnd || createdAt < hourStart - 24 * 60 * 60 * 1_000) throw invalid();

  const selectedEvidence = Object.create(null);
  for (const kind of LAYER_KINDS) {
    selectedEvidence[kind] = selectedTuple(layers[kind], top.selectedDirection);
    if (!selectedEvidence[kind]) throw invalid();
  }
  const versionTuple = Object.freeze(Object.fromEntries(LAYER_KINDS.map((kind) => [kind, layers[kind].calculationVersion])));
  const sourceTuple = Object.freeze({
    month: Object.freeze({
      code: layers.month.sourceCode,
      sourceDigest: manifest.source.digest,
    }),
    day: Object.freeze({
      code: layers.day.sourceCode,
      sourceDigest: manifest.source.digest,
    }),
    hour: Object.freeze({
      code: layers.hour.sourceCode,
      engineContractVersion: manifest.layers.hour.engineContractVersion,
      engineSourceDigest: manifest.layers.hour.engineSourceDigest,
      engineProfile: manifest.layers.hour.engineProfileId,
    }),
  });
  const base = {
    snapshotSchema: 2,
    event: top.event,
    notificationId: top.notificationId,
    accountId: top.accountId,
    purpose: top.purpose,
    selectedDirection: top.selectedDirection,
    createdAt: top.createdAt,
    route: top.route,
    hourDecision,
    versionTuple,
    sourceTuple,
    layers: Object.freeze({ ...layers }),
    selectedEvidence: Object.freeze({ ...selectedEvidence }),
  };
  const snapshotDigest = crypto.createHash("sha256").update(canonicalStringify(base)).digest("hex");
  return deepFreeze({ ...base, snapshotDigest });
}

function verifyQimenThreeLayerSnapshot(snapshot) {
  const clone = canonicalClone(snapshot);
  if (!clone || !sameKeys(Object.keys(clone), TOP_OUTPUT_KEYS)
    || clone.snapshotSchema !== 2 || !/^[a-f0-9]{64}$/u.test(clone.snapshotDigest)) return false;
  try {
    const input = {
      event: clone.event,
      notificationId: clone.notificationId,
      accountId: clone.accountId,
      purpose: clone.purpose,
      selectedDirection: clone.selectedDirection,
      createdAt: clone.createdAt,
      route: clone.route,
      hourDecision: clone.hourDecision,
      layers: Object.fromEntries(LAYER_KINDS.map((kind) => {
        const { decisionRole: _decisionRole, ...layer } = clone.layers[kind];
        return [kind, layer];
      })),
    };
    const rebuilt = buildQimenThreeLayerSnapshot(input);
    return canonicalStringify(rebuilt) === canonicalStringify(clone);
  } catch {
    return false;
  }
}

function parseJsonWithoutDuplicateKeys(text) {
  let cursor = 0;
  let nodeCount = 0;
  const maximumDepth = 32;

  function skipWhitespace() {
    while (/[\u0020\t\r\n]/u.test(text[cursor] || "")) cursor += 1;
  }

  function parseString() {
    if (text[cursor] !== "\"") throw invalidProvider();
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      const character = text[cursor];
      if (character === "\"") {
        cursor += 1;
        try {
          return JSON.parse(text.slice(start, cursor));
        } catch {
          throw invalidProvider();
        }
      }
      if (character === "\\") {
        cursor += 1;
        if (cursor >= text.length) throw invalidProvider();
        if (text[cursor] === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(cursor + 1, cursor + 5))) throw invalidProvider();
          cursor += 5;
          continue;
        }
        if (!"\"\\/bfnrt".includes(text[cursor])) throw invalidProvider();
        cursor += 1;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) throw invalidProvider();
      cursor += 1;
    }
    throw invalidProvider();
  }

  function parseValue(depth) {
    if (depth > maximumDepth || ++nodeCount > 1_000) throw invalidProvider();
    skipWhitespace();
    const character = text[cursor];
    if (character === "\"") return parseString();
    if (character === "{") {
      cursor += 1;
      skipWhitespace();
      const record = Object.create(null);
      const keys = new Set();
      if (text[cursor] === "}") {
        cursor += 1;
        return record;
      }
      while (cursor < text.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) throw invalidProvider();
        keys.add(key);
        skipWhitespace();
        if (text[cursor] !== ":") throw invalidProvider();
        cursor += 1;
        record[key] = parseValue(depth + 1);
        skipWhitespace();
        if (text[cursor] === "}") {
          cursor += 1;
          return record;
        }
        if (text[cursor] !== ",") throw invalidProvider();
        cursor += 1;
      }
      throw invalidProvider();
    }
    if (character === "[") {
      cursor += 1;
      skipWhitespace();
      const array = [];
      if (text[cursor] === "]") {
        cursor += 1;
        return array;
      }
      while (cursor < text.length) {
        array.push(parseValue(depth + 1));
        skipWhitespace();
        if (text[cursor] === "]") {
          cursor += 1;
          return array;
        }
        if (text[cursor] !== ",") throw invalidProvider();
        cursor += 1;
      }
      throw invalidProvider();
    }
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(literal, cursor)) {
        cursor += literal.length;
        return value;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(cursor));
    if (!number) throw invalidProvider();
    cursor += number[0].length;
    const parsed = Number(number[0]);
    if (!Number.isFinite(parsed)) throw invalidProvider();
    return parsed;
  }

  const result = parseValue(0);
  skipWhitespace();
  if (cursor !== text.length) throw invalidProvider();
  return result;
}

function providerLayer(snapshot, kind) {
  const evidence = snapshot.selectedEvidence[kind];
  return Object.freeze({
    version: snapshot.versionTuple[kind],
    sourceCode: snapshot.sourceTuple[kind].code,
    deityCode: evidence.deityCode,
    deityZh: evidence.deityZh,
    doorCode: evidence.doorCode,
    doorZh: evidence.doorZh,
    starCode: evidence.starCode,
    starZh: evidence.starZh,
  });
}

function buildQimenV2ProviderData(snapshot) {
  if (!verifyQimenThreeLayerSnapshot(snapshot)) throw invalidProvider();
  const compact = Object.freeze({
    v: 2,
    event: "qimen_three_layer",
    accountId: snapshot.accountId,
    notificationId: snapshot.notificationId,
    purpose: snapshot.purpose,
    direction: snapshot.selectedDirection,
    hourStart: snapshot.layers.hour.validFrom,
    hourEnd: snapshot.layers.hour.validUntil,
    layers: Object.freeze(Object.fromEntries(LAYER_KINDS.map((kind) => [kind, providerLayer(snapshot, kind)]))),
    snapshotDigest: snapshot.snapshotDigest,
    url: "/qimen/notification-detail",
  });
  const qimenV2 = canonicalStringify(compact);
  if (Buffer.byteLength(qimenV2, "utf8") >= PROVIDER_MAX_BYTES) throw invalidProvider();
  const outer = Object.freeze({ qimenV2 });
  parseQimenV2ProviderData(outer);
  return outer;
}

function parseProviderLayer(value, kind, manifest) {
  const record = captureRecord(value, PROVIDER_LAYER_KEYS);
  if (!record || record.version !== manifest.layers[kind].calculationVersion
    || record.sourceCode !== SOURCE_CODES[kind]
    || !cleanCode(record.deityCode) || !cleanText(record.deityZh, 1, 24)
    || !cleanCode(record.doorCode) || !cleanText(record.doorZh, 1, 24)
    || !cleanCode(record.starCode) || !cleanText(record.starZh, 1, 24)) return null;
  return Object.freeze({ ...record });
}

function parseQimenV2ProviderData(value) {
  const outer = captureRecord(value, ["qimenV2"]);
  if (!outer || typeof outer.qimenV2 !== "string"
    || Buffer.byteLength(outer.qimenV2, "utf8") >= PROVIDER_MAX_BYTES) throw invalidProvider();
  let parsed;
  try {
    parsed = parseJsonWithoutDuplicateKeys(outer.qimenV2);
  } catch {
    throw invalidProvider();
  }
  const record = captureRecord(parsed, PROVIDER_KEYS);
  const layersRecord = record ? captureRecord(record.layers, LAYER_KINDS) : null;
  if (!record || !layersRecord || canonicalStringify(parsed) !== outer.qimenV2
    || record.v !== 2 || record.event !== "qimen_three_layer"
    || !cleanCode(record.accountId, 128) || !cleanCode(record.notificationId, 128)
    || !cleanCode(record.purpose, 48) || !ACTION_DIRECTIONS.has(record.direction)
    || !validIso(record.hourStart) || !validIso(record.hourEnd)
    || Date.parse(record.hourEnd) - Date.parse(record.hourStart) < 90 * 60_000
    || Date.parse(record.hourEnd) - Date.parse(record.hourStart) > 150 * 60_000
    || !/^[a-f0-9]{64}$/u.test(record.snapshotDigest) || /^0{64}$/u.test(record.snapshotDigest)
    || record.url !== "/qimen/notification-detail") throw invalidProvider();
  const manifest = sourceManifestRuntime.loadCanonicalSourceManifest();
  const layers = Object.create(null);
  for (const kind of LAYER_KINDS) {
    layers[kind] = parseProviderLayer(layersRecord[kind], kind, manifest);
    if (!layers[kind]) throw invalidProvider();
  }
  return deepFreeze({ ...record, layers: { ...layers } });
}

module.exports = Object.freeze({
  buildQimenV2ProviderData,
  buildQimenThreeLayerSnapshot,
  canonicalStringify,
  parseQimenV2ProviderData,
  verifyQimenThreeLayerSnapshot,
});
