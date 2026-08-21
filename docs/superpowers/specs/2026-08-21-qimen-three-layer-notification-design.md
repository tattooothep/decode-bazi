# Qimen Three-Layer Professional Notification Design

Date: 2026-08-21  
Status: approved visual direction; science and implementation gates defined  
Scope: notification backend, canonical Qimen engine, and mobile application

## 1. Objective

Replace the current single-hour Qimen notification presentation with one consolidated professional card based on three distinct canonical charts:

- `月家奇門` — month context;
- `日家奇門` — day context; and
- `時家奇門` — the actionable shichen chart.

The approved mobile presentation is concept C4: a nine-palace overview with a selected-direction explanation sheet. The reference mockup is:

`https://hourkey.io/mobile-ui-current/qimen-notification-options/c-subvariants/c4-explanation-sheet.png`

Every recipient must see the deity, door, and star for the selected palace in all three charts. Plain-language explanations help a general user understand why the hour is useful, while the original chart evidence remains visible so an experienced practitioner can interpret it independently.

The feature sends only when the canonical `時家` chart contains a clear recommendable direction for the configured purpose. If no direction passes, the occurrence is skipped and is never replayed.

## 2. Non-negotiable science rules

### 2.1 Three charts, not one overlay

Month, day, and shichen are three separately calculated Qimen charts. They must retain separate:

- calculation versions and source lineages;
- validity windows;
- nine-palace arrangements;
- heaven and earth plates;
- deities, doors, and stars;
- stems and instruments;
- formations, void, horse, vigor, and warnings; and
- provenance and failure state.

The UI may align the same compass palace across the three charts for comparison, but it must never claim that the three charts are one flight, one averaged chart, or a Zi Bai-style repeated-star overlay.

### 2.2 Hour chart is the action authority

`時家` determines whether a notification exists, the recommended direction, the purpose, and the actionable validity window. `月家` and `日家` are contextual evidence only.

Month or day evidence may be described as supportive, cautionary, neutral, conflicting, or unavailable only through versioned deterministic rules backed by approved sources. It cannot add to, subtract from, or average the hour score. It cannot manufacture an auspicious hour or silently cancel a hard hour-chart warning.

If the three layers disagree, the card says so explicitly. It does not collapse disagreement into a scalar score.

### 2.3 Preliminary engines are forbidden in production notifications

The current `年/月/日家` in-memory engines identify themselves as preliminary or simplified. No month/day output from those implementations may be placed in a production notification until the exact formula is source-governed and independently verified.

Before the producer is enabled, each required chart engine must return:

- a stable calculation version;
- a named school and source family;
- exact input instant and timezone/longitude treatment;
- exact `validFrom` and `validUntil` instants;
- a complete and internally consistent nine-palace chart;
- deity, door, and star for each palace;
- plate/stem evidence required to reproduce the chart; and
- fixed error codes when a chart cannot be produced.

Until all three engines meet this contract, the new producer fails closed and sends nothing. It does not reuse the hour chart as a fake month/day chart and does not fall back to simplified formulas.

### 2.4 Purpose must be explicit

Qimen does not have a context-free best direction. Every occurrence stores and displays its purpose. Existing users retain the current `travel` purpose unless they choose another supported purpose. Copy must say what the direction is useful for and must not present a travel result as universally auspicious.

### 2.5 School selection must be explicit and must not invent a decision scale

The actionable `時家` notification uses the existing source-verified `拆補 Chai Bu` profile (`profile_id = 1`) with true-solar time for this release. This preserves the already reviewed hour-chart lineage while month/day engines are made canonical.

`拆補 Chai Bu` and `置閏 Zhi Run` are methods of establishing/adjusting the Qimen Ju cycle. The classical source reviewed for this feature does not establish the product claim that one method is inherently for “small/immediate” matters and the other for “large/long-cycle” matters. Existing UI labels that make that distinction are product policy, not classical evidence, and must not be repeated as a scientific rationale.

`置閏 Zhi Run` (`profile_id = 4`) is not substituted into the card as a “bigger-picture layer.” A future user-selectable school may calculate the same requested scope through a separately verified `置閏` lineage, but results from different Ju-establishment methods must never be overlaid or compared as month/day/hour layers without an explicit comparison feature.

`月家` and `日家` must each declare their own canonical source family and calculation school. They may not be fabricated by running the hour `拆補` chart at a representative month/day time, nor may they be relabeled `置閏` context. If the approved sources do not establish a compatible month/day lineage, the feature remains disabled.

## 3. Notification cadence and eligibility

