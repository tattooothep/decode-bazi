import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const presentation = require("../src/lib/ziwei-hourly-presentation.cjs");
const push = require("../src/lib/push-send.cjs");

const accountId = "00000000-0000-4000-8000-000000000001";
const profile = { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true };
const notificationId = "00000000-0000-4000-8000-000000000003";
const fcmToken = "f".repeat(256);
const expoToken = `ExponentPushToken[${"e".repeat(32)}]`;
const PROVIDER_PAYLOAD_CEILING_BYTES = 4_096;
const REQUIRED_REQUEST_HEADROOM_BYTES = 96;
const MAX_PROVIDER_REQUEST_BYTES = PROVIDER_PAYLOAD_CEILING_BYTES - REQUIRED_REQUEST_HEADROOM_BYTES;
let maximumFcmRequestBytes = 0;
let maximumExpoRequestBytes = 0;

const facts = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok",
  birthLocation: null,
  gender: "M",
  referenceInstant: new Date("2026-08-26T12:30:00.000Z"),
  referenceTimezone: "Asia/Bangkok",
});
const snapshot = runtime.buildZiweiHourlyNotificationSnapshot({
  accountId,
  profile,
  facts,
});

const locales = ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"] as const;
assert.equal(presentation.PRESENTATION_VERSION, "ziwei-hourly-type-c-v1");
assert.equal(
  createHash("sha256").update(readFileSync("src/lib/ziwei-hourly-presentation-catalog.json")).digest("hex"),
  presentation.PRESENTATION_CATALOG_SHA256,
  "the reviewed presentation catalog is immutable and can be matched by mobile",
);
assert.deepEqual(presentation.SUPPORTED_LOCALES, locales);

for (const [path, digest, required] of [
  ["data/library/astro-canon/ziwei/03-feixing-cetian-private-rules.md", "63a08376f3d2a0ddca8bce5a8014ea60d7e2af447fceb635d6df84f869ce1490", /化忌: attachment, blockage, debt, worry, entanglement; it is not automatic disaster/u],
  ["data/library/astro-canon/ziwei/08-quanshu-limit-special-rules.md", "27f8c93482b9638b84503431a615dd9e65d7be2a945fc5986f64c5eee03d5424", /One malefic alone is not enough for severe wording/u],
  ["data/library/astro-canon/ziwei/10-palace-sihua-specificity.md", "e9cbe426cb39a87f5caee4a9ffd3d806d7111cb5f2c46fad79594aeb26ff20cc", /Do not answer from one star alone/u],
] as const) {
  const source = readFileSync(path);
  assert.equal(createHash("sha256").update(source).digest("hex"), digest);
  assert.match(source.toString("utf8"), required);
}

assert.deepEqual(
  Object.fromEntries(["祿", "權", "科", "忌"].map((type) => [
    type,
    presentation.resolveSihuaPresentation("th", { star: "太陽", type, palaceName: "官祿", branch: "午" }).tone,
  ])),
  { 祿: "supportive", 權: "drive", 科: "supportive", 忌: "caution" },
  "Four Transformations retain distinct support/drive/caution semantics",
);

const expectedFlowTones = {
  祿存: "supportive", 天魁: "supportive", 天鉞: "supportive", 文昌: "supportive", 文曲: "supportive",
  擎羊: "caution", 陀羅: "caution", 天馬: "contextual", 紅鸞: "contextual", 天喜: "contextual",
} as const;
for (const [star, tone] of Object.entries(expectedFlowTones)) {
  const resolved = presentation.resolveFlowStarPresentation("th", `流時${star}`);
  assert.equal(resolved.canonicalStar, star);
  assert.equal(resolved.tone, tone, `${star} has the reviewed intrinsic presentation tone`);
  assert.ok(resolved.meaning.length > 0);
}
assert.equal(presentation.resolveFlowStarPresentation("th", "流時未知星").tone, "unavailable",
  "unknown stars fail closed instead of receiving invented good/bad meaning");

for (const palace of ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "僕役", "官祿", "田宅", "福德", "父母"]) {
  for (const locale of locales) {
    const resolved = presentation.resolvePalacePresentation(locale, palace);
    assert.equal(resolved.canonicalPalace, palace.replace(/宮$/u, ""));
    assert.ok(resolved.topic.length > 0, `${locale}/${palace} has a localized practical topic`);
  }
}

