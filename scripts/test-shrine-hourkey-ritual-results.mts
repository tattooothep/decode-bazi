import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HOURKEY_RITUAL_IDS,
  HOURKEY_RITUAL_LOCALES,
  parseHourKeyRitualInput,
  resolveHourKeyRitual,
} from "../src/lib/shrine-hourkey-ritual-result";

const secret = "hourkey-test-secret-32-bytes-minimum-value";
const idempotency_key = "ritual_0123456789abcdef0123456789abcdef";

for (const locale of HOURKEY_RITUAL_LOCALES) {
  for (const ritual_id of HOURKEY_RITUAL_IDS) {
    const input = parseHourKeyRitualInput({
      idempotency_key,
      intent_category: ritual_id === "guanyin-prayer" ? "peace" : undefined,
      locale,
      ritual_id,
      wish_text: ritual_id === "guanyin-prayer" ? "ขอให้ใจสงบ" : undefined,
    });
    const first = resolveHourKeyRitual("user-1", input, secret);
    const replay = resolveHourKeyRitual("user-1", input, secret);
    assert.deepEqual(replay, first, `${ritual_id}/${locale} retry drifted`);
    assert.equal(first.authoritative, true);
    assert.equal(first.status, "authorized");
    assert.ok(first.resultCode.length > 0);
    assert.ok(first.display.title.length > 0);
    assert.ok(first.display.body.length > 0);
    assert.ok(first.display.footer.length > 0);
  }
}

const fortune = resolveHourKeyRitual(
  "user-1",
  parseHourKeyRitualInput({
    idempotency_key,
    locale: "th",
    ritual_id: "fortune-sticks",
  }),
  secret,
);
assert.match(fortune.resultCode, /^fortune-stick-([1-9]|[1-5][0-9]|60)$/u);
assert.ok((fortune.values.fortuneStickNumber ?? 0) >= 1);

const oracle = resolveHourKeyRitual(
  "user-1",
  parseHourKeyRitualInput({
    idempotency_key,
    locale: "en",
    ritual_id: "oracle-liuyao",
  }),
  secret,
);
assert.match(oracle.resultCode, /^oracle-lines-[6-9](?:-[6-9]){5}$/u);
assert.equal(oracle.values.liuyaoLines?.length, 6);

const jiaobei = resolveHourKeyRitual(
  "user-1",
  parseHourKeyRitualInput({
    idempotency_key,
    locale: "th",
    ritual_id: "jiaobei",
  }),
  secret,
);
assert.match(jiaobei.resultCode, /^jiaobei-(sheng|xiao|yin|li)$/u);

assert.throws(
  () => parseHourKeyRitualInput({ locale: "th", ritual_id: "incense" }),
  /invalid_idempotency_key/u,
);
assert.throws(
  () => parseHourKeyRitualInput({
    idempotency_key,
    locale: "th",
    ritual_id: "guanyin-prayer",
  }),
  /invalid_prayer_context/u,
);

const routeSource = readFileSync(
  "src/app/api/mobile/v1/shrine/ritual/result/route.ts",
  "utf8",
);
assert.match(routeSource, /getMobileSession/u);
assert.match(routeSource, /mobileBearerToken/u);
assert.match(routeSource, /mobile-shrine-ritual-result-ip/u);
assert.match(routeSource, /mobile-shrine-ritual-result-bearer/u);
assert.match(routeSource, /mobile-shrine-ritual-result-user/u);
assert.match(routeSource, /process\.env\.AUTH_SECRET/u);
assert.match(routeSource, /resolveHourKeyRitual\(session\.userId/u);

console.log(
  `PASS HourKey ritual backend: ${HOURKEY_RITUAL_IDS.length} rituals × ${HOURKEY_RITUAL_LOCALES.length} locales`,
);
