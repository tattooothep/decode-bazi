const MAX_PEOPLE = 10;

export function cleanDatepickDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function cleanProfileId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export function parseDatepickPeople(body: Record<string, unknown>): { ids: string[]; error?: string } {
  const rawPeople = body.peopleIds;
  if (rawPeople !== undefined && !Array.isArray(rawPeople)) {
    return { ids: [], error: "peopleIds ต้องเป็น array" };
  }

  const rawIds = Array.isArray(rawPeople) ? rawPeople : [];
  if (rawIds.length > MAX_PEOPLE) {
    return { ids: [], error: `peopleIds รองรับไม่เกิน ${MAX_PEOPLE} คน` };
  }

  const ids: string[] = [];
  for (const value of rawIds) {
    const id = cleanProfileId(value);
    if (!id) return { ids: [], error: "peopleIds มี profile id ไม่ถูกต้อง" };
    ids.push(id);
  }

  if (body.profileId !== undefined && body.profileId !== null && String(body.profileId).trim()) {
    const legacyId = cleanProfileId(body.profileId);
    if (!legacyId) return { ids: [], error: "profileId ไม่ถูกต้อง" };
    ids.push(legacyId);
  }

  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length > MAX_PEOPLE) {
    return { ids: [], error: `peopleIds รองรับไม่เกิน ${MAX_PEOPLE} คน` };
  }
  return { ids: uniqueIds };
}
