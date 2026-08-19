import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const yam = require("./mobile-yam-push-cron.cjs");
const qimen = require("../src/lib/qimen-notification-advisory.cjs");
const fixture = JSON.parse(readFileSync("test-fixtures/notifications/task3-source-results.sanitized.json", "utf8"));

let pass = 0;
function ok(name: string, condition: unknown) {
  assert.ok(condition, name);
  pass += 1;
  console.log(`PASS ${name}`);
}

const source = readFileSync("scripts/mobile-yam-push-cron.cjs", "utf8");
const advisorySource = readFileSync("src/lib/qimen-notification-advisory.cjs", "utf8");
ok("Yam requests the canonical explicit travel-purpose hour chart",
  source.includes("fetchCanonicalQimenAdvisory") && advisorySource.includes("purpose: PURPOSE")
    && advisorySource.includes('system_type: "hour"'));
ok("Yam samples the civil-range midpoint instead of falsely treating its start as a true-solar boundary",
  yam.qimenSampleTime("09:00-11:00") === "10:00" && yam.qimenSampleTime("23:00-01:00") === "00:00");
assert.deepEqual(yam.qimenSampleContext("2026-08-19", "23:00-01:00", "Asia/Bangkok"), {
  date: "2026-08-20",
  time: "00:00",
  instant: "2026-08-19T17:00:00.000Z",
}, "a cross-midnight Yam must sample Qimen on the following civil date");
const crossMidnightSample = yam.qimenSampleContext("2026-08-19", "23:00-01:00", "Asia/Bangkok");
const crossMidnightAdvisory = await qimen.fetchCanonicalQimenAdvisory({
  ...crossMidnightSample, timezone: "Asia/Bangkok", lat: 13.7563, lng: 100.5018,
});
assert.equal(Date.parse(crossMidnightAdvisory.inputAt), Date.parse(crossMidnightSample.instant));
assert.ok(Date.parse(crossMidnightAdvisory.validUntil) > Date.parse("2026-08-19T16:00:00.000Z"),
  "cross-midnight Qimen context must not already be expired when its Yam starts");

const advisory = qimen.buildQimenAdvisory(fixture.yam.qimenApi, {
  timezone: fixture.yam.qimenRequest.timezone,
  longitude: fixture.yam.qimenRequest.lng,
  purpose: fixture.yam.qimenRequest.purpose,
});
ok("canonical source output produces a caution advisory", advisory?.recommendation === "caution");
ok("canonical advisory retains deity, door and star identities",
  advisory?.deity.zh === "六合" && advisory?.door.zh === "開門" && advisory?.star.zh === "天英");
ok("canonical advisory retains component base qualities",
  advisory?.deity.quality === "auspicious"
    && advisory?.door.quality === "great_auspicious"
    && advisory?.star.quality === "inauspicious");
ok("canonical advisory applies 旺相休囚死 to the selected door and star",
  advisory?.door.element === "金" && advisory?.door.vigor === "相"
    && advisory?.star.element === "火" && advisory?.star.vigor === "休");
ok("canonical caution flags are preserved", advisory?.warningCodes.includes("空亡")
  && advisory?.warningCodes.includes("入墓") && advisory?.warningCodes.includes("伏吟"));

for (const locale of ["th", "en", "zh"]) {
  const line = yam.qimenLine(advisory, locale);
  ok(`${locale}: line names deity, door and star`, /六合/u.test(line) && /開門/u.test(line) && /天英/u.test(line));
  ok(`${locale}: caution line does not invent a best direction`, !/ทิศดีสุด|Best direction|最吉方/u.test(line));
}

const notice = yam.buildYamProducer({
  id: fixture.accountId,
  profile_id: fixture.profileId,
  tokens: [],
  user_timezone: fixture.timezone,
}, { ...fixture.yam, highlight: advisory });
ok("Yam notice stores the exact true-solar Qimen validity window",
  notice.sourceFacts.qimen.validFrom === advisory.validFrom
    && notice.sourceFacts.qimen.validUntil === advisory.validUntil);
ok("Yam occurrence expires at the first ending bounded claim",
  notice.sourceFacts.eventEndAt === qimen.earliestExpiry(
    qimen.civilRangeWindow(fixture.yam.date, notice.payload.range, fixture.timezone).endAt,
    advisory.validUntil,
  ));
for (const locale of ["th", "en", "zh"]) {
  ok(`${locale}: complete Yam provider/history copy fits without truncation`,
    notice.historyCopies[locale].body.length <= 400 && /六合/u.test(notice.historyCopies[locale].body)
      && /開門/u.test(notice.historyCopies[locale].body) && /天英/u.test(notice.historyCopies[locale].body));
}

const deityCounts = execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-U", "decode_user", "decode_db",
  "-tAF|", "-c", `SELECT count(*), count(*) FILTER (WHERE btrim(coalesce(name_th,''))<>''),
   count(*) FILTER (WHERE btrim(coalesce(name_en,''))<>''),
   count(*) FILTER (WHERE btrim(coalesce(zh,''))<>'') FROM ref_qimen_deities_dict`],
{ encoding: "utf8" }).trim().split("|").map(Number);
ok("deity dictionary has complete TH/EN/ZH names", deityCounts.length === 4 && deityCounts.every((count) => count === 10));
const englishNames = execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-U", "decode_user", "decode_db",
  "-tA", "-c", "SELECT name_en FROM ref_qimen_deities_dict ORDER BY name_en"], { encoding: "utf8" }).trim().split("\n");
ok("English deity names are translated rather than bare pinyin", englishNames.every((name) => name.includes("(") && !/[฀-๿]/u.test(name)));
ok("forced-clock diagnostics remain dry-run only", source.includes("DRY && /^\\d{2}:\\d{2}$/.test(FORCE_TIME)"));

console.log(`[test-yam-qimen-line] ผ่าน ${pass}`);
