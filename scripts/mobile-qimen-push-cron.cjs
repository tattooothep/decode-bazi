#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const payloadRuntime = require("../src/lib/qimen-three-layer-notification.cjs");
const componentCatalog = require("../src/lib/qimen-component-catalog.cjs");
const sourceManifestRuntime = require("../src/lib/qimen-canonical-source-manifest.cjs");
const canonicalOccurrenceRuntime = require("../src/lib/qimen-canonical-occurrence-builder.cjs");
const qimenAdvisory = require("../src/lib/qimen-notification-advisory.cjs");
const localEngineRuntime = require("../src/lib/qimen-local-engine-pool.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");
const { writeSchedulerHeartbeat } = require("../src/lib/notification-scheduler-heartbeat.cjs");

const DRY = process.argv.includes("--dry");
const BATCH = Math.max(1, Math.min(500, Number((process.argv.find((arg) => arg.startsWith("--batch=")) || "--batch=500").slice(8))));
const MAX_PER_RUN = Math.max(1, Math.min(10_000, Number((process.argv.find((arg) => arg.startsWith("--max-per-run=")) || "--max-per-run=2500").slice(14))));
const WORKERS = Math.max(1, Math.min(20, Number((process.argv.find((arg) => arg.startsWith("--workers=")) || "--workers=1").slice(10))));
const SOURCE_DIGEST = "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460";
const LOCATION_LEASE_MS = 7 * 24 * 60 * 60 * 1_000;
const PROVIDER_TTL_MS = 5 * 60 * 1_000;
const BOUNDARY_STABILIZATION_MS = 5 * 60 * 1_000;
// The engine intentionally marks the first five minutes around a true-solar
// shichen boundary as caution. Keep a second five-minute interval in which a
// stable, science-approved direction can actually be admitted for delivery.
const SEND_GRACE_MS = 10 * 60 * 1_000;

(function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/gu, "");
  }
})();

function localMinute(timezone, at) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at);
    const value = (type) => Number(parts.find((part) => part.type === type)?.value);
    return (value("hour") % 24) * 60 + value("minute");
  } catch {
    return null;
  }
}

function localDateTime(timezone, at) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at);
    const value = (type) => parts.find((part) => part.type === type)?.value;
    const date = `${value("year")}-${value("month")}-${value("day")}`;
    const time = `${value("hour")}:${value("minute")}`;
    return /^\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}$/u.test(`${date}|${time}`) ? { date, time } : null;
  } catch {
    return null;
  }
}

