import crypto from "node:crypto";
import { q, q1, pool } from "@/lib/db";

export type AffiliateMemberStatus = "requested" | "active" | "suspended" | "rejected";
export type AffiliateRewardStatus = "pending" | "approved" | "paid" | "reversed" | "cancelled" | "blocked";

type AffiliateSettings = {
  pilot_enabled: boolean;
  hold_days: number;
  topup_bps: number;
  subscription_bps: number;
  annual_bps: number;
  min_order_thb: number;
  max_commission_per_order_thb: number;
  ip_velocity_limit: number;
};

const DEFAULT_SETTINGS: AffiliateSettings = {
  pilot_enabled: true,
  hold_days: 14,
  topup_bps: 1000,
  subscription_bps: 1500,
  annual_bps: 1800,
  min_order_thb: 50,
  max_commission_per_order_thb: 2000,
  ip_velocity_limit: 5,
};

function intSetting(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function getAffiliateSettings(): Promise<AffiliateSettings> {
  const rows = await q<{ key: string; value: string | null }>(
    `SELECT key, value FROM app_settings WHERE key LIKE 'affiliate_%'`
  ).catch(() => []);
  const map = new Map(rows.map((r) => [r.key, r.value || ""]));
  return {
    pilot_enabled: (map.get("affiliate_pilot_enabled") || "on") === "on",
    hold_days: intSetting(map.get("affiliate_hold_days"), DEFAULT_SETTINGS.hold_days),
    topup_bps: intSetting(map.get("affiliate_topup_bps"), DEFAULT_SETTINGS.topup_bps),
    subscription_bps: intSetting(map.get("affiliate_subscription_bps"), DEFAULT_SETTINGS.subscription_bps),
    annual_bps: intSetting(map.get("affiliate_annual_bps"), DEFAULT_SETTINGS.annual_bps),
    min_order_thb: intSetting(map.get("affiliate_min_order_thb"), DEFAULT_SETTINGS.min_order_thb),
    max_commission_per_order_thb: intSetting(map.get("affiliate_max_commission_per_order_thb"), DEFAULT_SETTINGS.max_commission_per_order_thb),
    ip_velocity_limit: intSetting(map.get("affiliate_ip_velocity_limit"), DEFAULT_SETTINGS.ip_velocity_limit),
  };
}

export function normalizeAffiliateCode(value: unknown): string | null {
  const raw = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return null;
  const body = raw.startsWith("HK") ? raw.slice(2) : raw;
  const clean = body.slice(0, 16);
  return clean ? `HK-${clean}` : null;
}

function generateCodeSeed(userId: string, email?: string | null, attempt = 0): string {
  const input = `${userId}:${email || ""}:${attempt}`;
  const token = crypto.createHash("sha256").update(input).digest("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return `HK-${token}`;
}

async function nextUniqueCode(userId: string, email?: string | null): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateCodeSeed(userId, email, attempt);
    const exists = await q1<{ user_id: string }>(`SELECT user_id FROM affiliate_members WHERE code=$1`, [code]);
    if (!exists || exists.user_id === userId) return code;
  }
  return `HK-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function hashAudit(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const key = process.env.AUTH_SECRET || "hourkey-affiliate-audit";
  return crypto.createHmac("sha256", key).update(raw).digest("hex").slice(0, 48);
}

function requestIp(req?: Request): string {
  if (!req) return "";
  const fwd = req.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
}

function requestPath(req?: Request): string | null {
  if (!req) return null;
  try {
    const u = new URL(req.url);
    return `${u.pathname}${u.search || ""}`;
  } catch {
    return null;
  }
}

async function audit(event_type: string, payload: Record<string, unknown>, refs: {
  actor_user_id?: string | null;
  target_user_id?: string | null;
  order_id?: string | null;
  reward_id?: string | null;
} = {}) {
  try {
    await q1(
      `INSERT INTO affiliate_audit_events(actor_user_id, target_user_id, order_id, reward_id, event_type, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [refs.actor_user_id || null, refs.target_user_id || null, refs.order_id || null, refs.reward_id || null, event_type, payload]
    );
  } catch (e) {
    console.warn("[affiliate] audit failed", e instanceof Error ? e.message : String(e));
  }
}

