import {
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
  QIZHENG_ELECTIONAL_SOURCE_DIGEST,
} from "./qizheng/electional-source-manifest";

export const R8_SOURCE_DIGEST = QIZHENG_ELECTIONAL_SOURCE_DIGEST;
export const R8_ASTRONOMY_SCHEMA = 1 as const;
export const R8_QIZHENG_SCHEMA = 0 as const;

export type R8ScienceId = "astronomy_fact" | "qizheng";

export function assertR8LaneKey(
  science: R8ScienceId,
  submode: string,
  schema: number,
): string {
  if (!/^[a-z][a-z0-9_]{0,31}$/u.test(submode)) {
    throw new TypeError("r8_submode_invalid");
  }
  if (!Number.isInteger(schema) || schema < 0 || schema > 32) {
    throw new TypeError("r8_schema_invalid");
  }
  return `${science}:${submode}:v${schema}`;
}

export function r8ProductionCapability(): Readonly<{
  astronomyFact: "pull_only";
  qizheng: "blocked_source_incomplete" | "review_required";
  providerSend: false;
}> {
  const evidenceComplete = QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.every(
    (artifact) => String(artifact.transcriptionStatus) === "double_verified",
  );
  return Object.freeze({
    astronomyFact: "pull_only",
    qizheng: evidenceComplete ? "review_required" : "blocked_source_incomplete",
    providerSend: false,
  });
}
