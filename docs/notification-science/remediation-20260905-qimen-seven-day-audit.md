# Qimen seven-day no-send audit — 2026-09-05

Status: bounded production read-only audit. This is evidence for remediation, not a rollout or final science signature.

## Result

The last-seven-day Qimen silence was **not a push-provider rejection**. The deployed scheduler reported 32 due evaluations and skipped all 32 before it reserved a durable Qimen occurrence. PostgreSQL contains zero Qimen occurrences, zero linked pushes, zero Qimen parent push logs, and zero Qimen delivery attempts in the audited window. FCM and Expo therefore had no Qimen payload to send.

The strongest safely supportable diagnosis is **pre-reservation recommendation filtering**, not “there were no good hours.” The only currently enabled installation most recently ended with the mutable reason `no_recommendable_direction`. That reason means the canonical builder returned no recommended snapshot after its boundary wait; it does not identify whether the failed condition was score, hard count, warnings, evidence validity, star/door strength, or engine-contract validation.

The known cached nine-star vigor defect from June is real, but it does not explain the latest September sample. For the latest sample, the deployed static order and the Yanbo nine-star month order coincide, and at least one raw direction passes the deployed shared star-and-door strength gate. The exact downstream rejection cannot be recovered because the scheduler intentionally calls the external engine with `skip_save: true`, does not persist rejected nine-palace results, and retains only one overwriteable installation-level skip reason.

## Audit boundary and safety

- Database clock at snapshot: `2026-09-04T23:36:26.260Z` / `2026-09-05 06:36:26.260 Asia/Bangkok`.
- Window start: `2026-08-28T23:36:26.260Z` / `2026-08-29 06:36:26.260 Asia/Bangkok`.
- PostgreSQL access used a read-only transaction, `default_transaction_read_only=on`, and a 10-second statement timeout. Environment credentials were parsed internally; no token, account ID, coordinates, or other PII was printed or copied into this report.
- The external Qimen SQLite reference was opened with `sqlite3 -readonly`. No application module under `/root/qimen-api` was imported, and no calculate/save request was made.
- No production file, service, database row, push registration, credential, or provider state was changed.

The runtime audited was `/root/releases/current`, resolving to `/root/releases/decode-app-r573-network-morning-final`. The deployed scheduler fingerprint was `1d02cfa1…b0b2ff`; the deployed canonical occurrence builder fingerprint was `7f115fc3…a44fb`. Concurrent uncommitted branch work was deliberately excluded from causal claims about production.

## Seven-day event chain

The scheduler log contains one compact summary per timer invocation. The latest 10,081 summaries span approximately 168 hours and align with the retained systemd journal from `2026-08-29T00:00:00Z` onward. The timer remained active, the service exits were successful, and its heartbeat was current at the audit snapshot.

| Scheduler outcome | Runs |
| --- | ---: |
| `due=0, reserved=0, skipped=0` | 10,051 |
| `due=1, reserved=0, skipped=1` | 28 |
| `due=2, reserved=0, skipped=2` | 2 |
| Total due / reserved / skipped | **32 / 0 / 32** |

All retained due work occurred on 2026-09-04 UTC:

| UTC date | Bangkok date | Due | Reserved | Skipped |
| --- | --- | ---: | ---: | ---: |
| 2026-09-04 | 2026-09-04 | 24 | 0 | 24 |
| 2026-09-04 | 2026-09-05 | 8 | 0 | 8 |

The first retained due run was `2026-09-04T00:45:00.525Z`; the last was `2026-09-04T23:32:00.577Z`. The preceding retained days had no due claims, so most of the seven-day no-send interval was not provider activity or failed delivery—it was simply `due=0` scheduler work. Current installation state cannot prove why no row was due historically.

There were zero scheduler-error summaries in this span. The retained service journal likewise showed successful exits, rather than a crash loop or timeout hiding the due work.

PostgreSQL confirms the downstream absence for the exact database window:

| Durable production record | Count |
| --- | ---: |
| `mobile_qimen_occurrences` | 0 |
| Persisted Qimen occurrence snapshots / nine-palace layers | 0 |
| Linked Qimen pushes | 0 |
| Qimen parent rows in `mobile_push_log` | 0 |
| Qimen provider delivery attempts | 0 |

There is consequently no causal path from Expo `InvalidCredentials` to this seven-day Qimen silence. Historical Qimen delivery does include 9 FCM provider-accepted attempts and 2 dead Expo `InvalidCredentials` attempts, but those are outside this window. The retained all-time occurrence is an older 2026-08-21 reservation and cannot explain September filtering.

## Current inventory (safe aggregate)

At the audit snapshot there were five Qimen installation rows:

| Installation state | Count | Route/capability state |
| --- | ---: | --- |
| Enabled and presently eligible before time/entitlement | 1 | Android FCM, schema 3, active owner, preference on, fresh location |
| Disabled, active legacy registration | 2 | Android Expo, schema 1, active owner, preference on, fresh time-bounded location |
| Disabled, no active token | 2 | Preference on; stale/expired location |

All five owning users currently had the Qimen preference enabled. Four rows are excluded by installation-level state, not by their user preference. This is a current snapshot only; it must not be projected backward as a historical ownership inventory.

Current mutable skip-state aggregation is one enabled row at `no_recommendable_direction` and four disabled rows with no skip reason. This is not an event history.

The sole enabled row had foreground permission, a fresh location lease, schema 3, an active FCM registration, and a future `next_due_at` (`2026-09-05T00:17:06.634Z`, 07:17 Bangkok). Its latest update was `2026-09-04T23:32:00.865Z`, and its current `last_skip_reason` was `no_recommendable_direction`. Because that field is overwritten, it cannot prove that all 32 skips shared that reason.

