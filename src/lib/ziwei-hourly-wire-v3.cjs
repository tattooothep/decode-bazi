"use strict";

/**
 * Lossless wire V3, NOT a new evidence schema. No compression, recalculation or fetch.
 * Canonical UTF-8 JSON, unpadded base64url, outer key ziweiHourlyV3 (max 3500 chars).
 * Tuple: [3, strings, identity, month, day, hour]. Strings are interned at first
 * encounter in the traversal below; duplicate/unused/reordered tables are rejected.
 * identity: [accountId, profileId, lineage, calculationVersion, windowKey,
 *            validFrom, validUntil, snapshotDigest, url] (all string references).
 * month: [lunarMonth, isLeapMonth, effectiveMonth, ...layer]
 * day:   [dateISORef, lunarDay, ...layer]
 * hour:  [civilDateISORef, calculationDateISORef, timeIndex, ...layer]
 * layer: [ganzhiRef, mingBranchRef, mingPalaceNameRef, siHuaRows, flowRows]
 * siHuaRows: exactly 4 [starRef, typeRef, palaceNameRef|null, branchRef|null]
 * flowRows: exactly 10 [starRef, palaceNameRef, branchRef]. Row order is preserved.
 * Numeric identity values and booleans are unchanged; dates are exact strings.
 * Unpacking reconstructs EVERY V2 compact field (including v=2 and constants).
 * Domain/owner/time/source/digest validation remains the existing V2 parser's job.
 * Keep the backend ziwei-hourly-wire-v3.cjs algorithm in parity with this module.
 */
const ZIWEI_WIRE_V3_MAX_BASE64 = 3_500;
const IDENTITY = ["accountId", "profileId", "lineage", "calculationVersion", "windowKey",
    "validFrom", "validUntil", "snapshotDigest", "url"];
