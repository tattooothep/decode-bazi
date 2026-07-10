# r481 — member A+B+C (safe, no aff touch)

**Base:** clone of `decode-app-r480-affiliate-pilot`  
**Goal:** minimal membership/auth fixes only · `src/lib/affiliate.ts` **unchanged**

## A — org membership
- New `src/lib/ensure-org-member.ts` (insert with `gen_random_uuid()` + ON CONFLICT)
- All signup paths (email/form/phone/mobile/google/line) use it
- SQL backfill: +276 `org_members` rows · missing after = 0

## B — password session revoke
- `/api/auth/reset-password` → `bumpSessionVersion` + re-cookie + invalidate old reset tokens
- `/api/account/password` → bump + re-cookie for current device

## C — identity / admin clarity
- Email lower on signup + login (`lower(email)`)
- Soft-delete clears `phone` (kept in `deleted_snapshot`)
- Admin members list: `has_self_profile`, phone unverified hint
- verify-phone / signup paths set session `sv`

## Rollback
```bash
ln -sfn /root/releases/decode-app-r480-affiliate-pilot /root/releases/current
# or: ln -sfn $(readlink /root/releases/current.pre-r481.path) /root/releases/current
systemctl restart hourkey-decode@{3349,3350,3351,3352}
```
Note: backfill data stays (safe). Code rollback only.