export async function requestAffiliateAccess(userId: string, note?: string) {
  const user = await q1<{ id: string; email: string; name: string | null }>(
    `SELECT id, email, name FROM users WHERE id=$1`,
    [userId]
  );
  if (!user) throw new Error("user_not_found");
  const existing = await q1<{ code: string; status: AffiliateMemberStatus }>(
    `SELECT code, status FROM affiliate_members WHERE user_id=$1`,
    [userId]
  );
  const code = existing?.code || await nextUniqueCode(userId, user.email);
  const row = await q1(
    `INSERT INTO affiliate_members(user_id, code, status, notes)
       VALUES ($1,$2,'requested',$3)
       ON CONFLICT (user_id) DO UPDATE SET updated_at=now()
       RETURNING user_id, code, status, payout_kind, requested_at, approved_at`,
    [userId, code, note || null]
  );
  await audit("member_requested", { code, note: note || null }, { target_user_id: userId });
  return row;
}

export async function approveAffiliateMember(input: {
  actorUserId: string;
  userId?: string;
  email?: string;
  note?: string;
}) {
  let userId = input.userId || "";
  if (!userId && input.email) {
    const user = await q1<{ id: string }>(`SELECT id FROM users WHERE lower(email)=lower($1)`, [input.email]);
    if (!user) throw new Error("user_not_found");
    userId = user.id;
  }
  if (!userId) throw new Error("user_required");
  const user = await q1<{ id: string; email: string }>(`SELECT id, email FROM users WHERE id=$1`, [userId]);
  if (!user) throw new Error("user_not_found");
  const current = await q1<{ code: string }>(`SELECT code FROM affiliate_members WHERE user_id=$1`, [userId]);
  const code = current?.code || await nextUniqueCode(userId, user.email);
  const row = await q1(
    `INSERT INTO affiliate_members(user_id, code, status, notes, approved_at, approved_by, updated_at)
       VALUES ($1,$2,'active',$3,now(),$4,now())
       ON CONFLICT (user_id) DO UPDATE
         SET status='active', notes=COALESCE($3, affiliate_members.notes), approved_at=COALESCE(affiliate_members.approved_at, now()),
             approved_by=$4, updated_at=now()
       RETURNING user_id, code, status, payout_kind, requested_at, approved_at`,
    [userId, code, input.note || null, input.actorUserId]
  );
  await audit("member_approved", { code, note: input.note || null }, { actor_user_id: input.actorUserId, target_user_id: userId });
  return row;
}

export async function setAffiliateMemberStatus(actorUserId: string, userId: string, status: AffiliateMemberStatus, note?: string) {
  if (!["requested", "active", "suspended", "rejected"].includes(status)) throw new Error("bad_status");
  const row = await q1(
    `UPDATE affiliate_members SET status=$2, notes=COALESCE($3, notes), updated_at=now()
       WHERE user_id=$1 RETURNING user_id, code, status, payout_kind, requested_at, approved_at`,
    [userId, status, note || null]
  );
  if (!row) throw new Error("member_not_found");
  await audit("member_status_changed", { status, note: note || null }, { actor_user_id: actorUserId, target_user_id: userId });
  return row;
}

export async function setAffiliateAttributionStatus(input: {
  actorUserId: string;
  attributionId: string;
  status: "active" | "flagged" | "rejected" | "cancelled";
  reason?: string;
}) {
  if (!["active", "flagged", "rejected", "cancelled"].includes(input.status)) throw new Error("bad_status");
  const row = await q1<{ id: string; referred_user_id: string; referrer_user_id: string; status: string }>(
    `UPDATE affiliate_attributions
        SET status=$2,
            rejected_reason=CASE WHEN $2 IN ('rejected','cancelled') THEN COALESCE($3, rejected_reason) ELSE rejected_reason END,
            updated_at=now()
      WHERE id=$1
      RETURNING id, referred_user_id, referrer_user_id, status`,
    [input.attributionId, input.status, input.reason || null]
  );
  if (!row) throw new Error("attribution_not_found");
  await audit("attribution_status_changed", {
    status: input.status,
    reason: input.reason || null,
  }, {
    actor_user_id: input.actorUserId,
    target_user_id: row.referred_user_id,
  });
  return row;
}

