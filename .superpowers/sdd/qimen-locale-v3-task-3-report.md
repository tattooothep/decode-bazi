# Qimen locale v3 — Task 3 implementation report

Date: 2026-08-21

## Source and commit

- Exact base: `d19734c7deaee6f79412fd527cc14282aac9ec57`
- Implementation: `68b21bbe9eb1d50ec0df2beba4e7deffb32dbba6` (`feat: localize qimen component alerts`)
- Scope: backend Layer 3 registration, delivery/scheduler policy, provider/history copy, and PostgreSQL capability migration only.

## Implemented

- Registration accepts Qimen payload schemas 1, 2, and 3, while only schema 3 enables a new C4 installation/due occurrence.
- Preference refreshes likewise enable only schema-3 installations.
- The additive migration widens the token constraint to `(1,2,3)`; rollback maps 3 to 2 before restoring `(1,2)`.
- New scheduler occurrences require strict schema-v3 snapshot verification and produce only `qimenV3` provider data.
- Thai, English/fallback, and Chinese copies resolve names and intrinsic quality from the canonical component catalog. Non-Chinese copy retains Han; Chinese does not duplicate Han.
- Every rendered component has an attested presentation glyph, followed by a four-state localized legend and explicit hour-chart authority. Invalid digest, unknown code, or mismatched quality rejects closed.
- Qimen reservation binds exact v2 or v3 bytes to the corresponding immutable snapshot and token capability. Existing v2 reservation/history parsing and retry policy remain supported.
- Provider delivery uses the same current owner-locale copy persisted to notification history.

## TDD evidence

RED was captured before production changes:

- `npx tsx scripts/test-qimen-scheduler.mts` exited 1 because durable delivery lacked `qimenV3` binding.
- `npx tsx scripts/test-qimen-push-registration.mts` exited 1 because registration accepted only schemas 1 and 2.
- `npx tsx scripts/test-qimen-migration.mts` exited 1 because the component-quality v3 migration was absent.
- A follow-up scheduler RED exited 1 until Qimen provider copy used the exact owner-locale history copy.
- A final copy-format RED exited 1 until component glyph adjacency and the complete four-state legend were present.

Fresh GREEN evidence after the final change:

- `npx tsx scripts/test-qimen-scheduler.mts` — PASS (`qimen dedicated scheduler policy tests passed`).
- `npx tsx scripts/test-qimen-push-registration.mts` — PASS (`QIMEN_PUSH_REGISTRATION_OK`).
- `npx tsx scripts/test-qimen-migration.mts` — PASS.
- `npx tsx scripts/test-qimen-migration-db.mts` against a real disposable PostgreSQL schema — PASS, including 10,020-row concurrent claiming and v3 apply/rollback.
- `npx tsx scripts/test-mobile-push-retry-worker.mts` — PASS, 74/74 checks, including exact `qimenV2` binding and old-v2 retry policy.
- `npx tsc --noEmit` — PASS.
- Schema-v3, immutable-v2 snapshot, compact-v2 payload, and stored-detail regression tests — PASS.
- `git diff --check` and `git diff --cached --check` — PASS before the implementation commit.

Fixture body sizes were Thai 276, English/fallback 356, and Chinese 88 characters; the builder rejects any body over 400 characters.

## Boundaries and rollback

- No deployment or production migration was performed.
- The C4 producer-enable guard/state was not changed.
- No mobile repository or mobile file was touched.
- Strict schema-v2 snapshot/history verification was not weakened.
- Database rollback: apply `migrations/20260821_mobile_qimen_component_quality_v3.rollback.sql`; it preserves data and maps token schema 3 to 2.
- Code rollback: revert implementation commit `68b21bbe9eb1d50ec0df2beba4e7deffb32dbba6` together with the database rollback.

## Concerns / follow-up

- The worktree has no `.env.local`, and the long-running shared PostgreSQL role rejects the password recorded in both the checkout and container startup environment. The real DB test therefore used a unique temporary login role and removed it afterward; the shared credential was not modified. This is an environment-maintenance concern, not a Task 3 code failure.
- No live route call, provider send, deployment, or device canary was authorized or performed; those remain release-task gates.
- Independent reviewer approval remains for the parent/release review loop because this dispatched task explicitly prohibited spawning reviewers.

## Reviewer follow-up: schema-v3 privacy-safe provider parity

Implementation commit: `ec70cb508396801eaf4862148f7860026f60f348` (`fix: preserve qimen v3 provider copy`).

The review found that default `privacy_preview=false` passed Qimen history copy through the generic redaction path, so schema-v3 provider notification copy did not match the full C4 copy stored in history. The narrow correction gives only attested Qimen schema 3 an explicit privacy-safe full-copy exception: the exact owner-locale history title/body are used for the provider message and the attempt is recorded with `privacy_safe=true`. Other notification kinds and the generic preview setting are unchanged. Schema 2 continues through its legacy item-copy path byte-for-byte, including `privacy_safe=false` when full preview is enabled.

Follow-up RED evidence captured before the correction:

- `npx tsx scripts/test-mobile-push-retry-worker.mts` exited 1 because the schema-v2 full-preview regression exposed the earlier over-broad Qimen history-copy behavior.
- `npx tsx scripts/test-qimen-scheduler.mts` exited 1 because no schema-3-only privacy-safe exception existed.

Fresh follow-up GREEN evidence:

- `npx tsx scripts/test-qimen-scheduler.mts` — PASS.
- `npx tsx scripts/test-mobile-push-retry-worker.mts` — PASS, 78/78 checks. The disposable database integration proves that with `privacy_preview=false`, schema-v3 parent history title/body exactly equal the persisted provider-message notification title/body, the attested status and hour-authority text remain present, and the copy contains no coordinates, account identifier, user UUID, or personal-name label. It also proves the explicit schema-v2 legacy-copy regression.
- `HOURKEY_MOBILE_ROOT=/root/worktrees/zibai-three-layer-mobile HOURKEY_MOBILE_SHA=1c4c228040d67028f116c23b38efc47711fc58db npx tsx scripts/test-notification-source-replay-task3.mts` — PASS (`NOTIFICATION_SOURCE_REPLAY_TASK3_OK notices=10`); the pinned mobile checkout was read only.
- `npx tsx scripts/test-notification-integrity-contract.mts` — PASS.
- `npx tsx scripts/test-notification-atomicity-task3.mts` — PASS.
- `npx tsc --noEmit` — PASS.
- `git diff --check` and `git diff --cached --check` — PASS.

One unrelated legacy harness remains stale: `scripts/test-notification-cap-task3.mts` creates a reduced `users(id,timezone)` fixture, while the current delivery query requires `users.is_active`, so it fails during setup before reaching its assertions. This follow-up did not broaden scope to rewrite that fixture; the scheduler, retry/disposable-DB, relevant privacy/integrity/atomicity, replay, and type checks above all pass.
