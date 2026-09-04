import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveScienceNotificationDetail,
  type ScienceNotificationDetailDb,
} from "../src/lib/mobile-science-notification-detail-r8";

const IDS = {
  userId: "00000000-0000-4000-8000-000000000001",
  orgId: "00000000-0000-4000-8000-000000000002",
  installationId: "00000000-0000-4000-8000-000000000003",
  occurrenceId: "00000000-0000-4000-8000-000000000004",
  audience: "A9c7wP4nY2kLm8QrV5sT1u",
} as const;

let calls = 0;
let capturedSql = "";
let capturedParams: readonly unknown[] = [];
const db: ScienceNotificationDetailDb = {
  async query(sql, params) {
    calls += 1;
    capturedSql = sql;
    capturedParams = params || [];
    return {
      rows: [{
        state: "shadowed",
        snapshot: { schema: 1, category: "astronomy_fact", prediction: false, judgment: null },
        snapshot_digest: "a".repeat(64),
        created_at: new Date("2026-09-04T05:00:00.000Z"),
      }],
    };
  },
};

const detail = await resolveScienceNotificationDetail(db, { ...IDS, category: "astronomy_fact" });
assert.deepEqual(detail, {
  state: "current",
  snapshot: { schema: 1, category: "astronomy_fact", prediction: false, judgment: null },
  snapshotDigest: "a".repeat(64),
  createdAt: "2026-09-04T05:00:00.000Z",
});
assert.equal(calls, 1);
for (const required of ["o.id=$1", "c.user_id=$2", "c.org_id=$3", "e.installation_id=$4", "e.audience_binding=$5", "c.science_id=$6"]) {
  assert.ok(capturedSql.includes(required), `ownership SQL includes ${required}`);
}
assert.match(capturedSql, /o\.expires_at<=now\(\)/u, "elapsed two-hour facts are exposed as expired without mutating evidence");
assert.deepEqual(capturedParams, [IDS.occurrenceId, IDS.userId, IDS.orgId, IDS.installationId, IDS.audience, "astronomy_fact"]);

for (const [field, value] of [
  ["userId", "bad"],
  ["orgId", "bad"],
  ["installationId", "bad"],
  ["occurrenceId", "bad"],
  ["audience", "short"],
] as const) {
  const before = calls;
  assert.equal(await resolveScienceNotificationDetail(db, {
    ...IDS,
    [field]: value,
    category: "astronomy_fact",
  }), null);
  assert.equal(calls, before, `invalid ${field} fails before DB access`);
}

const emptyDb: ScienceNotificationDetailDb = { async query() { return { rows: [] }; } };
assert.equal(await resolveScienceNotificationDetail(emptyDb, { ...IDS, category: "astronomy_fact" }), null);
assert.equal(await resolveScienceNotificationDetail(emptyDb, { ...IDS, category: "qizheng" }), null,
  "source-blocked Qizheng reveals no occurrence existence");

for (const [stored, exposed] of [
  ["shadowed", "current"],
  ["expired", "expired"],
  ["revoked", "revoked"],
  ["rollback", "rollback"],
] as const) {
  const stateDb: ScienceNotificationDetailDb = {
    async query() {
      return { rows: [{ state: stored, snapshot: {}, snapshot_digest: "b".repeat(64), created_at: "2026-09-04T05:00:00.000Z" }] };
    },
  };
  assert.equal((await resolveScienceNotificationDetail(stateDb, { ...IDS, category: "astronomy_fact" }))?.state, exposed);
}

const moduleSource = readFileSync("src/lib/mobile-science-notification-detail-r8.ts", "utf8");
const listRoute = readFileSync("src/app/api/mobile/v1/astronomy-facts/route.ts", "utf8");
const astronomyDetailRoute = readFileSync("src/app/api/mobile/v1/astronomy-facts/[occurrenceId]/route.ts", "utf8");
const qizhengDetailRoute = readFileSync("src/app/api/mobile/v1/qizheng/notification-detail/[occurrenceId]/route.ts", "utf8");
for (const source of [moduleSource, listRoute, astronomyDetailRoute, qizhengDetailRoute]) {
  assert.doesNotMatch(source, /computeAstro|qizhengNatal|buildQizheng|openai|prompt|anthropic/iu,
    "detail surfaces read stored snapshots and never calculate or invoke AI");
}
for (const route of [listRoute, astronomyDetailRoute, qizhengDetailRoute]) {
  assert.match(route, /getMobileSession/u);
  assert.match(route, /private, no-store/u);
}
assert.match(astronomyDetailRoute, /resolveScienceNotificationDetail/u);
assert.match(qizhengDetailRoute, /resolveScienceNotificationDetail/u);
assert.match(astronomyDetailRoute, /notification_detail_unavailable/u);
assert.match(qizhengDetailRoute, /notification_detail_unavailable/u);
assert.match(listRoute, /o\.expires_at<=now\(\)/u, "the list cannot present elapsed facts as current");

console.log("MOBILE_SCIENCE_NOTIFICATION_DETAIL_R8_OK auth-bound stored-only");