export async function captureAffiliateAttribution(input: {
  referredUserId: string;
  referralCode?: unknown;
  request?: Request;
  channel?: string;
  deviceId?: unknown;
}) {
  const code = normalizeAffiliateCode(input.referralCode);
  if (!code) return { ok: true, status: "skipped", reason: "no_code" };

  const settings = await getAffiliateSettings();
  if (!settings.pilot_enabled) {
    await audit("attribution_skipped", { code, reason: "pilot_disabled" }, { target_user_id: input.referredUserId });
    return { ok: true, status: "skipped", reason: "pilot_disabled" };
  }

  const existing = await q1<{ id: string; status: string }>(
    `SELECT id, status FROM affiliate_attributions WHERE referred_user_id=$1`,
    [input.referredUserId]
  );
  if (existing) return { ok: true, status: "already", id: existing.id, attribution_status: existing.status };

  const member = await q1<{ user_id: string; status: AffiliateMemberStatus }>(
    `SELECT user_id, status FROM affiliate_members WHERE code=$1`,
    [code]
  );
  if (!member || member.status !== "active") {
    await audit("attribution_rejected", { code, reason: "invalid_or_inactive_code" }, { target_user_id: input.referredUserId });
    return { ok: false, status: "rejected", reason: "invalid_or_inactive_code" };
  }
  if (member.user_id === input.referredUserId) {
    await audit("attribution_rejected", { code, reason: "self_referral" }, { target_user_id: input.referredUserId });
    return { ok: false, status: "rejected", reason: "self_referral" };
  }

  const ipHash = hashAudit(requestIp(input.request));
  const uaHash = hashAudit(input.request?.headers.get("user-agent") || "");
  const deviceHash = hashAudit(input.deviceId);
  const flags: string[] = [];

  if (deviceHash) {
    const dup = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM affiliate_attributions
        WHERE device_hash=$1 AND status IN ('active','flagged')`,
      [deviceHash]
    );
    if ((dup?.n || 0) > 0) flags.push("duplicate_device");
  }
  if (ipHash) {
    const ipN = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM affiliate_attributions
        WHERE ip_hash=$1 AND created_at >= now() - interval '24 hours'`,
      [ipHash]
    );
    if ((ipN?.n || 0) >= settings.ip_velocity_limit) flags.push("ip_velocity");
  }

  const status = flags.length ? "flagged" : "active";
  const row = await q1<{ id: string; status: string }>(
    `INSERT INTO affiliate_attributions
       (referred_user_id, referrer_user_id, code, status, channel, source_path, ip_hash, user_agent_hash, device_hash, fraud_flags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (referred_user_id) DO NOTHING
     RETURNING id, status`,
    [
      input.referredUserId,
      member.user_id,
      code,
      status,
      input.channel || "signup",
      requestPath(input.request),
      ipHash,
      uaHash,
      deviceHash,
      JSON.stringify(flags),
    ]
  );
  if (!row) return { ok: true, status: "already" };
  await audit("attribution_created", { code, status, fraud_flags: flags }, { target_user_id: input.referredUserId });
  return { ok: true, status, id: row.id, fraud_flags: flags };
}

function rateForPackage(packageCode: string | null, settings: AffiliateSettings): number {
  const code = String(packageCode || "");
  if (/_1y$/.test(code)) return settings.annual_bps;
  if (code.startsWith("premium_") || code.startsWith("master_")) return settings.subscription_bps;
  if (code.startsWith("topup_")) return settings.topup_bps;
  return settings.topup_bps;
}

