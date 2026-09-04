/**
 * Generated from the committed astronomy model dependency closure.
 *
 * The release gate recomputes this value from the exact git blobs listed in
 * ASTRONOMY_FACT_MODEL_FILES. Keep this file outside that closure to avoid a
 * self-referential digest.
 */
export const ASTRONOMY_FACT_MODEL_FILES = Object.freeze([
  "package.json",
  "package-lock.json",
  "scripts/fixtures/astronomy-fact-r8-jpl-horizons-goldens.json",
  "src/lib/astro/astronomy-fact-r8.ts",
  "src/lib/tianxing/ephemeris.ts",
] as const);

export const ASTRONOMY_FACT_MODEL_DIGEST =
  "6a4228e9f654062b3b131db3d434172243930151ed025193ae14449e7615964e" as const;
