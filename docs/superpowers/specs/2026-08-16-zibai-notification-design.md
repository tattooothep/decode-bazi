# Zi Bai Daily and Shichen Notification Design

Date: 2026-08-16
Status: approved design; implementation not started
Scope: mobile application and notification backend

## 1. Purpose

Add opt-in notifications for the time-varying Zi Bai flying-star charts (`紫白飛星`) at two cadences:

1. one daily summary; and
2. one notification at each Chinese double-hour (`時辰`) boundary.

This feature concerns the year/month/day/hour Zi Bai time charts. It is not the Period 9 (`九運`) house chart and must not use Period-9 star prosperity values.

The existing Qi Men ranking remains unchanged. Zi Bai remains an independent evidence layer and must not silently reorder Qi Men directions.

## 2. Product decisions

### 2.1 Settings

Create a new strict notification kind, `zibai`, with settings scoped to each installation:

- `Zi Bai daily summary`
- `Zi Bai every shichen`
- preferred daily-summary time, default `07:00` in the installation timezone

All settings default to off. Existing notification, daily-fortune, Yam, service, or location consent must not enable them implicitly.

The Luopan screen also gains `Show Zi Bai over saved-house plan`. This is a display setting, not a notification setting. It does not create an additional notification feed.

### 2.2 Cadence

- Daily summary: at the user-selected local civil time.
- If the daily-summary time falls inside quiet hours, send it once at the first eligible time after quiet hours.
- Shichen: at each boundary derived from true apparent solar time.
- Shichen notifications inside quiet hours are skipped permanently and are not queued or replayed.
- A shichen notification has a dedicated cap of one per shichen and at most twelve per apparent-solar day.
- The Zi Bai cap is separate from the caps for Yam, daily fortune, goals, security, service, shrine, saved-date, and Qi Men notifications.

### 2.3 Focus stars and copy

Each notification explains the four focus stars and their directions:

- `一白` — One White
- `二黑` — Two Black
- `五黃` — Five Yellow
- `九紫` — Nine Purple

The expanded notification includes a useful recommendation for all four focus stars. A tap opens the complete nine-palace chart. Copy must state a bounded period, the relevant direction, the star-palace elemental relationship, and a practical action. It must not predict certain harm, diagnose illness, threaten the user, or claim that Zi Bai alone determines an outcome.

When notification privacy preview is disabled, lock-screen copy is generic and contains no directions, star readings, saved-house data, or activity context.

Approved Thai copy shape for a shichen occurrence:

> **จื่อไป๋ยาม巳 09:07–11:06 เวลาสุริยะจริง**
>
> 九紫 เก้าม่วงอยู่ตะวันออก — ไฟ生ธาตุดินของวัง จังหวะนี้ช่วยเรื่องการแสดงออกและการทำสิ่งให้เห็นผล เหมาะกับพื้นที่สว่างและกิจกรรมสร้างสรรค์
>
> 五黃 ห้าเหลืองอยู่ตะวันตกเฉียงใต้ — ธาตุดินซ้อนวังดิน พลังนิ่งและหนัก ควรลดเสียง การสั่นสะเทือน การเจาะหรือตอกในทิศนี้
>
> 一白 หนึ่งขาวอยู่เหนือ · 二黑 สองดำอยู่ตะวันตก — แตะเพื่อดูคำอ่านครบและผัง 9 วัง

Approved Thai copy shape for a daily occurrence:

> **จื่อไป๋ประจำวัน · เริ่มวันใหม่ 23:12 เวลาสุริยะจริง**
>
> ดาวโฟกัสวันนี้: 一白 เหนือ · 二黑 ตะวันตก · 五黃 ตะวันตกเฉียงใต้ · 九紫 ตะวันออก
>
> เปิดดูความสัมพันธ์ธาตุ คำแนะนำการใช้พื้นที่ และช่วงยามที่ดาววัน–ดาวยามซ้อนกัน

