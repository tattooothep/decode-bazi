/**
 * Simple in-memory cache for public dictionary endpoints.
 * 5 min TTL.
 */
const TTL_MS = 5 * 60 * 1000;
type Entry<T> = { v: T; exp: number };
const map: Record<string, Entry<unknown>> = {};

export function cacheGet<T>(k: string): T | undefined {
  const e = map[k];
  if (!e || e.exp < Date.now()) return undefined;
  return e.v as T;
}
export function cacheSet<T>(k: string, v: T) {
  map[k] = { v, exp: Date.now() + TTL_MS };
}
export function cacheClear() {
  for (const k of Object.keys(map)) delete map[k];
}
