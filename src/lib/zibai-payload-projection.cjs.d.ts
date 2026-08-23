import type {
  ZibaiDirection,
  ZibaiNotificationFactsV2,
  ZibaiPalaces,
  ZibaiShichenKey,
} from "./notification-payload.cjs";

export type ZibaiNotificationPayloadV1 = Readonly<{
  v: 1;
  kind: "zibai";
  accountId: string;
  event: "zibai_daily" | "zibai_shichen";
  referenceId: string;
  calculationVersion: "zibai-zaoming-true-solar-v2" | "zibai-zaoming-true-solar-v3";
  apparentSolarDate: string;
  shichenKey: ZibaiShichenKey | null;
  startAt: string;
  endAt: string;
  dayPalaces: ZibaiPalaces;
  shichenPalaces: ZibaiPalaces | null;
  focus: readonly Readonly<{
    star: 1 | 2 | 5 | 9;
    dayDirection: ZibaiDirection;
    dayRelation: string;
    shichenDirection: ZibaiDirection | null;
    shichenRelation: string | null;
    overlaps: boolean;
  }>[];
  url: "/zibai";
}>;
export type ZibaiNotificationPayloadV2 = Readonly<{
  v: 1;
  kind: "zibai";
  accountId: string;
}> & ZibaiNotificationFactsV2;
export type ZibaiNotificationPayload = ZibaiNotificationPayloadV1 | ZibaiNotificationPayloadV2;

export function parseRequestedZibaiSchema(value: string | null): 1 | 2;
export function projectZibaiPayload(
  payload: unknown,
  requestedSchema: 1 | 2,
): ZibaiNotificationPayload;

declare const api: Readonly<{
  parseRequestedZibaiSchema: typeof parseRequestedZibaiSchema;
  projectZibaiPayload: typeof projectZibaiPayload;
}>;
export default api;