### 2.4 Notification actions

Shichen notifications expose:

- `View chart`
- `Turn off shichen alerts`

Turning off shichen alerts is an authenticated, installation-bound, durable mutation. It permanently disables only the Zi Bai shichen setting on that installation until the user enables it again. It does not mute the daily summary or any other notification kind.

## 3. Science contract

### 3.1 Canonical engine

The only allowed chart engine is `computeFlyingLayers` from `src/lib/fengshui-luxing.ts` or a behaviorally identical extracted module covered by the same fixtures.

The legacy simplified `day_branch % 9` calculation is forbidden for this feature. A missing or failed canonical engine causes the occurrence to be skipped. There is no fallback to a simplified formula, civil-clock shichen, cached stale chart, or Period-9 house valuation.

### 3.2 True apparent solar time

Shichen boundaries use true apparent solar time (`真太陽時`), not device wall-clock time.

The calculation starts from the UTC instant and uses:

- current longitude;
- the equation of time for that instant;
- the installation timezone and historical DST rule for display, quiet-hours evaluation, and civil scheduling; and
- a deterministic astronomical implementation whose reference fixtures agree with an authoritative solar-time source to within 60 seconds.

Timezone offset must not be applied twice. Longitude and equation-of-time adjustment define apparent solar time; timezone defines the user's civil display and local policy windows.

### 3.3 Day boundary and school

- The Zi Bai day changes at `23:00` true apparent solar time, at the beginning of the Zi shichen.
- The entire Zi shichen uses the new day pillar; the chart does not switch again at apparent-solar midnight.
- Daily flying uses the `造命` school:
  - Winter Solstice to Summer Solstice: Yang, forward flight (`順飛`).
  - Summer Solstice to Winter Solstice: Yin, reverse flight (`逆飛`).
- Month boundaries follow solar terms (`節氣`).
- Hour flight derives from the new day branch and the Winter/Summer half-year rule already encoded by the canonical engine.

### 3.4 Interpretation

The notification interpretation is derived from:

- intrinsic element of the moving star;
- element of the Lo Shu palace occupied by the star;
- generating, controlling, draining, and same-element relationships (`生`, `剋`, `洩`, `比和`); and
- overlap between the day star and shichen star in each focus direction.

Period-9 prosperity, a person's natal chart, house sitting/facing, and Qi Men scores are excluded from notification verdicts.

### 3.5 House overlay

The saved-house overlay projects the already-computed time chart onto compass-aligned sectors of the saved plan. It does not alter star numbers, flight direction, shichen boundaries, interpretations, rankings, or notification copy. The same chart snapshot must be used by the general chart and house overlay.

## 4. Location and installation contract

### 4.1 Permission

- Daily summary may be enabled after the app has obtained a current foreground location.
- Shichen alerts require background-location permission.
- If background permission is later removed, shichen delivery stops immediately and the settings screen shows the truthful reason.
- The application must not silently downgrade to civil time or an account profile location.

### 4.2 Freshness and retention

Maintain at most one current-location record per installation:

- full latitude and longitude;
- timezone identifier;
- captured-at instant;
- installation owner; and
- expiry instant.

The record may be retained and used for at most seven days. A stale record causes that occurrence to be skipped. A later location refresh resumes from the next eligible occurrence; missed occurrences are never replayed. Users should refresh after long-distance or international travel.

The location row is overwritten rather than appended. The feature must not create a location-history trail.

### 4.3 Isolation

Preferences, location, due time, deduplication, and delivery are scoped to `account + installation`.

Two devices on the same account may use different coordinates, timezones, quiet hours, daily-summary times, and Zi Bai settings. One device must never overwrite, disable, or receive the other device's occurrence.

Sign-out, device removal, account deletion, and push-token ownership transfer must revoke the installation's Zi Bai eligibility and remove its retained location under the existing account-isolation rules.

## 5. Data model

Add installation-scoped Zi Bai state with, at minimum:

