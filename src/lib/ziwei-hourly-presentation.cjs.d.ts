export declare const PRESENTATION_VERSION: "ziwei-hourly-type-c-v1";
export declare const PRESENTATION_CATALOG_SHA256: "efea1c6c05c24867ce1df8e5ce5c639266a9544118ee8dc091f69c94adbdbd88";
export declare const MAX_LOCKSCREEN_COPY_UTF8_BYTES: 360;
export declare const SUPPORTED_LOCALES: readonly string[];
export declare function buildZiweiHourlyPresentation(locale: string, snapshot: unknown): Readonly<Record<string, unknown>>;
export declare function buildZiweiHourlyTypeCCopy(locale: string, snapshot: unknown): Readonly<{ title: string; body: string }>;
export declare function resolveFlowStarPresentation(locale: string, star: unknown, palace?: unknown, branch?: unknown): Readonly<Record<string, unknown>>;
export declare function resolvePalacePresentation(locale: string, palace: unknown): Readonly<Record<string, unknown>>;
export declare function resolveSihuaPresentation(locale: string, entry: unknown): Readonly<Record<string, unknown>>;
