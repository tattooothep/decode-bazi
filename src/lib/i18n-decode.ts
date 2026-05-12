import decodeProduction from "../../data/i18n/decode.production.json";
import decodeStaging from "../../data/i18n/decode.staging.json";
import qimenProduction from "../../data/i18n/qimen.production.json";
import qimenStaging from "../../data/i18n/qimen.staging.json";

export type Lang = "th" | "en" | "zh";
export type Field = "main" | "short" | "long" | "advice" | "warning";
export type Namespace = "decode" | "qimen";
export type ExportProfile = "production" | "staging";

type LocalizedText = Partial<Record<Field, string | null>>;

export type I18nEntry = {
  module_id: string | null;
  severity: string | null;
  tone: string | null;
  th?: LocalizedText;
  en?: LocalizedText;
  zh?: LocalizedText;
};

type Bundle = {
  _meta: {
    version: string;
    generated_at: string;
    source_sheet_id: string;
    checksum: string;
    export_profile: ExportProfile;
    review_mode: boolean;
    entries_count: number;
    warning?: string;
  };
  entries: Record<string, I18nEntry>;
};

const BUNDLES: Record<Namespace, Record<ExportProfile, Bundle>> = {
  decode: {
    production: decodeProduction as Bundle,
    staging: decodeStaging as Bundle,
  },
  qimen: {
    production: qimenProduction as Bundle,
    staging: qimenStaging as Bundle,
  },
};

function activeProfile(): ExportProfile {
  return process.env.I18N_EXPORT_PROFILE === "staging" ? "staging" : "production";
}

function missingMarker(namespace: Namespace, code: string, lang: Lang, field: Field): string {
  return `[missing:i18n:${namespace}:${code}:${lang}:${field}]`;
}

export function t(
  code: string,
  lang: Lang = "th",
  field: Field = "main",
  namespace: Namespace = "decode"
): string {
  const entry = BUNDLES[namespace][activeProfile()].entries[code];
  const value = entry?.[lang]?.[field];
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return missingMarker(namespace, code, lang, field);
}

export function getEntry(
  code: string,
  namespace: Namespace = "decode",
  profile: ExportProfile = activeProfile()
): I18nEntry | null {
  return BUNDLES[namespace][profile].entries[code] ?? null;
}

export function listCodes(
  namespace: Namespace = "decode",
  profile: ExportProfile = activeProfile()
): string[] {
  return Object.keys(BUNDLES[namespace][profile].entries);
}

export function isProductionReady(code: string, namespace: Namespace = "decode"): boolean {
  return !!BUNDLES[namespace].production.entries[code];
}

export function getBundleMeta(
  namespace: Namespace = "decode",
  profile: ExportProfile = activeProfile()
) {
  return BUNDLES[namespace][profile]._meta;
}