const BASE = ["ganzhi", "mingBranch", "mingPalaceName", "siHua", "flowStars"];
const MONTH = ["lunarMonth", "isLeapMonth", "effectiveMonth", ...BASE];
const DAY = ["dateISO", "lunarDay", ...BASE];
const HOUR = ["civilDateISO", "calculationDateISO", "timeIndex", ...BASE];
const invalid = () => { throw new TypeError("ziwei_wire_v3_invalid"); };
function array(value, length) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
        return invalid();
    const size = Object.getOwnPropertyDescriptor(value, "length");
    if (!size || !("value" in size) || size.value !== length || Reflect.ownKeys(value).length !== length + 1)
        return invalid();
    const result = [];
    for (let index = 0; index < length; index += 1) {
        const item = Object.getOwnPropertyDescriptor(value, String(index));
        if (!item || !("value" in item) || !item.enumerable)
            return invalid();
        result.push(item.value);
    }
    return result;
}
function record(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return invalid();
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || Reflect.ownKeys(value).length !== keys.length)
        return invalid();
    const result = {};
    for (const key of keys) {
        const item = Object.getOwnPropertyDescriptor(value, key);
        if (!item || !("value" in item) || !item.enumerable)
            return invalid();
        result[key] = item.value;
    }
    return result;
}
function integer(value, min, max) {
    return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)
        && value >= min && value <= max ? value : invalid();
}
/** Bounds are checked before table/row expansion; capture never invokes getters. */
function packZiweiHourlyWireV3(value) {
    try {
        const compact = record(value, ["v", "kind", "event", ...IDENTITY, "month", "day", "hour"]);
        if (compact.v !== 2 || compact.kind !== "ziwei" || compact.event !== "ziwei_hourly")
            return null;
        const strings = [];
        const indices = new Map();
        let characters = 0;
        const ref = (entry) => {
            if (typeof entry !== "string" || entry.length > 300)
                return invalid();
            const old = indices.get(entry);
            if (old !== undefined)
                return old;
            if (strings.length >= 128 || characters + entry.length > 6_000)
                return invalid();
            characters += entry.length;
            const index = strings.length;
            strings.push(entry);
            indices.set(entry, index);
            return index;
        };
        const layer = (entry) => [
            ref(entry.ganzhi), ref(entry.mingBranch), ref(entry.mingPalaceName),
            array(entry.siHua, 4).map((row) => array(row, 4).map((cell, index) => index >= 2 && cell === null ? null : ref(cell))),
            array(entry.flowStars, 10).map((row) => array(row, 3).map(ref)),
        ];
        const identity = IDENTITY.map((key) => ref(compact[key]));
        const m = record(compact.month, MONTH);
        const d = record(compact.day, DAY);
        const h = record(compact.hour, HOUR);
        if (typeof m.isLeapMonth !== "boolean")
            return null;
        const month = [integer(m.lunarMonth, 1, 12), m.isLeapMonth, integer(m.effectiveMonth, 1, 12), ...layer(m)];
        const day = [ref(d.dateISO), integer(d.lunarDay, 1, 30), ...layer(d)];
        const hour = [ref(h.civilDateISO), ref(h.calculationDateISO), integer(h.timeIndex, 0, 12), ...layer(h)];
        return [3, strings, identity, month, day, hour];
    }
    catch {
        return null;
    }
}
function unpackZiweiHourlyWireV3(value) {
    try {
        const tuple = array(value, 6);
        if (tuple[0] !== 3 || !Array.isArray(tuple[1]))
            return null;
        const size = Object.getOwnPropertyDescriptor(tuple[1], "length");
        if (!size || !("value" in size))
            return null;
        const strings = array(tuple[1], integer(size.value, 1, 128));
        let characters = 0;
        for (const entry of strings) {
            if (typeof entry !== "string" || entry.length > 300)
                return null;
            characters += entry.length;
            if (characters > 6_000)
                return null;
        }
        if (new Set(strings).size !== strings.length)
            return null;
        const ref = (entry) => strings[integer(entry, 0, strings.length - 1)];
        const layer = (entry) => ({
            ganzhi: ref(entry[0]), mingBranch: ref(entry[1]), mingPalaceName: ref(entry[2]),
            siHua: array(entry[3], 4).map((row) => array(row, 4).map((cell, index) => index >= 2 && cell === null ? null : ref(cell))),
            flowStars: array(entry[4], 10).map((row) => array(row, 3).map(ref)),
        });
        const identity = array(tuple[2], 9);
        const m = array(tuple[3], 8);
        const d = array(tuple[4], 7);
        const h = array(tuple[5], 8);
        if (typeof m[1] !== "boolean")
            return null;
        // Capture nested rows exactly once, before validating and serializing. Even a
        // hostile proxy cannot substitute a toJSON object between those operations.
        for (const [entry, offset] of [[m, 3], [d, 2], [h, 3]]) {
            entry[offset + 3] = array(entry[offset + 3], 4).map((row) => array(row, 4));
            entry[offset + 4] = array(entry[offset + 4], 10).map((row) => array(row, 3));
        }
        const result = { v: 2, kind: "ziwei", event: "ziwei_hourly" };
        IDENTITY.forEach((key, index) => { result[key] = ref(identity[index]); });
        result.month = { lunarMonth: integer(m[0], 1, 12), isLeapMonth: m[1], effectiveMonth: integer(m[2], 1, 12), ...layer(m.slice(3)) };
        result.day = { dateISO: ref(d[0]), lunarDay: integer(d[1], 1, 30), ...layer(d.slice(2)) };
        result.hour = { civilDateISO: ref(h[0]), calculationDateISO: ref(h[1]), timeIndex: integer(h[2], 0, 12), ...layer(h.slice(3)) };
        // Compare only captured arrays and validated primitives; never stringify untrusted objects.
        const captured = [3, strings, identity, m, d, h];
        return JSON.stringify(packZiweiHourlyWireV3(result)) === JSON.stringify(captured) ? result : null;
    }
    catch {
        return null;
    }
}
/** JSON grammar contains no objects, so duplicate object keys can never be accepted. */
function parseZiweiHourlyWireV3Json(json) {
    if (typeof json !== "string" || json.length === 0 || json.length > ZIWEI_WIRE_V3_MAX_BASE64)
        return null;
    try {
        const result = unpackZiweiHourlyWireV3(JSON.parse(json));
        return result && JSON.stringify(packZiweiHourlyWireV3(result)) === json ? result : null;
    }
    catch {
        return null;
    }
}

module.exports = Object.freeze({ ZIWEI_WIRE_V3_MAX_BASE64, packZiweiHourlyWireV3, unpackZiweiHourlyWireV3, parseZiweiHourlyWireV3Json });
