# Mobile r515 sanitized fixtures

This directory contains deterministic synthetic response contracts for the mobile r515 surfaces.

- They are generated from code and never captured from production.
- Wire shapes are reviewed against immutable deployed release `decode-app-r515-mobile-api`; see `manifest.json.sourceProvenance`.
- Personal identity, contact, account, credential, private conversation, image, and exact-location values are absent.
- Scientific labels, entitlement states, response status, and display-safe synthetic values are retained for contract testing.
- Record UUIDs are fixed RFC-4122 synthetic values used only for saved-date DELETE and Luopan measurement round-trips; they are not profile IDs.
- Entitlement variants reflect only the deployed r515 release. The frozen entitlement-foundation overlay is intentionally excluded.
- Run `node scripts/test-mobile-r515-fixtures.mjs` from the repository root before adoption.
- Jarvis must update the mobile fixture allowlist separately; this backend handoff does not modify the mobile worktree.