export async function createPendingAffiliateRewardForOrder(orderId: string, source = "payment_paid") {
  const settings = await getAffiliateSettings();
  if (!settings.pilot_enabled) return { ok: true, status: "skipped", reason: "pilot_disabled" };

  const existing = await q1<{ id: string; status: string }>(
    `SELECT id, status FROM affiliate_rewards WHERE order_id=$1`,
    [orderId]
  );
  if (existing) return { ok: true, status: "already", reward_id: existing.id, reward_status: existing.status };

  const row = await q1<{
    order_id: string;
    referred_user_id: string;
    package_code: string | null;
    amount_thb: number;
    order_status: string;
    paid_at: string | null;
    attribution_id: string;
    attribution_status: string;
    referrer_user_id: string;
    member_status: string;
  }>(
    `SELECT o.id AS order_id, o.user_id AS referred_user_id, o.package_code, o.amount_thb,
            o.status AS order_status, o.paid_at,
            a.id AS attribution_id, a.status AS attribution_status, a.referrer_user_id,
            m.status AS member_status
       FROM orders o
       JOIN affiliate_attributions a ON a.referred_user_id=o.user_id
       JOIN affiliate_members m ON m.user_id=a.referrer_user_id
      WHERE o.id=$1`,
    [orderId]
  );
  if (!row) return { ok: true, status: "skipped", reason: "no_attribution" };
  if (row.order_status !== "paid") return { ok: true, status: "skipped", reason: "order_not_paid" };
  if (row.attribution_status !== "active") return { ok: true, status: "skipped", reason: `attribution_${row.attribution_status}` };
  if (row.member_status !== "active") return { ok: true, status: "skipped", reason: `member_${row.member_status}` };

  const amount = Math.max(0, Number(row.amount_thb || 0));
  if (amount < settings.min_order_thb) return { ok: true, status: "skipped", reason: "below_min_order" };
  const net = amount;
  const rate = rateForPackage(row.package_code, settings);
  const rawCommission = Math.round((net * rate) / 10000);
  const commission = Math.min(rawCommission, settings.max_commission_per_order_thb);
  if (commission <= 0) return { ok: true, status: "skipped", reason: "zero_commission" };

  const guard = {
    source,
    package_code: row.package_code,
    gross_amount_thb: amount,
    net_basis: "gross_amount_until_gateway_fee_table_exists",
    min_order_thb: settings.min_order_thb,
    max_commission_per_order_thb: settings.max_commission_per_order_thb,
    profit_guard_passed: commission <= settings.max_commission_per_order_thb,
  };
  const reward = await q1<{ id: string; commission_thb: number; hold_until: string }>(
    `INSERT INTO affiliate_rewards
       (order_id, attribution_id, referrer_user_id, referred_user_id, amount_thb, net_amount_thb,
        commission_rate_bps, commission_thb, status, hold_until, guard)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending', COALESCE($9::timestamptz, now()) + ($10 || ' days')::interval, $11)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id, commission_thb, hold_until`,
    [
      row.order_id,
      row.attribution_id,
      row.referrer_user_id,
      row.referred_user_id,
      amount,
      net,
      rate,
      commission,
      row.paid_at,
      String(settings.hold_days),
      JSON.stringify(guard),
    ]
  );
  if (!reward) return { ok: true, status: "already" };
  await audit("reward_pending_created", { commission_thb: commission, hold_days: settings.hold_days, guard }, {
    target_user_id: row.referrer_user_id,
    order_id: orderId,
    reward_id: reward.id,
  });
  return { ok: true, status: "pending", reward_id: reward.id, commission_thb: reward.commission_thb, hold_until: reward.hold_until };
}

export async function approveAffiliateReward(input: { rewardId: string; actorUserId: string; overrideHold?: boolean; note?: string }) {
  const row = await q1<{ id: string; status: string; commission_thb: number }>(
    `UPDATE affiliate_rewards
        SET status='approved', approved_at=now(), approved_by=$2, admin_note=COALESCE($4, admin_note), updated_at=now()
      WHERE id=$1 AND status='pending' AND ($3::boolean OR hold_until <= now())
      RETURNING id, status, commission_thb`,
    [input.rewardId, input.actorUserId, !!input.overrideHold, input.note || null]
  );
  if (!row) throw new Error("reward_not_pending_or_hold_active");
  await audit("reward_approved", { override_hold: !!input.overrideHold, note: input.note || null }, { actor_user_id: input.actorUserId, reward_id: input.rewardId });
  return row;
}

