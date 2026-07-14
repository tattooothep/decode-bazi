# Mobile r515 sanitized fixtures

This directory contains deterministic synthetic response contracts for the mobile r515 surfaces.

- They are generated from code and never captured from production.
- Personal identity, contact, account, credential, private conversation, image, and exact-location values are absent.
- Scientific labels, entitlement states, response status, and display-safe synthetic values are retained for contract testing.
- Run `node scripts/test-mobile-r515-fixtures.mjs` from the repository root before adoption.
- Jarvis must update the mobile fixture allowlist separately; this backend handoff does not modify the mobile worktree.
