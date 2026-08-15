export type NotificationKind = "security" | "saved_date" | "daily" | "yam" | "qimen" | "shrine" | "goal" | "service";
export function buildNotificationPayload(kind: NotificationKind, accountId: string, facts: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function normalizedLocale(locale: unknown): "th" | "en" | "zh";
export function previewCopy(kind: NotificationKind, privacyPreview: boolean, fullCopy: { title: string; body: string }, locale: unknown): Readonly<{ title: string; body: string }>;
declare const api: { buildNotificationPayload: typeof buildNotificationPayload; normalizedLocale: typeof normalizedLocale; previewCopy: typeof previewCopy };
export default api;
