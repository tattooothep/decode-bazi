# Qimen/Yam notification truth contract

## Runtime contract

- The scheduler requests canonical profile `1`: 時家奇門, 拆補, true solar time, purpose `travel`.
- The notification layer does not calculate a chart. It consumes the canonical engine response and requires calculation provenance, deity, door, star, beginner reading, and a valid eight-direction palace.
- Palace selection is not score-only. A candidate is recommendable only when the engine marks it `suitable`/`usable`, actionable, without a hard warning, and neither its door nor star is in `囚`/`死` according to the engine's `wang_xiang_status` order. Detected engine/classical warnings downgrade the result to caution.
- If no palace qualifies, copy says there is no clear travel direction. It may identify the highest candidate for chart review but must not call it the best or auspicious direction.
- Copy names the selected deity, door, and star and states the inward-rounded true-solar validity window. TH/EN/ZH durable and provider bodies must fit 400 characters without transport truncation.
- The strict mobile payload remains v1-compatible. Immutable source facts retain purpose, school, profile, selected palace/components, component qualities/vigor, warnings, corrected time, and exact occurrence bounds.
- Yam keeps its existing civil Today Hours range. Its Qimen addendum is sampled at the range midpoint and labels the separate true-solar Qimen window; it never claims the two boundaries are identical.
- Yam/Qimen provider TTL is 300 seconds. Retry fails closed when occurrence expiry is missing or less than/equal to one provider TTL away.

## Source governance

- `data/library/qmdj/auth-th/wangxiang-vigor-th.md`: 旺相休囚死 weighting; never a standalone verdict.
- `data/library/qmdj/auth-th/geju-formations-th.md`: detected 吉格/凶格 must be read with door, star, deity, and vigor.
- The canonical engine output remains primary. Notification code must not reconstruct 飛盤/局/節氣 or invent formations.

## Operational safety

- The old `/root/qimen-api/scripts/push-scan-cron.js` web-push path is not an approved producer. It must remain contained using `docs/runbooks/legacy-qimen-push-containment.md` after three independent approvals.
- Tests and review must not send real push notifications. Production containment/deploy requires its own exact inventory, approvals, and post-change verification.
