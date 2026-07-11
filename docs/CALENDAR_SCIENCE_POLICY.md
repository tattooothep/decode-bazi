# Calendar Science Policy

## Boundary

Hourkey keeps two layers separate:

1. Classical categorical inputs: Gan-Zhi, solar terms, 建除十二神, 黃黑道十二神,
   28宿, 紫白日, 神煞, 宜 and 忌.
2. Hourkey product scoring: numeric weights, 5-95 normalization, score bands,
   hard caps, ranked-card blending, and broad-goal aggregation.

The interface must not describe Hourkey's numeric weights as numbers taken
verbatim from a classical text. Classical labels and Hourkey scores are both
deterministic, but they are different kinds of evidence.

## Identity

Personal calculations are loaded from `profiles` by the server. Both
`org_id` and `created_by_user_id` must match the authenticated session.
`profileId`, `userId`, `isSelf`, and `source` are returned in the calculation
context. Browser birth caches are never calculation inputs.

## Universal and Personal

Universal Tongshu never receives a natal branch, birth date, or profile id as
a scoring input. Personal status may cap or lower an activity after universal
status has been computed. A personal clash cannot mutate the universal score.

## Unknown Data

An unknown 神煞 is neutral and visible as unknown. It is never assumed to be
auspicious. All stars are scored before plan-specific display limits apply.

## Time

Daily values use a noon reference unless a selected time is explicitly shown.
The reference 子 hour in the four-pillar explainer is labeled 23:00. A profile
with unknown birth time has no natal hour pillar.

## Sources

- `tyme4ts` for civil/lunar conversion, Gan-Zhi and solar-term calculations.
- `src/lib/luck-engine/tongshu-live.ts` for audited 建除, 黃黑道, 28宿 and 紫白日.
- `src/lib/star-dict-th.ts` for the approved 神煞 rule registry.
- `src/lib/tongshu-universal.ts` for the explicitly Hourkey-owned score policy.