- Run a dedicated indexed-installation Qimen scheduler every minute. Qimen must not depend on the Today/Yam producer, a Yam-good occurrence, or another category's timer.
- Evaluate once for each canonical true-solar shichen occurrence.
- Send only when `時家` produces at least one direction that satisfies the existing canonical suitability, actionability, warning, door-vigor, and star-vigor gates for the configured purpose.
- Select the direction using the canonical hour-chart policy. Month/day context cannot reorder candidates.
- Deliver at the beginning of the actionable shichen. A late or quiet-hours occurrence is skipped, not queued for another shichen.
- Provider TTL remains five minutes. Delivery is blocked when less than or equal to one TTL remains in the immutable hour window.
- Deduplicate by account, installation, purpose, hour occurrence, calculation-version tuple, and selected direction.
- Existing entitlement, consent, owner isolation, location freshness, pause, quiet-hours, and installation-token checks remain mandatory.
- The dedicated scheduler writes a `qimen` heartbeat after every successful production run. Aggregate notification health fails when that heartbeat is stale, when the timer is disabled/inactive, or when the runtime command does not resolve through the exact current release.

## 4. One-card copy contract

The lock-screen message remains concise and names the selected palace evidence from every layer. Example shape:

> **ฉีเหมิน 21:00–23:00 · ตะวันตกเหมาะเจรจา**
>
> เดือน: 九天 · 開門 · 天任  
> วัน: 太陰 · 生門 · 天心  
> ยาม: 六合 · 開門 · 天心  
> ยามเป็นคำแนะนำหลัก; เดือนและวันเป็นบริบท แตะดูเหตุผลและผังเต็ม

The example is presentation shape only; runtime names must come from the immutable canonical snapshots.

The message must:

- fit the provider and durable-history copy limits without transport truncation;
- state a bounded hour window and purpose;
- name deity, door, and star for month, day, and shichen;
- distinguish plain-language interpretation from raw evidence;
- disclose conflict or unavailable context rather than hiding it; and
- avoid certainty, fear language, medical claims, and generic “best direction” copy.

When lock-screen privacy preview is disabled, the provider body is generic. The authenticated Notification Center detail still exposes the immutable non-location chart evidence.

## 5. Immutable data contract

### 5.1 Durable snapshot

One durable notification owns three immutable chart snapshots and one selected-direction decision. The durable backend representation contains:

- notification/account/installation ownership identifiers;
- occurrence type, purpose, locale, and calculation-version tuple;
- exact UTC and display validity windows for all three layers;
- three complete nine-palace chart maps;
- for each palace: direction, deity, door, star, plate stems/instruments, formations, vigor, void/horse flags, warnings, and source codes when available;
- selected direction and the canonical hour-chart recommendation evidence;
- deterministic per-layer explanation codes; and
- one literal allowlisted mobile route.

Coordinates, raw address, saved-place identity, and profile identifiers are forbidden from provider data, notification history responses, engagement rows, and logs.

### 5.2 Compact provider payload

FCM/Expo data must stay safely below the provider limit. It carries only:

- strict schema/event/account/notification identifiers;
- purpose, selected direction, and hour window;
- month/day/shichen version and selected-palace deity/door/star codes;
- conflict/unavailable flags;
- copy-safe explanation codes; and
- the literal Qimen notification-detail route.

The authenticated detail endpoint returns the full immutable snapshot. Provider payload and full snapshot must share a digest or equivalent attestation so a selected-palace mismatch fails closed.

### 5.3 Compatibility

- Existing Qimen notification payloads and history remain readable as legacy v1.
- New three-layer notifications use a new strict schema version and exact-key parser.
- Unknown, accessor, non-enumerable, duplicate, malformed, mismatched, or cross-account fields are rejected before navigation or engagement reporting.
- A v1 notification opens the legacy hour-only view; it is never backfilled with recomputed month/day charts.

## 6. Mobile C4 presentation

### 6.1 Default view for everyone

The screen shows:

1. actionable shichen window, selected direction, and purpose;
2. a nine-palace overview with the selected direction highlighted;
3. three labeled states in each palace: `เดือน 月`, `วัน 日`, and `ยาม 時`;
4. an explanation sheet titled “ทำไมทิศนี้จึงผ่าน”;
5. three plain-language rows, one per chart;
6. deity, door, and star for month, day, and shichen without an expert-mode gate; and
7. a statement that the hour chart governs action while month/day provide context.

Labels and shapes accompany color. Green, amber, gray, or any future palette may not be the only carrier of meaning.

### 6.2 Evidence available for independent interpretation

The same sheet exposes expandable, immutable evidence for each chart:

- complete nine-palace map;
- `天盤` and `地盤`;
- `奇儀` and palace stems;
- `八門`, `九星`, and `八神/九神` according to the selected school;
- `格局` and source-governed warnings;
- `旺相休囚死` where the engine provides it;
- void, horse, clash, and boundary evidence;
- calculation version, school, source label, and validity window.