export async function markAffiliateRewardPaid(input: { rewardId: string; actorUserId: string; payoutRef?: string; note?: string }) {
  const row = await q1<{ id: string; status: string; commission_thb: number }>(
    `UPDATE affiliate_rewards
        SET status='paid', paid_at=now(), paid_by=$2, payout_ref=$3, admin_note=COALESCE($4, admin_note), updated_at=now()
      WHERE id=$1 AND status='approved'
      RETURNING id, status, commission_thb`,
    [input.rewardId, input.actorUserId, input.payoutRef || null, input.note || null]
  );
  if (!row) throw new Error("reward_not_approved");
  await audit("reward_paid", { payout_ref: input.payoutRef || null, note: input.note || null }, { actor_user_id: input.actorUserId, reward_id: input.rewardId });
  return row;
}

export async function reverseAffiliateRewardsForOrder(orderId: string, reason: string, actorUserId?: string | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rewards = await client.query<{ id: string; status: string; commission_thb: number }>(
      `UPDATE affiliate_rewards
          SET status='reversed', reversed_at=now(), reversed_by=$2, reversal_reason=$3, updated_at=now()
        WHERE order_id=$1 AND status IN ('pending','approved','paid')
        RETURNING id, status, commission_thb`,
      [orderId, actorUserId || null, reason]
    );
    await client.query(
      `UPDATE orders
          SET status='refunded', note=COALESCE(note,'') || $2
        WHERE id=$1 AND status='paid'`,
      [orderId, ` affiliate_reversal:${reason}`]
    );
    await client.query("COMMIT");
    for (const r of rewards.rows) {
      await audit("reward_reversed", { reason, previous_status: r.status, commission_thb: r.commission_thb }, {
        actor_user_id: actorUserId || null,
        order_id: orderId,
        reward_id: r.id,
      });
    }
    return { ok: true, reversed: rewards.rows.length, rewards: rewards.rows };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function reverseAffiliateRewardsForPaymentRefs(refs: string[], reason: string) {
  const clean = Array.from(new Set(refs.map((r) => String(r || "").trim()).filter(Boolean)));
  if (!clean.length) return { ok: true, reversed: 0, orders: [] as string[] };
  const orders = await q<{ id: string }>(
    `SELECT id FROM orders WHERE pay_ref = ANY($1::varchar[])`,
    [clean]
  );
  let reversed = 0;
  for (const order of orders) {
    const r = await reverseAffiliateRewardsForOrder(order.id, reason);
    reversed += r.reversed;
  }
  await audit("payment_reversal_seen", { refs: clean, reason, orders: orders.map((o) => o.id), reversed });
  return { ok: true, reversed, orders: orders.map((o) => o.id) };
}

export async function getAffiliateSummary(userId: string) {
  const member = await q1(
    `SELECT m.user_id, m.code, m.status, m.payout_kind, m.requested_at, m.approved_at,
            u.email, u.name
       FROM affiliate_members m JOIN users u ON u.id=m.user_id
      WHERE m.user_id=$1`,
    [userId]
  );
  const stats = await q1<{
    signups: number;
    active_signups: number;
    flagged_signups: number;
    paid_orders: number;
    pending_thb: number;
    approved_thb: number;
    paid_thb: number;
    reversed_thb: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM affiliate_attributions WHERE referrer_user_id=$1) AS signups,
       (SELECT COUNT(*)::int FROM affiliate_attributions WHERE referrer_user_id=$1 AND status='active') AS active_signups,
       (SELECT COUNT(*)::int FROM affiliate_attributions WHERE referrer_user_id=$1 AND status='flagged') AS flagged_signups,
       (SELECT COUNT(*)::int FROM affiliate_rewards WHERE referrer_user_id=$1) AS paid_orders,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE referrer_user_id=$1 AND status='pending'),0) AS pending_thb,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE referrer_user_id=$1 AND status='approved'),0) AS approved_thb,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE referrer_user_id=$1 AND status='paid'),0) AS paid_thb,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE referrer_user_id=$1 AND status='reversed'),0) AS reversed_thb`,
    [userId]
  );
  const rewards = await q(
    `SELECT r.id, r.order_id, r.status, r.amount_thb, r.commission_rate_bps, r.commission_thb,
            r.hold_until, r.created_at, r.approved_at, r.paid_at, r.reversed_at,
            u.email AS referred_email, o.package_code
       FROM affiliate_rewards r
       JOIN users u ON u.id=r.referred_user_id
       JOIN orders o ON o.id=r.order_id
      WHERE r.referrer_user_id=$1
      ORDER BY r.created_at DESC LIMIT 100`,
    [userId]
  );
  const signups = await q(
    `SELECT a.id, a.status, a.created_at, a.fraud_flags, u.email AS referred_email
       FROM affiliate_attributions a JOIN users u ON u.id=a.referred_user_id
      WHERE a.referrer_user_id=$1
      ORDER BY a.created_at DESC LIMIT 100`,
    [userId]
  );
  const settings = await getAffiliateSettings();
  return { member, stats, rewards, signups, settings };
}

export async function getAffiliateAdminDashboard() {
  const settings = await getAffiliateSettings();
  const totals = await q1(
    `SELECT
       (SELECT COUNT(*)::int FROM affiliate_members WHERE status='active') AS active_members,
       (SELECT COUNT(*)::int FROM affiliate_members WHERE status='requested') AS requested_members,
       (SELECT COUNT(*)::int FROM affiliate_attributions) AS signups,
       (SELECT COUNT(*)::int FROM affiliate_attributions WHERE status='flagged') AS flagged_signups,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE status='pending'),0) AS pending_thb,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE status='approved'),0) AS approved_thb,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE status='paid'),0) AS paid_thb,
       COALESCE((SELECT SUM(commission_thb)::int FROM affiliate_rewards WHERE status='reversed'),0) AS reversed_thb`
  );
  const members = await q(
    `SELECT m.user_id, m.code, m.status, m.payout_kind, m.requested_at, m.approved_at, u.email, u.name,
            COALESCE(a.signups,0)::int AS signups,
            COALESCE(r.pending_thb,0)::int AS pending_thb,
            COALESCE(r.approved_thb,0)::int AS approved_thb,
            COALESCE(r.paid_thb,0)::int AS paid_thb
       FROM affiliate_members m
       JOIN users u ON u.id=m.user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS signups
           FROM affiliate_attributions a
          WHERE a.referrer_user_id=m.user_id
       ) a ON true
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(commission_thb) FILTER (WHERE status='pending'),0)::int AS pending_thb,
           COALESCE(SUM(commission_thb) FILTER (WHERE status='approved'),0)::int AS approved_thb,
           COALESCE(SUM(commission_thb) FILTER (WHERE status='paid'),0)::int AS paid_thb
           FROM affiliate_rewards r
          WHERE r.referrer_user_id=m.user_id
       ) r ON true
      ORDER BY m.updated_at DESC LIMIT 200`
  );
  const rewards = await q(
    `SELECT r.id, r.order_id, r.status, r.amount_thb, r.net_amount_thb, r.commission_rate_bps, r.commission_thb,
            r.hold_until, r.created_at, r.approved_at, r.paid_at, r.reversed_at, r.reversal_reason,
            ref.email AS referrer_email, referred.email AS referred_email, o.package_code, o.pay_method
       FROM affiliate_rewards r
       JOIN users ref ON ref.id=r.referrer_user_id
       JOIN users referred ON referred.id=r.referred_user_id
       JOIN orders o ON o.id=r.order_id
      ORDER BY r.created_at DESC LIMIT 200`
  );
  const attributions = await q(
    `SELECT a.id, a.status, a.code, a.channel, a.fraud_flags, a.created_at,
            ref.email AS referrer_email, referred.email AS referred_email
       FROM affiliate_attributions a
       JOIN users ref ON ref.id=a.referrer_user_id
       JOIN users referred ON referred.id=a.referred_user_id
      ORDER BY a.created_at DESC LIMIT 200`
  );
  const auditRows = await q(
    `SELECT event_type, payload, created_at FROM affiliate_audit_events ORDER BY created_at DESC LIMIT 80`
  );
  return { settings, totals, members, rewards, attributions, audit: auditRows };
}
