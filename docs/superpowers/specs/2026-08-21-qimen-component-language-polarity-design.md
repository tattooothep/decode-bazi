# Qimen notification language and component-polarity design

Date: 2026-08-21

Status: approved in conversation on 2026-08-21

## Goal

Make the C4 Qimen notification understandable to a general user without weakening its expert evidence:

- follow the notification owner's locale;
- show every deity, door, and star in the owner's language with the canonical Han name retained;
- distinguish the intrinsic nature of every component as supportive, contextual, or unsupportive;
- preserve the hour chart as the sole action authority and never average the three layers.

This is a release gate. The existing goal must not pass until the language and polarity behavior is implemented, tested, deployed, and re-signed by three reviewers.

## Approaches considered

### A. Canonical intrinsic quality plus separate context (selected)

Resolve each component by canonical code. Display its localized name, Han name, and intrinsic `base_quality`. Collapse the canonical five-level quality into three presentation states. Keep hour vigor, warnings, formations, and the final direction decision as separate evidence.

This is selected because it is truthful for all month/day/hour layers and does not invent unavailable month/day vigor.

### B. Context-effective color only

Color each component after vigor, palace element, formations, warnings, and travel-purpose rules. This is richer, but month/day currently declare `CONTEXT_VIGOR_NOT_DEFINED` and `CONTEXT_CLASH_NOT_EVALUATED`. Implementing it now would fabricate evidence or require a new independently verified science engine.

### C. Binary green/red by name

Map names directly to good or bad. This is compact but misrepresents contextual components and suggests that one red component cancels a direction that the authoritative hour chart admitted.

## Canonical semantics

The source of truth is the canonical Qimen dictionary `base_quality`, keyed by component code. Presentation mapping:

| Canonical quality | Presentation state | Thai label | Visual |
| --- | --- | --- | --- |
| `great_auspicious`, `auspicious` | `supportive` | ส่งเสริม | green + `✓` |
| `contextual`, `neutral`, `normal` | `contextual` | เป็นกลาง/ขึ้นกับบริบท | gray + `•` |
| `inauspicious`, `severe` | `unsupportive` | ไม่ส่งเสริม/ควรระวัง | red + `!` |
| missing or unknown | `unavailable` | ยังไม่มีข้อมูล | muted + `?` |

Unknown codes fail closed to `unavailable`; they must never become green or silently become neutral.

The label beside component colors must say “คุณภาพพื้นฐาน” (or the equivalent in the owner's locale). These component states explain the ingredients; they do not decide the direction.

The hour layer remains the sole action authority. Month and day remain raw context. `旺/相/休/囚/死` is a separate strength dimension and must never be converted directly into good/bad: a strong adverse star is a stronger caution, not a positive result.

## Data contract

The server resolves localized labels and canonical qualities by code. The attested snapshot and compact provider payload carry, for every deity, door, and star:

- canonical code;
- canonical Han name;
- canonical five-level intrinsic quality or explicit unavailable state.

The mobile client may collapse the attested quality to the three presentation states, but must not infer quality from a name, color, or vigor. The new fields participate in strict validation and the snapshot digest. A schema/version change is required if adding fields would otherwise break strict v2 payload parsing.

Full-palace data and selected-direction compact data must agree. Center-palace missing door/deity uses `unavailable`, not neutral.

## Localized copy

Thai example:

`เทพ · เก้าพื้นดิน (九地)   ✓ ส่งเสริม`

English example:

`Deity · Jiu Di (Nine Earth) (九地)   ✓ Supportive`

Chinese locales use the canonical Han name without duplicating it in parentheses. All supported locales use their own state labels, with a truthful fallback when a translated long name is unavailable.

The lock-screen notification uses glyphs plus words because Android/iOS notification text cannot reliably color individual substrings. The in-app detail uses semantic green/gray/red/muted chips. Neither surface relies on color alone.

The Thai lock-screen body remains within the delivery limit and ends with a compact legend plus a statement that the hour chart governs action.

## Mobile presentation

Apply the status to all three locations:

1. the month/day/hour summary cards: full localized row and status chip for each deity, door, and star;
2. the nine-palace compact grid: glyph preceding each component, without calculating a palace-average color;
3. the selected-palace and evidence detail: full localized name, intrinsic-quality chip, and separate vigor/warning/formation evidence.

The legend is always visible before the nine-palace grid:

`✓ ส่งเสริม   • เป็นกลาง   ! ไม่ส่งเสริม   ? ยังไม่มีข้อมูล`

Accessibility labels read the component type, localized name, Han name, and state. Contrast and meaning must remain usable without color perception.

## Delivery and history

Notification provider copy, persisted history copy, and the opened detail must use the same owner locale and the same attested component status. Changing device language later must not alter the scientific data stored in the snapshot; the UI may re-localize labels by canonical code.

## Failure behavior

- Unknown component code: show unavailable, do not send a misleading positive label.
- Missing translation: use a documented locale fallback plus the Han name; do not fall back silently to raw Chinese for every locale.
- Invalid or mismatched quality in snapshot/payload: reject the payload/detail rather than display it.
- Oversized notification copy: fail the test/build; do not truncate away state or hour-authority meaning.

## Verification gates

- Test-first red evidence for the current raw-Chinese locale bug and missing component statuses.
- Dictionary coverage tests for every accepted deity, door, and star code.
- TH/EN/ZH copy tests; supported-locale fallback tests; Chinese no-duplication test.
- Strict snapshot/digest/provider-payload round-trip tests including qualities.
- Full-palace and compact selected-evidence parity tests.
- UI render and accessibility tests for 3 layers × 3 components, nine-palace glyphs, four-state legend, and `unavailable != contextual`.
- Notification body-length/provider-byte limits.
- Existing Qimen science, scheduler, Android notification, tap-route, and full mobile suites remain green.
- A localized full-format test push must be provider accepted and verified on the installed device.
- Three independent reviewers must sign the exact final backend/mobile/engine source tuple before the goal may pass.

