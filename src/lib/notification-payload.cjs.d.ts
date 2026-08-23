export type ZibaiDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";
export type ZibaiShichenKey = "zi" | "chou" | "yin" | "mao" | "chen" | "si" | "wu" | "wei" | "shen" | "you" | "xu" | "hai";
export type ZibaiPatternCode = "three_layer_same_star" | "two_layer_same_star" | "aligned" | "supportive_contested" | "mixed_caution_priority" | "heightened_caution" | "reference_only";
export type ZibaiPalaces = Readonly<Record<ZibaiDirection, number>>;
export type ZibaiCompactAttestation = Readonly<{
  direction: ZibaiDirection;
  month: number;
  day: number;
  shichen: number | null;
  patternCode: ZibaiPatternCode;
}>;
export type ZibaiNotificationFactsV2 = Readonly<{
  snapshotSchema: 2;
  event: "zibai_daily" | "zibai_shichen";
  referenceId: string;
  calculationVersion: "zibai-zaoming-true-solar-v2" | "zibai-zaoming-true-solar-v3";
  interpretationVersion: "zibai-3layer-rule-v1";
  month: Readonly<{
    startTermCode: string;
    endTermCode: string;
    palaces: ZibaiPalaces;
    startAt: string;
    endAt: string;
  }>;
  day: Readonly<{
    palaces: ZibaiPalaces;
    apparentSolarDate: string;
    startAt: string;
    endAt: string;
  }>;
  shichen: Readonly<{
    palaces: ZibaiPalaces;
    key: ZibaiShichenKey;
    startAt: string;
    endAt: string;
  }> | null;
  sectors: readonly ZibaiCompactAttestation[];
  url: "/zibai";
}>;
export type NotificationKind = "security" | "saved_date" | "daily" | "yam" | "qimen" | "shrine" | "goal" | "service" | "zibai";
export function buildNotificationPayload(kind: NotificationKind, accountId: string, facts: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function normalizedLocale(locale: unknown): "th" | "en" | "zh";
export function previewCopy(kind: NotificationKind, privacyPreview: boolean, fullCopy: { title: string; body: string }, locale: unknown): Readonly<{ title: string; body: string }>;
declare const api: { buildNotificationPayload: typeof buildNotificationPayload; normalizedLocale: typeof normalizedLocale; previewCopy: typeof previewCopy };
export default api;