- daily enabled;
- shichen enabled;
- daily summary civil time;
- next daily due instant;
- next shichen due instant;
- current location and expiry;
- canonical timezone;
- location-permission state last reported by the app;
- calculation version; and
- updated-at and owner-generation fields.

Coordinates must not be copied into:

- `mobile_push_log.payload`;
- provider message data;
- Notification Center responses;
- engagement rows;
- source facts;
- application logs;
- scheduler logs; or
- health output.

Durable Zi Bai notification payloads contain only non-location chart facts required for rendering and routing: notification UUID, account UUID, strict kind/event, chart version, apparent-solar date, shichen key, bounded start/end instants, complete day/shichen nine-palace star maps, focus-star directions, and an exact app route. Persisting the complete non-location chart snapshot ensures that Notification Center history opens the original chart after the location row expires; the server must not recompute old history from a later location.

## 6. Strict payload contract

Extend the notification-kind union from eight to nine kinds by adding `zibai`.

Allowed events:

- `zibai_daily`
- `zibai_shichen`

The strict payload must include:

- schema version;
- `kind: "zibai"`;
- event;
- account ID;
- authoritative notification UUID;
- opaque reference ID;
- calculation version;
- apparent-solar date;
- shichen key when applicable;
- UTC start/end instants;
- an exact 1–9 day-palace map;
- an exact 1–9 shichen-palace map for `zibai_shichen`;
- four focus-star direction records; and
- one literal, allowlisted Zi Bai route.

Unknown fields, non-enumerable/accessor fields, malformed dates, invalid star permutations, duplicate directions, invalid UUIDs, or nonliteral routes are rejected before navigation or engagement reporting.

Provider title/body are derived from the same immutable snapshot. FCM and Expo must receive equivalent strict inner data. Coordinates, timezone offset internals, house identity, and floor-plan data are forbidden in the provider envelope.

## 7. Scheduler and delivery flow

1. The mobile app refreshes installation location under explicit permission.
2. The backend validates ownership and atomically replaces the current-location row.
3. The solar-time component computes the next apparent-solar boundary as a UTC instant.
4. An indexed `next_due_at` queue exposes only due installations; the scheduler must not full-scan all users every minute.
5. Workers claim rows using transactional locking or an equivalent lease/fencing mechanism.
6. After claiming, the worker rereads owner, enablement, permission, token, location age, quiet hours, cap, and account status.
7. The canonical engine computes the chart and verifies a complete 1–9 permutation for each layer.
8. The interpretation and localized-copy components produce the immutable snapshot.
9. The existing durable notification system reserves parent and installation attempt rows before provider I/O.
10. Whether delivered or skipped, the scheduler advances to the next correct due instant without replaying the missed occurrence.

Deduplication key:

`installation + apparent-solar date + occurrence type + shichen key + calculation version`

Retries reuse the original notification and attempt. They do not consume another cap slot.

## 8. User interface

The notification settings screen shows:

- both Zi Bai toggles;
- daily-summary time;
- background-location permission state;
- last location age without displaying coordinates;
- current true apparent solar time;
- next shichen boundary in both apparent-solar and device civil time; and
- the latest skip reason using fixed, localized error codes.

The Zi Bai detail screen shows:

- complete nine-palace day and shichen charts;
- focus stars 1, 2, 5, and 9;
- star-palace elemental relationships;
- day-hour overlaps;
- bounded recommendations and source/school label; and
- a clear statement that the chart is a time-direction layer, not a Period-9 house chart or deterministic prediction.

The Luopan overlay consumes the same snapshot and may map compass sectors to the saved plan. It must not issue a second notification.

## 9. Failure and truthfulness rules

The system fails closed and skips an occurrence for:

- stale or absent location;
- missing permission;
- invalid timezone;
- solar-time calculation failure;
- canonical engine failure;
- invalid star permutation;
- quiet hours;
- disabled preference;
- duplicate or exhausted Zi Bai cap;
- ownership/token/account invalidation; or
- provider/durable-delivery failure.

