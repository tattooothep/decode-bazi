import assert from "node:assert/strict";

const previous = process.env.ADMIN_EMAILS;
process.env.ADMIN_EMAILS = "env-only@example.test";

try {
  const { buildAdminRecipientQuery } = await import("../src/lib/admin-notify-recipient-rbac.mjs");
  const captured = buildAdminRecipientQuery(
    { event_type: "service_unhealthy", audience_roles: ["ops"], required_permission: "admin.dashboard.read" },
  );

  assert.match(captured.text, /AND ar\.id IS NOT NULL[\s\S]+AND \(cardinality\(\$2::text\[\]\)=0 OR lower\(u\.email\)=ANY\(\$2::text\[\]\)\)/u,
    "ADMIN_EMAILS may narrow an already-RBAC-authorized recipient set");
  assert.doesNotMatch(captured.text, /OR lower\(u\.email\)=ANY\(\$2::text\[\]\) OR ar\./u,
    "ADMIN_EMAILS must not bypass role, role-audience, or permission authorization");
  assert.deepEqual(captured.values[1], ["env-only@example.test"], "allowlist remains a filter input only");
  console.log("ADMIN_NOTIFY_RECIPIENT_RBAC_OK");
} finally {
  if (previous === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = previous;
}
