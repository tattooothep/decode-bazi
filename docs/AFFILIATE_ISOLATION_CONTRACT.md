# Affiliate ↔ Platform Admin isolation contract

**Status:** locked for dual-team work · 2026-07-09  
**Audience:** Platform admin team + Affiliate team

## Ownership

| Owner | Owns |
|-------|------|
| **Platform (main admin)** | `users`, `orders`, `hour_transactions`, `hour_balance` writes via credit services, packages **checkout SoT**, RBAC (`admin_*`), User 360, support notes, refunds + **yam clawback** |
| **Affiliate team** | `affiliate_members`, `affiliate_attributions`, `affiliate_rewards`, `affiliate_audit_events`, partner portal UI, commission approve/pay UX, `affiliate_*` app_settings |
| **Shared (dual review)** | `fulfillOrder` hook points, order status machine, commission rate settings keys, tier enum |

## Tier enum (product + admin)

Only: **`free` | `premium` | `master`**

Forbidden in admin set/filter: `pro`, `vip`

## Packages source of truth

- **Live checkout / fulfill:** `src/lib/payment/packages.ts` (`getPackage`, `PACKAGES`) — **single SoT**
- Admin `/admin/packages` DB catalog is **display/promo tooling only** until explicitly promoted; do not invent a second checkout path

## Referral codes

- Live codes live on **`affiliate_members.code`** (e.g. `HK-…`)
- Do **not** add `users.referral_code` without dual review
- Attribution: first-touch, one row per `referred_user_id` in `affiliate_attributions`

## Money events

| Event | Producer | Consumer |
|-------|----------|----------|
| `order.paid` | `fulfillOrder` (platform) | `createPendingAffiliateRewardForOrder` |
| `order.refunded` | Platform refund helper / webhooks | `clawbackYamForOrder` + `reverseAffiliateRewardsForOrder` |

### Refund rules

1. Clawback granted yam (`reason=refund_clawback`, `ref_payment_id=order_<id>_refund`) — **platform only**
2. Reverse affiliate reward statuses pending/approved/paid → reversed — **affiliate lib**
3. Mark order `refunded`
4. Affiliate must **never** `UPDATE users.hour_balance` directly

## Permission keys (seeded for affiliate console)

```
admin.affiliate.members.read|approve|suspend
admin.affiliate.attributions.read|review
admin.affiliate.rewards.read|approve|pay|reverse
admin.affiliate.settings.write
admin.affiliate.audit.read
```

Role **`affiliate_ops`** has approve/review, **not** `admin.users.credit.adjust`.  
Role **`finance`** may `admin.affiliate.rewards.pay` (separation of duties).

## Forbidden for affiliate worktree

- Editing `payment/packages.ts` prices/yam
- Forking `fulfillOrder` body
- Writing `hour_balance` / inventing parallel commission ledgers
- Treating `org_members.admin` as platform staff

## Platform admin rules

- Do not write to `affiliate_*` tables from `/api/admin/members`
- User 360 shows affiliate **read-only** + deep-link `/admin/affiliate`
- Keep `ADMIN_EMAILS` as permanent break-glass

## Product entitlement / freemium (2026-07)

Platform may change free signup yam, trial days, and capability caps via `src/lib/product-entitlement.ts` **without** dual review **if and only if**:

1. No edits to `src/lib/affiliate.ts`
2. No writes to `affiliate_*` from membership/signup defaults
3. No change to `fulfillOrder` commission hook order
4. No change to checkout prices/yam in `payment/packages.ts` without dual review

Free 1000 yam + 30-day trial is **not** a payable conversion event for affiliates.

## Contact

Change this file only with dual approve from both owners.
