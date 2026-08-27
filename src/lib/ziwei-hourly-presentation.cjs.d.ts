export declare const PRESENTATION_VERSION: "ziwei-hourly-type-c-v1";
export declare const PRESENTATION_CATALOG_SHA256: "40433d2b61e197c8f60bb712cfeba08d19c0cb5622f40d666eb2cd03ffdc0918";
export declare const SUPPORTED_LOCALES: readonly string[];
export declare function buildZiweiHourlyPresentation(locale: string, snapshot: unknown): Readonly<Record<string, unknown>>;
export declare function buildZiweiHourlyTypeCCopy(locale: string, snapshot: unknown): Readonly<{ title: string; body: string }>;
export declare function resolveFlowStarPresentation(locale: string, star: unknown, palace?: unknown, branch?: unknown): Readonly<Record<string, unknown>>;
export declare function resolvePalacePresentation(locale: string, palace: unknown): Readonly<Record<string, unknown>>;
export declare function resolveSihuaPresentation(locale: string, entry: unknown): Readonly<Record<string, unknown>>;
