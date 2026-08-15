import runtime from "./notification-payload.cjs";

export type NotificationFacts = {
  security: { event: string; url: "/account" };
  saved_date: { savedDateId: string; lead: number; date: string; url: "/datepick/saved" };
  daily: { slot: "morning" | "evening"; date: string; url: "/today" };
  yam: { range: string; quality: "best" | "good"; date: string; url: "/today" };
  qimen: { date: string; direction: string; score: number; url: "/qimen/board" };
  shrine: { date: string; festival: string; url: "/shrine" };
  goal: { goalId: string; date: string; url: "/calendar/goals" };
  service: { event: string; referenceId: string; url: "/account" | "/support" | "/store" | "/calendar" | "/network" };
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