const languageMarkers: Record<(typeof locales)[number], readonly RegExp[]> = {
  th: [/แรงหนุน/u, /แรงผลัก/u, /ระวัง/u, /3 ชั้น/u],
  en: [/Support/u, /Drive/u, /Caution/u, /3 layers/iu],
  zh: [/助力/u, /推動/u, /留意/u, /三層/u],
  cn: [/助力/u, /推动/u, /注意/u, /三层/u],
  vi: [/Hỗ trợ/u, /Thúc đẩy/u, /Cẩn trọng/u, /3 tầng/u],
  ja: [/後押し/u, /推進/u, /注意/u, /3層/u],
  ru: [/Поддержка/u, /Импульс/u, /Риск/u, /3 уровня/u],
  ko: [/도움/u, /추진/u, /주의/u, /3층/u],
  es: [/Apoyo/u, /Impulso/u, /Precaución/u, /3 capas/u],
};

for (const locale of locales) {
  const projected = presentation.buildZiweiHourlyPresentation(locale, snapshot);
  assert.equal(projected.locale, locale);
  assert.equal(projected.version, presentation.PRESENTATION_VERSION);
  assert.deepEqual(Object.keys(projected.layers), ["month", "day", "hour"]);
  for (const layer of Object.values(projected.layers) as any[]) {
    assert.equal(layer.transformations.length, 4);
    assert.equal(layer.flowStars.length, 10);
    assert.ok(layer.focus.topic.length > 0);
  }
  assert.equal(projected.summary.hour.supportive.length >= 2, true);
  assert.equal(projected.summary.hour.drive.length >= 1, true);
  assert.equal(projected.summary.hour.caution.length >= 1, true);
  assert.equal(projected.summary.hour.contextual.length >= 1, true);

  const copy = runtime.buildZiweiHourlyCopy(locale, snapshot);
  const joined = `${copy.title} ${copy.body}`;
  for (const marker of languageMarkers[locale]) assert.match(joined, marker);
  assert.match(joined, /太陽化祿/u);
  assert.match(joined, /武曲化權/u);
  assert.match(joined, /天同化忌/u);
  assert.ok(copy.title.length <= 120 && copy.body.length <= 400);
  assert.doesNotMatch(joined, /overall score|best hour|ชั่วโมงดีที่สุด|คะแนนรวม|吉時定論|吉时定论/iu,
    "Type C explains both sides without inventing a flat auspicious verdict");
}

for (const locale of locales) {
  for (const palace of ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "僕役", "官祿", "田宅", "福德", "父母"]) {
    const worstFacts = structuredClone(facts) as any;
    for (const key of ["liuYue", "liuRi", "liuShi"]) {
      worstFacts.layers[key].mingPalaceName = palace;
      for (const item of worstFacts.layers[key].siHua) item.palaceName = palace;
    }
    const worstCase = runtime.buildZiweiHourlyNotificationSnapshot({ accountId, profile, facts: worstFacts });
    const copy = runtime.buildZiweiHourlyCopy(locale, worstCase);
    assert.ok(copy.title.length <= 120 && copy.body.length <= 400,
      `${locale}/${palace} cannot make a valid notification fail at delivery time`);
    const data = { ...runtime.buildZiweiHourlyProviderData(worstCase), notificationId };
    const input = { category: "ziwei", ...copy, url: "/ziwei/hourly", transactional: false, data };
    const fcm = push.prepareMessage(input, "fcm");
    const expo = push.prepareMessage(input, "expo");
    const fcmBytes = Buffer.byteLength(JSON.stringify({ message: { token: fcmToken, ...fcm } }), "utf8");
    const expoBytes = Buffer.byteLength(JSON.stringify({ to: expoToken, ...expo }), "utf8");
    maximumFcmRequestBytes = Math.max(maximumFcmRequestBytes, fcmBytes);
    maximumExpoRequestBytes = Math.max(maximumExpoRequestBytes, expoBytes);
    assert.ok(fcmBytes <= MAX_PROVIDER_REQUEST_BYTES,
      `${locale}/${palace} FCM request ${fcmBytes} bytes exceeds ${MAX_PROVIDER_REQUEST_BYTES}`);
    assert.ok(expoBytes <= MAX_PROVIDER_REQUEST_BYTES,
      `${locale}/${palace} Expo request ${expoBytes} bytes exceeds ${MAX_PROVIDER_REQUEST_BYTES}`);
  }
}

console.log(`PASS Ziwei hourly Type C presentation — 9 locales, FCM max ${maximumFcmRequestBytes} B, Expo max ${maximumExpoRequestBytes} B, 96 B headroom gate`);
