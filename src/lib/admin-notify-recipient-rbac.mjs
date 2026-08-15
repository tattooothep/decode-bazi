function envEmailFilter(env = process.env) {
  return String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

const DEFAULT_ON = new Set([
  "support_report_new", "support_user_reply", "payment_exception", "refund_failed",
  "service_unhealthy", "service_recovered", "admin_role_changed",
]);

export function buildAdminRecipientQuery(event, env = process.env) {
  return {
    text: `SELECT DISTINCT u.id::text AS user_id,u.locale
       FROM users u
       JOIN admin_user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL
         AND (ur.expires_at IS NULL OR ur.expires_at>now())
       JOIN admin_roles ar ON ar.id=ur.role_id
       LEFT JOIN admin_notify_prefs pref ON pref.user_id=u.id AND pref.event_type=$1
      WHERE u.is_active AND u.deleted_at IS NULL
        AND ar.id IS NOT NULL
        AND (cardinality($2::text[])=0 OR lower(u.email)=ANY($2::text[]))
        AND COALESCE(pref.enabled,$3::boolean)
        AND (cardinality($4::text[])=0 OR ar.is_super OR ar.key=ANY($4::text[]))
        AND ($5::text IS NULL OR ar.is_super OR EXISTS (
          SELECT 1 FROM admin_role_permissions rp WHERE rp.role_id=ar.id
            AND (rp.perm_key=$5 OR rp.perm_key='admin.*' OR rp.perm_key=(split_part($5,'.',1)||'.*'))
        ))`,
    values: [
      event.event_type,
      envEmailFilter(env),
      DEFAULT_ON.has(event.event_type),
      event.audience_roles || [],
      event.required_permission || null,
    ],
  };
}
