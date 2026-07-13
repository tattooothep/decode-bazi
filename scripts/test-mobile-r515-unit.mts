import assert from "node:assert/strict";
import test from "node:test";

import { cleanDatepickDate, parseDatepickPeople } from "../src/app/api/mobile/v1/datepick/input.ts";
import {
  MAX_SAVED_DATE_BODY_BYTES,
  parseSavedDatePayload,
  readSavedDateBody,
} from "../src/app/api/mobile/v1/datepick/saved-store.ts";
import {
  inspectMobileSifuImage,
  mobileSifuStreamPolicy,
} from "../src/app/api/mobile/v1/sifu/image-policy.ts";
import {
  currentBangkokDate,
  projectCalendarGoals,
} from "../src/app/api/mobile/v1/today/goals/project.ts";

const PROFILE_A = "11111111-1111-4111-8111-111111111111";
const PROFILE_B = "22222222-2222-4222-8222-222222222222";

test("datepick people accepts peopleIds plus legacy profileId and deduplicates", () => {
  assert.deepEqual(
    parseDatepickPeople({ peopleIds: [`hk_${PROFILE_A}`, PROFILE_B], profileId: PROFILE_A }),
    { ids: [PROFILE_A, PROFILE_B] }
  );
});

test("datepick people rejects malformed, non-array, and excessive input", () => {
  assert.equal(parseDatepickPeople({ peopleIds: "not-an-array" }).error, "peopleIds ต้องเป็น array");
  assert.equal(parseDatepickPeople({ peopleIds: ["not-a-uuid"] }).error, "peopleIds มี profile id ไม่ถูกต้อง");
  assert.match(parseDatepickPeople({ peopleIds: Array(11).fill(PROFILE_A) }).error || "", /ไม่เกิน 10/);
  const tenUnique = Array.from({ length: 10 }, (_, index) =>
    `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`
  );
  assert.match(parseDatepickPeople({ peopleIds: tenUnique, profileId: PROFILE_B }).error || "", /ไม่เกิน 10/);
});

test("datepick date rejects impossible calendar dates", () => {
  assert.equal(cleanDatepickDate("2026-07-13"), "2026-07-13");
  assert.equal(cleanDatepickDate("2026-02-30"), null);
});

test("saved date parser keeps only the bounded candidate snapshot contract", () => {
  const result = parseSavedDatePayload({
    activityType: "開市",
    candidateId: "candidate-1",
    datetime: { start: "2026-07-20T09:00:00+07:00", end: "2026-07-20T11:00:00+07:00" },
    pillars: {
      year: { stem: "丙", branch: "午", ignored: "secret" },
      month: "乙未",
      ignored: "value",
    },
    summary: "  ฤกษ์เปิดกิจการ  ",
    ignored: "value",
  });

  assert.deepEqual(result, {
    payload: {
      activityType: "開市",
      candidateId: "candidate-1",
      datetime: { start: "2026-07-20T09:00:00+07:00", end: "2026-07-20T11:00:00+07:00" },
      pillars: { year: { stem: "丙", branch: "午" }, month: "乙未" },
      summary: "ฤกษ์เปิดกิจการ",
    },
  });
});

test("saved date parser rejects invalid ordering and oversized request bodies", async () => {
  assert.equal(
    parseSavedDatePayload({
      activityType: "開市",
      datetime: { start: "2026-07-20T11:00:00+07:00", end: "2026-07-20T09:00:00+07:00" },
      pillars: { day: "甲子" },
      summary: "invalid",
    }).error,
    "datetime_invalid"
  );

  const decoded = await readSavedDateBody(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ summary: "x".repeat(MAX_SAVED_DATE_BODY_BYTES) }),
  }));
  assert.equal(decoded.status, 413);
  assert.equal(decoded.error, "saved_date_payload_too_large");

  assert.equal(
    parseSavedDatePayload({
      activityType: "開市",
      datetime: { start: "2026-07-20T09:00", end: "2026-07-20T11:00" },
      pillars: { day: "甲子" },
      summary: "timezone missing",
    }).error,
    "datetime_invalid"
  );
});

test("Sifu image policy rejects malformed, oversized, and URL attachments before upstream", () => {
  assert.deepEqual(inspectMobileSifuImage({}), { present: false, tooLarge: false, invalid: false });
  assert.equal(inspectMobileSifuImage({ image_url: 123 }).invalid, true);
  assert.equal(inspectMobileSifuImage({ image_url: "https://example.test/photo.jpg" }).present, true);
  assert.equal(inspectMobileSifuImage({ image_base64: "a".repeat(7_000_000) }).tooLarge, true);
});

test("Sifu stream policy bypasses JSON cache only for stream requests", () => {
  assert.deepEqual(mobileSifuStreamPolicy(false), { stream: false });
  assert.deepEqual(mobileSifuStreamPolicy(true), { stream: true, noCache: true });
});

test("Today Goals projects only canonical numeric goals and reports entitlement gaps", () => {
  assert.deepEqual(
    projectCalendarGoals({ wealth: 88, career: 77, love: null, invented: 99 }),
    {
      goals: { wealth: 88, career: 77 },
      lockedGoals: ["love", "health", "family", "travel"],
      complete: false,
    }
  );
});

test("Today Goals defaults to the Bangkok calendar date", () => {
  assert.equal(currentBangkokDate(new Date("2026-07-12T18:00:00.000Z")), "2026-07-13");
});