## What the deployed rules prove

The live scheduler's `processClaim` gates proceed in this order:

1. owner/context lookup;
2. fresh location lease and valid permission;
3. Qimen payload schema exactly 3;
4. pause and quiet-hour checks;
5. entitlement;
6. canonical engine call and advisory build;
7. boundary stabilization;
8. durable occurrence admission and later delivery.

See the deployed equivalents of [`scripts/mobile-qimen-push-cron.cjs`](../../scripts/mobile-qimen-push-cron.cjs) around `processClaim` and [`src/lib/qimen-notification-advisory.cjs`](../../src/lib/qimen-notification-advisory.cjs) around `buildQimenAdvisory`.

For the latest row to end as `no_recommendable_direction`, it passed the earlier location, schema, pause, quiet-hour, and entitlement branches. After stabilization, the builder still returned `null` instead of a recommendable snapshot. No occurrence is admitted in that branch.

Under the deployed advisory, an eligible direction requires all of:

- display score at least 60;
- beginner `hard_count` exactly zero;
- both star and door vigor in `旺` or `相` using the single cached `chart.wang_xiang_status` map;
- structurally valid warning evidence;
- no canonical hard warning;
- no more than two canonical soft warnings;
- matching time/provenance/engine-contract fields.

The selection prefers a `suitable` direction with no soft warnings, then any eligible direction. Therefore `no_recommendable_direction` is not equivalent to “no suitable reading,” and the compact reason cannot isolate any one failed predicate.

## Latest September sample versus the June defect

Without exposing the user's location, the latest enabled-row evaluation time reconstructs to these canonical pillars: year `丙午`, month `丙申`, day `壬午`, hour `癸卯`; solar term `处暑`; 拆補 upper yuan. The read-only profile-1 reference lookup resolves hour chart 580 (`陰遁一局`, pillar code 40).

| Evidence | June witness (chart 1062) | Latest September reference (chart 580) |
| --- | --- | --- |
| Cached `wang_xiang_status` | `火土木水金` | `土金火木水` |
| Yanbo nine-star month order | `木火水金土` for 午 | `土金火木水` for 申 |
| Star-map consequence | Material mismatch | Cached and month-derived star orders coincide |

Thus the June witness demonstrates a genuine cached-star-vigor defect, but extrapolating it as the cause of the latest silence would be false.

The latest raw reference has two non-center directions whose star and door elements are both within the deployed map's first two strength positions:

| Direction | Star | Door | Other retained reference evidence | What it proves |
| --- | --- | --- | --- | --- |
| SW | 天柱 / metal | 死門 / earth | star inauspicious, door severe, void, `BAI_HU_CHANG_KUANG` | Passes shared strength only; negative evidence plausibly prevents admission |
| W | 天心 / metal | 驚門 / metal | star great-auspicious, door inauspicious, 九天 auspicious, not void, no stored formation | Passes shared strength; final eligibility remains unknown |

This lookup is not a substitute engine calculation. It proves only that cached vigor alone cannot explain the latest rejection. It does **not** establish that W was a good/recommendable hour: the reference database does not retain the runtime display score, hard count, dynamic stem/source warnings, normalized evidence, beginner reading, or returned engine contract for this scheduler evaluation. Door-season strength methodology is also not resolved by this comparison.

The external calculation-run table reinforces the observability gap: it has zero all-time rows with `source_endpoint='mobile-notification'`, consistent with the scheduler's `skip_save: true`. Recent rows belong only to interactive `calculate`/`divine` sources and were not used as substitutes for the user's notification evaluation.

## Minimal corrective evidence needed

Do not weaken recommendation gates, synthesize a “good hour,” disable registrations, or route around Expo based on this audit. The minimal diagnostic hardening is append-only, sanitized evaluation telemetry before occurrence admission:

- one aggregate reason code per due evaluation (engine-contract invalid, no parsed palace, below score, hard count, weak star, weak door, invalid warning evidence, hard warning, excess soft warnings, or recommendable);
- gate counts across the nine palaces, plus chart/reference version and calculation method—without account ID, coordinates, token, title/body, or raw personal input;
- an explicit distinction between engine/build failure and a valid chart with zero eligible directions;
- retention long enough to cover the notification audit window.

This preserves the current filters and durable occurrence ownership while making the next no-send incident attributable. The existing mutable `last_skip_reason` can remain an operational hint, but it is insufficient as history.

## Expo/EAS authority recheck

No usable authenticated EAS CLI surface was available on the host:

- no `eas` executable on `PATH`, local project binary, global `eas-cli`, or package dependency;
- no `EXPO_TOKEN` presence in the process or inspected service environment files;
- the Expo state file exists but contains no detectable auth material;
- no EAS CLI config file was present.

No installation, login, `whoami`, credential read, or credential mutation was attempted. Repairing the independent Android Expo `InvalidCredentials` condition still requires an external operator with the correct Expo/EAS project credential authority. That issue remains real for legacy Android Expo registrations, but it is not the cause of this Qimen seven-day pre-reservation silence.

## Audit conclusion

Production scheduling was alive. It evaluated 32 due claims and admitted zero. The latest observable rejection is `no_recommendable_direction`, after the early operational gates, but the precise science/contract predicate is not recoverable from retained data. The September reference disproves cached nine-star vigor as a sufficient explanation for the latest sample; the June mismatch remains a separate confirmed defect. Any stronger statement—especially “there were no good hours”—would exceed the evidence.
