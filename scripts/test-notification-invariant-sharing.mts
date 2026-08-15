import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const invariants = require("../src/lib/notification-delivery-invariants.cjs");
const impossible = invariants.attemptImpossibleSql("a");
const retentionStable = invariants.retentionStableAttemptSql("a", "$1");

assert.equal(retentionStable.includes(impossible), true, "retention uses the exact reconciliation impossible-attempt predicate before purging");
assert.match(impossible, /provider='expo'[\s\S]+provider_ticket_id IS NULL/u, "shared invariant requires an Expo ticket for accepted/delivered state");
assert.match(impossible, /provider='fcm'[\s\S]+provider_message_id IS NULL/u, "shared invariant requires an FCM message ID for accepted/delivered state");
assert.match(impossible, /status IN \('dead','delivered'\)[\s\S]+lease_token IS NOT NULL/u, "shared invariant rejects terminal leases");
assert.match(impossible, /status='delivered'[\s\S]+delivered_at IS NULL/u, "shared invariant rejects delivered rows without timestamps");
assert.match(retentionStable, /provider='expo'[\s\S]+provider_receipt_checked_at IS NOT NULL/u, "old Expo acceptance is purgeable only after receipt processing");
assert.match(retentionStable, /lease_token IS NULL AND a\.lease_expires_at IS NULL/u, "retention never purges a child while any worker lease is held");

const observability = readFileSync("src/lib/notification-observability.cjs", "utf8");
const retention = readFileSync("src/lib/notification-retention.cjs", "utf8");
assert.match(observability, /require\("\.\/notification-delivery-invariants\.cjs"\)/u, "reconciliation imports the shared delivery invariant");
assert.match(observability, /attemptImpossibleSql\("a"\)/u, "reconciliation executes the shared attempt predicate");
assert.match(observability, /derivedParentStatusSql/u, "reconciliation derives parent truth through the shared helper");
assert.match(retention, /require\("\.\/notification-delivery-invariants\.cjs"\)/u, "retention imports the shared delivery invariant");
assert.match(retention, /retentionStableAttemptSql\("a", "\$1"\)/u, "retention executes the shared attempt predicate plus its stricter age/receipt gate");
assert.match(retention, /l\.delivery_status=\$\{derivedParentStatus\}/u, "retention requires the same derived parent delivery status");
assert.match(retention, /l\.attempt_count=rollup\.sends/u, "retention requires exact parent attempt-count truth");
console.log("NOTIFICATION_INVARIANT_SHARING_OK");
