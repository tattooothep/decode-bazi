# r479 · admin P0+P1 only (2026-07-09)

## Scope
Platform admin multi-admin (RBAC), User 360, orders refund+yam clawback, support tickets,
AI cost kill switches, PDPA admin tools, coupon checkout, finance margin, session revoke,
impersonate.

## NOT included (affiliate team owns)
- Full affiliate product code (portal, commission approve/pay UI, partner flows)
- Only a **minimal stub** `src/lib/affiliate.ts` so optional reverse hooks resolve (no-ops if unused)
- Live base was r478 which had **no** full affiliate lib; we did not ship workspace affiliate system

## Method
1. Cloned r478 → r479
2. Overlayed only platform-admin file list (~53 files)
3. Merged payment webhooks/credit carefully to avoid pulling full affiliate system
4. `npm run build`
5. `ln -sfn` current → r479; restarted hourkey-decode + @3350-3352

## Rollback
```bash
ln -sfn /root/releases/decode-app-r478-palm-grok-fandhong-profile /root/releases/current
systemctl restart hourkey-decode.service hourkey-decode@3350 hourkey-decode@3351 hourkey-decode@3352
```
Pre-path saved: /root/releases/current.pre-r479.path

## Notify affiliate team
Deploy r479 = platform admin only. Stub affiliate.ts is temporary no-op reverse helpers.
When their full affiliate lands, replace stub with their module (do not lose reverseAffiliateRewards* API).