function inQuietHours(minute, startHour, endHour) {
  if (!Number.isInteger(minute)) return true;
  const start = Number(startHour) * 60;
  const end = Number(endHour) * 60;
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function occurrenceKey(row, snapshot) {
  const canonical = payloadRuntime.canonicalStringify({
    accountId: String(row.user_id),
    installationId: String(row.installation_id),
    purpose: String(row.purpose),
    hourValidFrom: snapshot.layers.hour.validFrom,
    versionTuple: snapshot.versionTuple,
    selectedDirection: snapshot.selectedDirection,
  });
  return `qimen|${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

function admissionDecision(row, snapshot, at) {
  const now = at instanceof Date ? at : new Date(at);
  const start = new Date(snapshot?.layers?.hour?.validFrom);
  const end = new Date(snapshot?.layers?.hour?.validUntil);
  if (!Number.isFinite(now.valueOf()) || !Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf()) || start >= end) {
    return { allow: false, reason: "snapshot_window_invalid" };
  }
  if (inQuietHours(localMinute(row.location_timezone, now), Number(row.quiet_start), Number(row.quiet_end))) {
    return { allow: false, reason: "quiet_hours" };
  }
  if (now < start) return { allow: false, reason: "occurrence_not_started" };
  const sendDeadline = new Date(start.valueOf() + SEND_GRACE_MS);
  if (now >= sendDeadline) return { allow: false, reason: "late_occurrence" };
  if (end.valueOf() <= now.valueOf() + PROVIDER_TTL_MS) return { allow: false, reason: "provider_safety_window" };
  return { allow: true, sendDeadline: sendDeadline.toISOString() };
}

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

function buildQimenCopy(locale, snapshot) {
  if (!payloadRuntime.verifyQimenThreeLayerSnapshotV3(snapshot)) throw new TypeError("qimen_snapshot_invalid");
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

function buildQimenNotice(row, snapshot, occurrenceId, sendDeadline) {
  if (!payloadRuntime.verifyQimenThreeLayerSnapshotV3(snapshot)) throw new TypeError("qimen_snapshot_invalid");
  const payload = payloadRuntime.buildQimenV3ProviderData(snapshot);
  const historyCopies = delivery.localizedHistoryCopies((locale) => buildQimenCopy(locale, snapshot));
  const locale = notificationPayload.normalizedLocale(row.token_locale);
  const providerCopy = buildQimenCopy(locale, snapshot);
  return Object.freeze({
    userId: row.user_id,
    key: occurrenceKey(row, snapshot),
    kind: "qimen",
    qimenOccurrenceId: occurrenceId,
    ...historyCopies.th,
    historyCopies,
    payload,
    sourceFacts: Object.freeze({
      eventEndAt: snapshot.layers.hour.validUntil,
      sendDeadline,
      snapshotDigest: snapshot.snapshotDigest,
      selectedDirection: snapshot.selectedDirection,
      calculationVersion: snapshot.versionTuple.hour,
    }),
    messages: Object.freeze([Object.freeze({
      tokenId: row.token_id,
      deviceToken: row.device_push_token,
      deviceTokenType: row.device_token_type,
      expoToken: row.expo_push_token,
      platform: row.platform,
      locale,
      category: "qimen",
      ...providerCopy,
      url: "/qimen/notification-detail",
      data: payload,
    })]),
  });
}

async function claimDue(db, at, limit = BATCH) {
  const bounded = Math.max(1, Math.min(10_000, Number(limit) || BATCH));
  const result = await db.query(
    "SELECT * FROM claim_mobile_qimen_installations($1::timestamptz,$2::integer)",
    [at.toISOString(), bounded],
  );
  return result.rows;
}

async function loadClaimContext(db, claim) {
  const result = await db.query(
    `SELECT q.*,t.id AS token_id,t.device_push_token,t.device_token_type,t.expo_push_token,t.platform,
            t.locale AS token_locale,t.qimen_payload_schema,COALESCE(np.privacy_preview,false) AS privacy_preview,
            np.paused_until,u.tier,u.sub_expires_at,u.trial_ends_at
       FROM mobile_qimen_installations q
       JOIN mobile_push_tokens t ON t.user_id=q.user_id AND t.installation_id=q.installation_id AND t.enabled=true
       JOIN users u ON u.id=q.user_id AND u.deleted_at IS NULL AND u.is_active=true
       LEFT JOIN mobile_notification_prefs np ON np.user_id=q.user_id
      WHERE q.user_id=$1 AND q.installation_id=$2 AND q.lease_token=$3`,
    [claim.user_id, claim.installation_id, claim.lease_token],
  );
  return result.rows[0] || null;
}

function nextDueAt(row, at) {
  const window = qimenAdvisory.trueSolarShichenWindow({
    timezone: row.location_timezone,
    longitude: Number(row.longitude),
    instant: at.toISOString(),
  });
  const next = new Date(window.endAt);
  if (!Number.isFinite(next.valueOf()) || next <= at) throw new Error("qimen_next_due_unavailable");
  return next;
}

function retryableEngineFailure(error) {
  const code = String(error?.code || error?.cause?.code || "");
  const message = String(error?.message || "");
  if (/^QIMEN_/u.test(code) || /^QIMEN_/u.test(message)) return false;
  if (/^(?:ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|UND_ERR_[A-Z_]+)$/u.test(code)) return true;
  if (/^(?:AbortError|TimeoutError)$/u.test(String(error?.name || ""))) return true;
  if (/fetch failed|network|socket|timed?\s*out/iu.test(message)) return true;
  const http = /qimen_notification_engine_http_(\d{1,3})/u.exec(message);
  return Boolean(http && ([408, 425, 429].includes(Number(http[1])) || Number(http[1]) >= 500));
}

function engineRetryAt(canonicalWindow, at) {
  const deadline = Date.parse(canonicalWindow?.startAt) + SEND_GRACE_MS;
  const retryAt = new Date(at.valueOf() + 60_000);
  return Number.isFinite(deadline) && retryAt.valueOf() < deadline ? retryAt : null;
}

function engineFailureReason(error, retrying) {
  const raw = String(error?.code || error?.cause?.code || error?.message || "engine_unavailable")
    .replace(/[^A-Za-z0-9_:-]/gu, "_").slice(0, retrying ? 83 : 96) || "engine_unavailable";
  return retrying ? `engine_retry_${raw}` : raw;
}

async function finishClaim(db, row, at, next, reason) {
  await db.query(
    `UPDATE mobile_qimen_installations SET next_due_at=$4,last_skip_reason=$5,
       lease_token=NULL,lease_expires_at=NULL,updated_at=$6
      WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3`,
    [row.user_id, row.installation_id, row.lease_token, next.toISOString(), reason, at.toISOString()],
  );
}

async function admitOccurrence(db, row, snapshot, sendDeadline) {
  const key = occurrenceKey(row, snapshot);
  // A single INSERT is already atomic and both unique constraints are the
  // concurrency fence. Avoid wrapping the normal path in an extra BEGIN/
  // COMMIT round trip; a conflict waits for its winner before returning.
  const inserted = await db.query(
    `INSERT INTO mobile_qimen_occurrences
     (user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,
      selected_direction,version_tuple,source_tuple,snapshot,snapshot_digest,state)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,'claimed')
     ON CONFLICT DO NOTHING RETURNING id,snapshot,send_deadline`,
    [row.user_id, row.installation_id, key, row.purpose,
      snapshot.layers.hour.validFrom, snapshot.layers.hour.validUntil, sendDeadline,
      snapshot.selectedDirection, JSON.stringify(snapshot.versionTuple), JSON.stringify(snapshot.sourceTuple),
      JSON.stringify(snapshot), snapshot.snapshotDigest],
  );
  let admitted = inserted.rows[0] || null;
  if (!admitted) {
    const logical = await db.query(
      `SELECT id,state,push_log_id,snapshot,send_deadline FROM mobile_qimen_occurrences
        WHERE user_id=$1 AND installation_id=$2 AND purpose=$3 AND hour_valid_from=$4`,
      [row.user_id, row.installation_id, row.purpose, snapshot.layers.hour.validFrom],
    );
    const persisted = logical.rows[0];
    if (persisted?.state === "claimed" && persisted.push_log_id === null
      && payloadRuntime.verifyQimenThreeLayerSnapshotV3(persisted.snapshot)) admitted = persisted;
  }
  return admitted ? Object.freeze({
    id: admitted.id,
    snapshot: admitted.snapshot,
    sendDeadline: new Date(admitted.send_deadline).toISOString(),
    recovered: !inserted.rows[0],
  }) : null;
}

async function loadRecoverableOccurrence(db, row, canonicalWindow) {
  const result = await db.query(
    `SELECT id,state,push_log_id,snapshot,send_deadline
       FROM mobile_qimen_occurrences
      WHERE user_id=$1 AND installation_id=$2 AND purpose=$3 AND hour_valid_from=$4
      LIMIT 1`,
    [row.user_id, row.installation_id, row.purpose, canonicalWindow.startAt],
  );
  const persisted = result.rows[0];
  if (persisted?.state !== "claimed" || persisted.push_log_id !== null
    || !payloadRuntime.verifyQimenThreeLayerSnapshotV3(persisted.snapshot)) return null;
  return Object.freeze({
    id: persisted.id,
    snapshot: persisted.snapshot,
    sendDeadline: new Date(persisted.send_deadline).toISOString(),
    recovered: true,
  });
}

async function defaultBuildCanonicalOccurrence(row, at, options = {}) {
  return canonicalOccurrenceRuntime.buildCanonicalQimenOccurrence(row, at, {
    signal: options.signal,
    fetchCanonicalQimenEngineSnapshot: options.fetchCanonicalQimenEngineSnapshot,
  });
}

function createEngineSnapshotMemo(fetchSnapshot = qimenAdvisory.fetchCanonicalQimenEngineSnapshot) {
  if (typeof fetchSnapshot !== "function") throw new TypeError("qimen_engine_fetcher_invalid");
  const cache = new Map();
  return async (input, options = {}) => {
    options.signal?.throwIfAborted();
    const key = payloadRuntime.canonicalStringify({
      date: input?.date, time: input?.time, timezone: input?.timezone, instant: input?.instant,
      lat: input?.lat, lng: input?.lng,
    });
    let pending = cache.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() => fetchSnapshot(input, options));
      cache.set(key, pending);
    }
    try {
      const snapshot = await pending;
      options.signal?.throwIfAborted();
      return snapshot;
    } catch (error) {
      if (cache.get(key) === pending) cache.delete(key);
      throw error;
    }
  };
}

async function processClaim(db, claim, at, dependencies = {}) {
  dependencies.signal?.throwIfAborted();
  const row = await loadClaimContext(db, claim);
  if (!row) {
    await db.query(
      "DELETE FROM mobile_qimen_installations WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3",
      [claim.user_id, claim.installation_id, claim.lease_token],
    );
    return { reserved: 0, skipped: 1, reason: "owner_invalid" };
  }
  let next;
  try {
    next = nextDueAt(row, at);
  } catch {
    next = new Date(at.valueOf() + 2 * 60 * 60 * 1_000);
  }
  let reason = null;
  const capturedAt = row.location_captured_at ? new Date(row.location_captured_at) : null;
  const expiresAt = row.location_expires_at ? new Date(row.location_expires_at) : null;
  const locationFresh = capturedAt && expiresAt && capturedAt <= at && expiresAt > at
    && at.valueOf() - capturedAt.valueOf() <= LOCATION_LEASE_MS
    && (row.location_permission === "foreground" || row.location_permission === "background")
    && Number.isFinite(Number(row.longitude)) && row.location_timezone;
  if (!locationFresh) reason = "location_stale";
  else if (Number(row.qimen_payload_schema) !== 3) reason = "payload_capability_missing";
  else if (row.paused_until && new Date(row.paused_until) > at) reason = "paused";
  else if (inQuietHours(localMinute(row.location_timezone, at), Number(row.quiet_start), Number(row.quiet_end))) reason = "quiet_hours";
  if (reason) {
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }

  const canonicalWindow = qimenAdvisory.trueSolarShichenWindow({
    timezone: row.location_timezone,
    longitude: Number(row.longitude),
    instant: at.toISOString(),
  });
  const entitlementClock = localDateTime(row.location_timezone, at);
  const entitlement = qimenAdvisory.qimenNotificationEntitlement(
    { id: row.user_id, tier: row.tier, sub_expires_at: row.sub_expires_at, trial_ends_at: row.trial_ends_at },
    {
      timezone: row.location_timezone,
      now: at,
      instant: at,
      date: entitlementClock?.date,
      time: entitlementClock?.time,
    },
  );
  if (!entitlement.allow) {
    reason = entitlement.reason || "qimen_not_entitled";
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }

  let admitted = await loadRecoverableOccurrence(db, row, canonicalWindow);
  let snapshot = admitted?.snapshot || null;
  if (!snapshot) {
    try {
      const build = dependencies.buildCanonicalOccurrence || defaultBuildCanonicalOccurrence;
      snapshot = await build(row, at, {
        signal: dependencies.signal,
        fetchCanonicalQimenEngineSnapshot: dependencies.fetchCanonicalQimenEngineSnapshot,
      });
    } catch (error) {
      if (dependencies.signal?.aborted) throw dependencies.signal.reason || error;
      const retryAt = retryableEngineFailure(error) ? engineRetryAt(canonicalWindow, at) : null;
      reason = engineFailureReason(error, retryAt !== null);
      await finishClaim(db, row, at, retryAt || next, reason);
      return { reserved: 0, skipped: 1, reason };
    }
    if (snapshot === null) {
      const stabilizationAt = new Date(Date.parse(canonicalWindow.startAt) + BOUNDARY_STABILIZATION_MS);
      if (Number.isFinite(stabilizationAt.valueOf()) && at < stabilizationAt) {
        reason = "boundary_stabilizing";
        await finishClaim(db, row, at, stabilizationAt, reason);
        return { reserved: 0, skipped: 1, reason };
      }
      reason = "no_recommendable_direction";
      await finishClaim(db, row, at, next, reason);
      return { reserved: 0, skipped: 1, reason };
    }
  }
  if (!payloadRuntime.verifyQimenThreeLayerSnapshotV3(snapshot)) {
    reason = "snapshot_invalid";
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }
  if (snapshot.accountId !== row.user_id || snapshot.purpose !== row.purpose
    || snapshot.layers.hour.validFrom !== canonicalWindow.startAt
    || snapshot.layers.hour.validUntil !== canonicalWindow.endAt) {
    reason = "snapshot_owner_window_mismatch";
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }
  if (!admitted) {
    const admission = admissionDecision(row, snapshot, at);
    if (!admission.allow) {
      await finishClaim(db, row, at, next, admission.reason);
      return { reserved: 0, skipped: 1, reason: admission.reason };
    }
    const admit = dependencies.admitOccurrence || admitOccurrence;
    admitted = await admit(db, row, snapshot, admission.sendDeadline);
    if (!admitted) {
      await finishClaim(db, row, at, next, "duplicate");
      return { reserved: 0, skipped: 1, reason: "duplicate" };
    }
  }
  snapshot = admitted.snapshot;
  const recoveredAdmission = admissionDecision(row, snapshot, at);
  if (!recoveredAdmission.allow || recoveredAdmission.sendDeadline !== admitted.sendDeadline) {
    await db.query(
      `UPDATE mobile_qimen_occurrences SET state='skipped',skip_reason=$2,updated_at=$3
        WHERE id=$1 AND state='claimed' AND push_log_id IS NULL`,
      [admitted.id, recoveredAdmission.reason || "persisted_deadline_mismatch", at.toISOString()],
    );
    await finishClaim(db, row, at, next, recoveredAdmission.reason || "persisted_deadline_mismatch");
    return { reserved: 0, skipped: 1, reason: recoveredAdmission.reason || "persisted_deadline_mismatch" };
  }
  const notice = buildQimenNotice(row, snapshot, admitted.id, admitted.sendDeadline);
  const deliver = dependencies.deliver || delivery.deliver;
  const result = await deliver(db, notice, { defer: true });
  const deliveryStatus = result?.status;
  const reserved = deliveryStatus === "pending" ? 1 : 0;
  reason = reserved ? null : deliveryStatus === "duplicate" ? "duplicate" : "delivery_reservation_failed";
  if (!reserved) {
    await db.query(
      `UPDATE mobile_qimen_occurrences SET state='skipped',skip_reason=$2,updated_at=$3
        WHERE id=$1 AND state='claimed' AND push_log_id IS NULL`,
      [admitted.id, reason, at.toISOString()],
    );
  }
  await finishClaim(db, row, at, next, reason);
  return { reserved, skipped: reserved ? 0 : 1, reason };
}

async function forEachBounded(items, concurrency, handler) {
  const bounded = Math.max(1, Math.min(20, Number(concurrency) || 1));
  let cursor = 0;
  let firstFailure;
  await Promise.all(Array.from({ length: Math.min(bounded, items.length) }, async () => {
    while (cursor < items.length && firstFailure === undefined) {
      const index = cursor;
      cursor += 1;
      try {
        await handler(items[index]);
      } catch (error) {
        if (firstFailure === undefined) firstFailure = error;
      }
    }
  }));
  if (firstFailure !== undefined) throw firstFailure;
}

async function releaseClaims(db, claims, at) {
  const cleanupBatchSize = 100;
  let firstFailure;
  for (let offset = 0; offset < claims.length; offset += cleanupBatchSize) {
    const batch = claims.slice(offset, offset + cleanupBatchSize);
    try {
      await db.query(
        `WITH claimed AS (
           SELECT * FROM unnest($1::uuid[],$2::uuid[],$3::uuid[])
             AS item(user_id,installation_id,lease_token)
         )
         UPDATE mobile_qimen_installations q
            SET lease_token=NULL,lease_expires_at=NULL,updated_at=$4
           FROM claimed c
          WHERE q.user_id=c.user_id AND q.installation_id=c.installation_id
            AND q.lease_token=c.lease_token`,
        [
          batch.map((claim) => claim.user_id),
          batch.map((claim) => claim.installation_id),
          batch.map((claim) => claim.lease_token),
          at.toISOString(),
        ],
      );
    } catch (error) {
      if (firstFailure === undefined) firstFailure = error;
    }
  }
  if (firstFailure !== undefined) throw firstFailure;
}

async function runScheduler(db, signal, at = new Date(), dependencies = {}) {
  signal.throwIfAborted();
  const runtimeProducerEnabled = dependencies.runtimeProducerEnabled
    ?? sourceManifestRuntime.loadCanonicalSourceManifest().producerEnabled;
  const runtimeCommit = dependencies.backendCommit ?? process.env.HOURKEY_RELEASE_COMMIT ?? "";
  const state = await db.query(
    "SELECT producer_enabled,source_digest,backend_commit FROM mobile_qimen_producer_state WHERE singleton=true",
  );
  const producer = state.rows[0];
  if (runtimeProducerEnabled !== true || producer?.producer_enabled !== true || producer?.source_digest !== SOURCE_DIGEST
    || !/^[0-9a-f]{40}$/u.test(runtimeCommit) || producer.backend_commit !== runtimeCommit) {
    return { disabled: true, due: 0, reserved: 0, skipped: 0 };
  }
  const batchLimit = Math.max(1, Math.min(500, Number(dependencies.batchLimit) || BATCH));
  const maxPerRun = Math.max(1, Math.min(10_000, Number(dependencies.maxPerRun) || MAX_PER_RUN));
  const workerCount = Math.max(1, Math.min(20, Number(dependencies.workerCount) || WORKERS));
  if (DRY) {
    const claims = (await db.query(
      "SELECT * FROM mobile_qimen_installations WHERE enabled=true AND next_due_at<=$1 ORDER BY next_due_at LIMIT $2",
      [at.toISOString(), batchLimit],
    )).rows;
    return { disabled: false, due: claims.length, reserved: 0, skipped: 0 };
  }
  const report = { disabled: false, due: 0, reserved: 0, skipped: 0 };
  const processOne = dependencies.processClaim || processClaim;
  const enginePool = dependencies.fetchCanonicalQimenEngineSnapshot
    ? null
    : localEngineRuntime.createQimenLocalEnginePool({ size: dependencies.engineWorkerCount });
  const engineFetcher = dependencies.fetchCanonicalQimenEngineSnapshot
    || ((input, options) => qimenAdvisory.fetchCanonicalQimenEngineSnapshot(input, {
      ...options,
      calculateImpl: enginePool.calculate,
    }));
  const runDependencies = {
    ...dependencies,
    fetchCanonicalQimenEngineSnapshot: createEngineSnapshotMemo(
      engineFetcher,
    ),
  };
  try {
    while (report.due < maxPerRun) {
      signal.throwIfAborted();
      const claims = await claimDue(db, at, Math.min(batchLimit, maxPerRun - report.due));
      if (claims.length === 0) break;
      report.due += claims.length;
      try {
        await forEachBounded(claims, workerCount, async (claim) => {
          signal.throwIfAborted();
          const result = await processOne(db, claim, at, { ...runDependencies, signal });
          report.reserved += result.reserved;
          report.skipped += result.skipped;
        });
      } finally {
        await releaseClaims(db, claims, at);
      }
      if (claims.length < batchLimit) break;
    }
    return report;
  } finally {
    if (enginePool) await enginePool.close();
  }
}

async function main() {
  const db = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db",
    user: process.env.PGUSER || "decode_user",
    password: process.env.PGPASSWORD,
    max: Math.min(24, WORKERS + 4),
  });
  try {
    const leased = await delivery.withSchedulerRunLease(db, "qimen", (signal) => runScheduler(db, signal), { timeoutMs: 50_000 });
    if (!leased.acquired) return;
    const report = leased.result;
    console.log(`[mobile-qimen-push] disabled=${report.disabled} due=${report.due} reserved=${report.reserved} skipped=${report.skipped} dry=${DRY}`);
    if (!DRY) await writeSchedulerHeartbeat("qimen");
  } finally {
    await db.end();
  }
}

module.exports = Object.freeze({
  admissionDecision,
  admitOccurrence,
  buildQimenCopy,
  buildQimenNotice,
  claimDue,
  createEngineSnapshotMemo,
  inQuietHours,
  localDateTime,
  loadClaimContext,
  loadRecoverableOccurrence,
  nextDueAt,
  occurrenceKey,
  processClaim,
  releaseClaims,
  runScheduler,
});

if (require.main === module) {
  main().catch(() => {
    console.error("[mobile-qimen-push] error_code=scheduler_failed");
    process.exit(1);
  });
}
