import runtime from "./notification-payload.cjs";

export type NotificationFacts = {
  security: { event: string; url: "/account" };
  saved_date: { savedDateId: string; lead: number; date: string; url: "/datepick/saved" };
  daily: { slot: "morning" | "evening"; date: string; url: "/today" };
  yam: { range: string; quality: "best" | "good"; date: string; url: "/today" };
  qimen: { date: string; direction: string; score: number; url: "/qimen/board" };
  shrine: { date: string; festival: string; url: "/shrine" };
  goal: { goalId: string; date: string; url: "/calendar/goals" };
  service: { event: string; referenceId: string; url: "/account" | "/support" | "/store" | "/calendar" | "/network" | "/fusion" };
  zibai: {
    event: "zibai_daily" | "zibai_shichen";
    referenceId: string;
    calculationVersion: "zibai-zaoming-true-solar-v1";
    apparentSolarDate: string;
    shichenKey: "zi" | "chou" | "yin" | "mao" | "chen" | "si" | "wu" | "wei" | "shen" | "you" | "xu" | "hai" | null;
    startAt: string;
    endAt: string;
    dayPalaces: Record<"N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C", number>;
    shichenPalaces: Record<"N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C", number> | null;
    focus: Array<{
      star: 1 | 2 | 5 | 9;
      dayDirection: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";
      dayRelation: "generates-palace" | "controls-palace" | "drains-star" | "same-element" | "palace-controls-star";
      shichenDirection: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C" | null;
      shichenRelation: "generates-palace" | "controls-palace" | "drains-star" | "same-element" | "palace-controls-star" | null;
      overlaps: boolean;
    }>;
    url: "/zibai";
  };
};

export type NotificationKind = keyof NotificationFacts;
export type NotificationPayload<K extends NotificationKind = NotificationKind> = Readonly<
  { v: 1; kind: K; accountId: string } & NotificationFacts[K]
>;

export function buildNotificationPayload<K extends NotificationKind>(
  kind: K,
  accountId: string,
  facts: NotificationFacts[K],
): NotificationPayload<K> {
  return runtime.buildNotificationPayload(kind, accountId, facts) as NotificationPayload<K>;
}
