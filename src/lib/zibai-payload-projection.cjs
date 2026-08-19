"use strict";

const notificationPayload = require("./notification-payload.cjs");
const zibaiRuleRuntime = require("./zibai-three-layer-runtime.cjs");

const DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"]);
const FOCUS_STARS = Object.freeze([1, 2, 5, 9]);

function parseRequestedZibaiSchema(value) {
  if (value === null) return 1;
  if (value === "1") return 1;
  if (value === "2") return 2;
  throw new TypeError("zibai_history_schema_invalid");
}

function requestedSchema(value) {
  if (value === 1 || value === 2) return value;
  throw new TypeError("zibai_history_schema_invalid");
}

function factsFromEnvelope(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  let prototype;
  let ownKeys;
  try {
    prototype = Object.getPrototypeOf(payload);
    ownKeys = Reflect.ownKeys(payload);
  } catch {
    return null;
  }
  if ((prototype !== Object.prototype && prototype !== null)
    || ownKeys.some((key) => typeof key !== "string")) return null;
  const captured = Object.create(null);
  for (const key of ownKeys) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(payload, key);
    } catch {
      return null;
    }
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) return null;
    captured[key] = descriptor.value;
  }
  if (captured.v !== 1 || captured.kind !== "zibai" || typeof captured.accountId !== "string") return null;
  const facts = Object.create(null);
  for (const key of ownKeys) {
    if (key !== "v" && key !== "kind" && key !== "accountId") facts[key] = captured[key];
  }
  return { accountId: captured.accountId, facts };
}

function directionForStar(palaces, star) {
  const direction = DIRECTIONS.find((candidate) => palaces[candidate] === star);
  if (!direction) throw new TypeError("zibai_history_payload_invalid");
  return direction;
}

function v1FactsFromV2(facts) {
  const daily = facts.event === "zibai_daily";
  const shichen = daily ? null : facts.shichen;
  const focus = FOCUS_STARS.map((star) => {
    const dayDirection = directionForStar(facts.day.palaces, star);
    const shichenDirection = shichen ? directionForStar(shichen.palaces, star) : null;
    return Object.freeze({
      star,
      dayDirection,
      dayRelation: zibaiRuleRuntime.starPalaceRelation(star, dayDirection),
      shichenDirection,
      shichenRelation: shichenDirection
        ? zibaiRuleRuntime.starPalaceRelation(star, shichenDirection)
        : null,
      overlaps: shichenDirection !== null && dayDirection === shichenDirection,
    });
  });
  return Object.freeze({
    event: facts.event,
    referenceId: facts.referenceId,
    calculationVersion: facts.calculationVersion,
    apparentSolarDate: facts.day.apparentSolarDate,
    shichenKey: shichen?.key ?? null,
    startAt: shichen?.startAt ?? facts.day.startAt,
    endAt: shichen?.endAt ?? facts.day.endAt,
    dayPalaces: facts.day.palaces,
    shichenPalaces: shichen?.palaces ?? null,
    focus: Object.freeze(focus),
    url: facts.url,
  });
}

function projectZibaiPayload(payload, requestedSchemaInput) {
  const schema = requestedSchema(requestedSchemaInput);
  const captured = factsFromEnvelope(payload);
  if (!captured) throw new TypeError("zibai_history_payload_invalid");
  let canonical;
  try {
    canonical = notificationPayload.buildNotificationPayload("zibai", captured.accountId, captured.facts);
  } catch {
    throw new TypeError("zibai_history_payload_invalid");
  }
  const storedSchema = canonical.snapshotSchema === 2 ? 2 : 1;
  if (storedSchema === 1 || schema === 2) return payload;
  return notificationPayload.buildNotificationPayload(
    "zibai",
    captured.accountId,
    v1FactsFromV2(canonical),
  );
}

module.exports = Object.freeze({ parseRequestedZibaiSchema, projectZibaiPayload });
