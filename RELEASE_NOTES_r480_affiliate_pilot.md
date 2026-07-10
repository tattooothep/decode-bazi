# r480 · affiliate pilot overlay (2026-07-09)

Base: r479 platform admin (`decode-app-r479-admin-p0-p1`).
Commit trace: d50b1f6 `feat(affiliate): add pilot referral ledger`.

Scope:
- Replace affiliate stub with full pilot ledger implementation.
- Add user portal `/referral` and `/affiliate`.
- Add admin console `/admin/affiliate` and `/api/admin/affiliate`.
- Add referral capture for email/phone/form/Google/LINE signup.
- Add minimal paid-order hook in `src/lib/payment/credit.ts` only; preserve r479 refund/yam clawback.
- Keep r479 platform admin/auth/RBAC/orders/packages work intact.

Rollback:
```bash
ln -sfn /root/releases/decode-app-r479-admin-p0-p1 /root/releases/current
systemctl restart hourkey-decode.service hourkey-decode@3350.service hourkey-decode@3351.service hourkey-decode@3352.service
```