The application explains fixed evidence codes in plain language. It does not use free-form generative text to invent a formation or verdict. Users may inspect the raw evidence and reach their own interpretation.

### 6.3 Accessibility and localization

- Screen readers announce direction, layer, deity, door, star, state, and validity window in that order.
- Focus enters the explanation heading and returns to the selected palace after dismissal on Android and iOS.
- Large-font layouts replace dense grid microcopy with labeled layer rows without hiding evidence.
- All supported app locales receive native layer labels and explanations; Chinese technical terms remain visible as secondary evidence.

## 7. Failure behavior

The occurrence is skipped when:

- any of the three canonical charts is missing, preliminary, malformed, outside its validity window, or mismatched to the requested instant;
- the hour chart has no clear recommendable direction;
- selected-palace deity, door, or star is absent in any layer;
- source/calculation versions are unknown or disallowed;
- entitlement, consent, owner, token, location, quiet-hours, or delivery fences fail; or
- the provider safety window is too short.

No fallback copies the hour chart into month/day, removes an inconvenient warning, chooses a second-best generic direction, or recomputes accepted history later.

## 8. Verification

### 8.1 Science

- Worked source fixtures for month, day, and shichen engines.
- Exact boundary fixtures for solar terms, solstices, Jia-Zi anchors, Li Chun, local civil day transitions, true-solar shichen, DST gaps/folds, and cross-midnight occurrences.
- Palace-level invariants for deity/door/star/stems and full nine-palace completeness.
- Independent comparison against a second implementation or manually verified canonical examples.
- Mutation tests proving that a one-step palace/component/boundary error is rejected.

### 8.2 Delivery and data

- Only good hour occurrences reserve notifications.
- A due Qimen occurrence is discovered without any Today/Yam row, profile, or scheduler being present.
- Month/day do not reorder the canonical hour direction.
- FCM and Expo compact payloads are equivalent and below the size budget.
- Full authenticated history replays the exact immutable three-chart snapshot after source/location expiry.
- Retry, TTL, quiet-hours, cap, deduplication, owner transfer, logout, and account deletion remain safe.
- Logs and public responses contain no coordinates or internal source paths.

### 8.3 Mobile

- Strict v1/v2 parsing and exact route dispatch.
- C4 rendering for supportive, cautionary, conflicting, neutral, and unavailable context.
- Every layer visibly and accessibly names deity, door, and star.
- Full-evidence expansion, large text, dark/light theme, screen-reader order, focus restoration, and back navigation.
- Backend snapshot to provider to history to mobile parity.

## 9. Three-signature release gate

The goal is not complete until three independent reviewers issue `SIGNED APPROVE` for the same exact clean backend and mobile commit pair:

1. **Science signature:** verifies sources, school separation, worked examples, boundary truth, and that preliminary formulas cannot reach production.
2. **Backend/delivery signature:** verifies immutable data, privacy, eligibility, retry/TTL, provider parity, concurrency, and production defaults.
3. **Mobile/end-to-end signature:** verifies strict parsing, C4 semantics, accessibility, legacy compatibility, and exact artifact/source provenance when an APK is built.

A reviewer may not sign their own implementation. Any Critical or Important finding resets the affected signatures.

Three source signatures alone do not prove that a phone receives a notification. After source 3/3 and before this goal can be marked complete, the exact signed build must pass one authorized real-device canary on the registered installation:

1. the scheduler selects a known-good canonical occurrence and creates exactly one durable reservation;
2. the provider accepts the exact v2 message within its five-minute TTL;
3. Android displays the notification in the system tray with the expected channel, sound, and visible lock-screen copy while the app is backgrounded or closed;
4. tapping it opens the matching immutable C4 detail, with the same occurrence, direction, purpose, and three selected-palace evidence tuples; and
5. backend receipt/history evidence ties the device result to the exact signed backend/mobile commit pair and artifact digest.

The canary record also captures the dedicated Qimen systemd timer/service state, scheduler heartbeat age, worker heartbeat age, provider attempt identifier, notification channel, and device installation identifier hash. A green device canary with a disabled or stale production scheduler is not release evidence.

An in-app history row, provider acceptance, source test, emulator notification, or manually injected local notification is not sufficient by itself. A failed canary blocks completion and triggers diagnosis before any deployment/store approval.

## 10. Explicit exclusions

- No Year `年家` layer in this feature.
- No Zi Bai, Period 9, house natal chart, Ba Zhai, or cross-science score.
- No scalar confidence percentage or averaged auspiciousness.
- No generic “best for everything” direction.
- No automatic production deployment. The single real-device canary required by Section 9 runs only as the explicit release acceptance test on the registered test installation; ordinary automated tests never send a real push.
