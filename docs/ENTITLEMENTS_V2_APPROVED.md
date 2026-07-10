# Hourkey entitlements v2 - approved contract

Status: approved for implementation, not deployed  
Contract version: `entitlements-v2-20260710`

## Commercial rules

- New accounts receive 1,000 yam. Yam never expires.
- New-account trial lasts 14 days. Existing `trial_ends_at` values are never shortened or backfilled.
- Premium is a 30-day pass: THB 399 and +500 yam to the current balance.
- Master is a 30-day pass: THB 990 and +2,000 yam to the current balance.
- Passes do not auto-renew and do not refill yam every month.
- Annual offers stay hidden until their grant logic is commercially correct.
- Top-ups remain 100/THB 99, 550/THB 449 (popular), 1,700/THB 1,290 (best value).

## Product behavior

- Locked capability remains visible with a lock, plan requirement, and a real but limited preview.
- Every lock is enforced again on the server. CSS or hidden controls are not authorization.
- Chart calculations keep identical correctness on every plan; plans change depth, time range, profiles, and technical evidence.
- Forecast and Palmistry expose the same product result on all four plans. Their AI work consumes yam.
- Sifu always returns a full answer with conclusion, evidence, reasoning, and actions. There is no short-answer tier.
- AI requests display an estimate, reserve before provider work, settle the exact usage once, and refund the reservation on failure.
- The machine-readable page matrix is `src/lib/product-page-entitlements.ts` and is returned to web/mobile clients in `caps.pages`.

## Affiliate invariant

- Referral attribution remains first-touch and one row per referred user.
- Signup yam and the 14-day trial are not payable conversion events.
- Affiliate reward is created only by a successfully paid order through `fulfillOrder`.
- Refunds claw back product yam and reverse the affiliate reward.
- Entitlement work does not write to `affiliate_*` tables or change commission rates.
- Annual offers being hidden must not remove or reorder the paid-order affiliate hook.

## Release gates (five signatures)

1. Contract: all four plans match the approved page matrix and existing users retain dates/balances.
2. Security: direct API calls cannot bypass locks or ownership.
3. Billing: AI reserve/settle/refund is exact and idempotent.
4. UX: locks, pricing, copy, and all nine locales work on desktop and mobile.
5. Regression: build, core calculations, checkout, refund, and affiliate paid-order flow pass without deploying live.

