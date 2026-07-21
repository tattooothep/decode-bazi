import { q } from "@/lib/db";

export type ContentLocale = "th" | "en" | "zh" | "cn" | "vi" | "ja" | "ru" | "ko" | "es";

export const CONTENT_LOCALES: { key: ContentLocale; label: string; name: string }[] = [
  { key: "th", label: "TH", name: "ไทย" },
  { key: "en", label: "EN", name: "English" },
  { key: "zh", label: "繁", name: "繁體" },
  { key: "cn", label: "简", name: "简体" },
  { key: "vi", label: "VI", name: "Tiếng Việt" },
  { key: "ja", label: "JA", name: "日本語" },
  { key: "ru", label: "RU", name: "Русский" },
  { key: "ko", label: "KO", name: "한국어" },
  { key: "es", label: "ES", name: "Español" },
];

const LOCALE_KEYS = new Set<ContentLocale>(CONTENT_LOCALES.map((l) => l.key));

export type LocaleTextMap = Partial<Record<ContentLocale, string>>;

export type NewsRow = {
  id: string;
  kind: string;
  title: LocaleTextMap;
  body: LocaleTextMap;
  cta_label: LocaleTextMap;
  cta_url: string | null;
  media_url: string | null;
  video_url: string | null;
  badge: string | null;
  sort: number;
  active: boolean;
  publish_at: string | Date | null;
  expires_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type PublicNewsItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string | null;
  mediaUrl: string | null;
  videoUrl: string | null;
  badge: string | null;
  publishedAt: string | null;
};

let communityTablesPromise: Promise<void> | null = null;

export async function ensureCommunityTables(): Promise<void> {
  if (communityTablesPromise) return communityTablesPromise;
  communityTablesPromise = (async () => {
    const rows = await q<{ news_items: string | null; support_reports: string | null }>(`
      SELECT to_regclass('public.news_items')::text AS news_items,
             to_regclass('public.support_reports')::text AS support_reports
    `);
    if (!rows[0]?.news_items || !rows[0]?.support_reports) {
      throw new Error("community tables are missing; run migrations/20260711_community_content.sql");
    }
  })().catch((err) => {
    communityTablesPromise = null;
    throw err;
  });
  return communityTablesPromise;
}

export function normalizeContentLocale(raw: unknown): ContentLocale {
  let x = String(raw || "").trim().toLowerCase().replace("_", "-");
  if (!x) return "th";
  if (x === "zh-cn" || x === "zh-hans" || x === "cn" || x.startsWith("zh-cn") || x.startsWith("zh-hans")) return "cn";
  if (x === "zh-hant" || x === "zh-tw" || x === "zh-hk" || x === "zh" || x.startsWith("zh-")) return "zh";
  if (x.startsWith("th")) return "th";
  if (x.startsWith("en")) return "en";
  if (x.startsWith("vi")) return "vi";
  if (x.startsWith("ja")) return "ja";
  if (x.startsWith("ru")) return "ru";
  if (x.startsWith("ko")) return "ko";
  if (x.startsWith("es")) return "es";
  return LOCALE_KEYS.has(x as ContentLocale) ? (x as ContentLocale) : "en";
}

export function cleanLocaleTextMap(input: unknown, maxLen = 1800): LocaleTextMap {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: LocaleTextMap = {};
  for (const { key } of CONTENT_LOCALES) {
    const aliases =
      key === "zh" ? ["zh", "zh-hant", "zh_tw", "zh-tw"] :
      key === "cn" ? ["cn", "zh-cn", "zh_hans", "zh-hans"] :
      [key];
    const found = aliases.map((a) => source[a]).find((v) => typeof v === "string" && v.trim());
    if (typeof found === "string") out[key] = found.trim().slice(0, maxLen);
  }
  return out;
}

export function pickLocaleText(map: unknown, locale: ContentLocale): string {
  const source = map && typeof map === "object" ? (map as Record<string, unknown>) : {};
  const fallbacks: ContentLocale[] = locale === "cn"
    ? ["cn", "zh", "en", "th", "vi", "ja", "ko", "ru", "es"]
    : locale === "zh"
      ? ["zh", "cn", "en", "th", "vi", "ja", "ko", "ru", "es"]
      : [locale, "en", "th", "zh", "cn", "vi", "ja", "ko", "ru", "es"];
  for (const key of fallbacks) {
    const v = source[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function newsRowToPublic(row: NewsRow, locale: ContentLocale): PublicNewsItem {
  const publishedAt = row.publish_at ? new Date(row.publish_at).toISOString() : null;
  return {
    id: String(row.id),
    kind: row.kind || "update",
    title: pickLocaleText(row.title, locale),
    body: pickLocaleText(row.body, locale),
    ctaLabel: pickLocaleText(row.cta_label, locale),
    ctaUrl: row.cta_url || null,
    mediaUrl: row.media_url || null,
    videoUrl: row.video_url || null,
    badge: row.badge || null,
    publishedAt,
  };
}

export function cleanText(value: unknown, maxLen: number): string | null {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, maxLen) : null;
}
