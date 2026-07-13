const GOAL_IDS = ["wealth", "career", "love", "health", "family", "travel"] as const;

export function currentBangkokDate(now = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

export function projectCalendarGoals(rawGoals: Record<string, unknown>) {
  const goals = Object.fromEntries(
    GOAL_IDS
      .filter((id) => typeof rawGoals[id] === "number" && Number.isFinite(rawGoals[id]))
      .map((id) => [id, rawGoals[id] as number])
  );
  const lockedGoals = GOAL_IDS.filter((id) => !(id in goals));
  return { goals, lockedGoals, complete: lockedGoals.length === 0 };
}
