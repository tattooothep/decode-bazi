export const NETWORK_GROUP_KEYS = ["general", "family", "friend", "work", "love", "rival", "self"] as const;

export type NetworkGroupKey = (typeof NETWORK_GROUP_KEYS)[number];

const GROUP_SET = new Set<string>(NETWORK_GROUP_KEYS);

export function normalizeNetworkGroup(value: unknown, fallback: NetworkGroupKey = "general"): NetworkGroupKey {
  const raw = String(value ?? "").trim().toLowerCase();
  return GROUP_SET.has(raw) ? (raw as NetworkGroupKey) : fallback;
}

export function relationshipFallbackForGroup(group: unknown): string {
  switch (normalizeNetworkGroup(group, "general")) {
    case "family":
      return "คนในครอบครัว";
    case "friend":
      return "เพื่อนในเครือข่าย";
    case "work":
      return "คนในงาน";
    case "love":
      return "คนรัก";
    case "rival":
      return "คู่แข่ง";
    default:
      return "คนในเครือข่าย";
  }
}

export function normalizeNonSelfRelationship(value: unknown, group: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw.toLowerCase() === "self" || raw === "ตัวเอง") {
    return relationshipFallbackForGroup(group);
  }
  return raw;
}