Engine, location, or provider failures must not mutate another notification kind. UI status must distinguish disabled, permission denied, stale location, quiet-hours skip, engine unavailable, provider retrying, and provider terminal failure. No exception text, token, coordinate, account identifier, or chart question is logged.

## 10. Observability and retention

Add aggregate, PII-free Zi Bai metrics:

- due, claimed, reserved, accepted, delivered/provider-accepted, retrying, dead;
- skipped by fixed reason;
- location freshness buckets;
- solar-boundary scheduling lag;
- duplicate prevention;
- daily and shichen counts; and
- app-received/opened/action rates.

Health becomes unhealthy for a stale scheduler heartbeat, excessive due lag, growing retry backlog, impossible attempt state, credential mismatch, or sustained engine failures. Location data is never emitted in metrics.

Location retention runs independently from notification-history retention and proves deletion after seven days. Notification attempts and engagement evidence follow the existing reviewed retention windows.

## 11. Testing and acceptance

### 11.1 Science fixtures

- authoritative true-solar-time fixtures across east/west longitudes;
- DST gap and fold, including zones whose transition occurs at midnight;
- International Date Line cases;
- equation-of-time extrema;
- exact 23:00 apparent-solar day transition;
- Winter/Summer Solstice and all relevant solar-term boundaries;
- `造命` forward/reverse flight;
- every chart layer is an exact 1–9 permutation;
- day-shichen overlap interpretation; and
- a mutation gate proving the simplified legacy formula cannot satisfy the fixtures.

### 11.2 Backend behavior

- installation/account ownership and transfer races;
- location freshness and deletion at the seven-day boundary;
- no coordinate propagation to durable/provider/history/engagement/log output;
- quiet-hour skips without replay;
- one-per-shichen and twelve-per-solar-day cap;
- Zi Bai cap independence from all other kinds;
- multi-worker claims produce one durable notification;
- retries reuse the original cap slot;
- malformed canonical output fails closed;
- all skip reasons advance `next_due_at` correctly; and
- 10,000-installation staging load and soak tests with p95/p99 lag, database pool, queue depth, CPU, and error-rate evidence.

### 11.3 Mobile behavior

- foreground location and background-location permission flows;
- permission withdrawal;
- app backgrounded, killed, resumed, and device rebooted;
- travel across longitude/timezone/DST boundaries;
- multi-device account isolation;
- strict payload parsing and cold/warm navigation;
- privacy-preview redaction;
- `View chart` and installation-bound `Turn off shichen alerts` actions;
- Notification Center history and engagement reporting; and
- Android and iOS physical-device validation.

### 11.4 Release gates

- feature flags default off;
- internal canary first;
- no production sends during replay/science/load tests;
- three independent signed reviewer approvals on the exact clean source commits;
- fresh mobile and backend full suites;
- artifact/source provenance and signature verification; and
- rollback drill for mobile flag, schedulers, schema, and release symlink.

## 12. Rollout

1. Ship schema and read-only science endpoint behind a disabled flag.
2. Replay sanitized fixtures and compare charts against authoritative examples.
3. Enable internal canary installations with no automatic migration of preferences.
4. Validate background location, true-solar boundaries, quiet hours, provider delivery, actions, and retention on physical Android/iOS devices.
5. Run the 10,000-installation staging load/soak gate.
6. Obtain three signed reviews on exact source heads.
7. Build and deploy with both user-facing toggles still off.
8. Expose opt-in settings gradually while monitoring lag, skip reasons, failures, engagement, and location retention.

## 13. Non-goals

- changing Qi Men rankings;
- using Period-9 prosperity to judge Zi Bai time charts;
- personal natal-chart prediction;
- house sitting/facing as an input to star flight;
- sending one notification per saved house;
- recording location history;
- falling back to stale coordinates or simplified formulas; and
- enabling existing users without explicit consent.
