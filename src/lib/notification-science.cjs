const SCHEDULER_NAMES = Object.freeze([
  "yam",
  "daily-fortune",
  "auspicious",
  "personal-reminders",
  "monthly-report",
  "network-morning",
]);

function safeTimezone(value) {
  const timezone = String(value || "").trim() || "Asia/Bangkok";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return "Asia/Bangkok";
  }
}

function zonedClock(timezone, instant = new Date()) {
  const timeZone = safeTimezone(timezone);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function buildQimenSchedulerRequest(input) {
  const timezone = safeTimezone(input?.timezone);
  const instant = input?.instant instanceof Date ? input.instant : new Date(input?.instant || Date.now());
  if (!Number.isFinite(instant.valueOf())) throw new TypeError("invalid qimen instant");
  const clock = zonedClock(timezone, instant);
  return {
    ...clock,
    timezone,
    instant: instant.toISOString(),
    lat: Number(input.latitude),
    lng: Number(input.longitude),
    school: "chaibu",
    system_type: "hour",
  };
}

function qimenGateClock(timezone, instant) {
  return zonedClock(timezone, instant);
}

async function yamQimenHighlight(input) {
  if (input?.qimenEnabled !== true) return null;
  const location = input.location;
  if (!location || location.fresh !== true) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return input.fetchHighlight(latitude, longitude);
}

function buildGoalScienceRequests(goals, timezone, instant = new Date()) {
  const timeZone = safeTimezone(timezone);
  const date = zonedClock(timeZone, instant).date;
  return (Array.isArray(goals) ? goals : []).flatMap((goal) => {
    const profileId = typeof goal?.profileId === "string" ? goal.profileId.trim() : "";
    if (!goal?.id || !profileId || !goal?.activityKey) return [];
    return [{
      goalId: goal.id,
      profileId,
      activityKey: goal.activityKey,
      date,
      timezone: timeZone,
      instant: instant.toISOString(),
    }];
  });
}

function dueLead(start, now) {
  const remaining = start.valueOf() - now.valueOf();
  if (remaining >= 45 * 60_000 && remaining <= 75 * 60_000) return "1h";
  if (remaining >= 23.75 * 3_600_000 && remaining <= 24.25 * 3_600_000) return "24h";
  return null;
}

function selectDueSavedDate(rows, now = new Date()) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const start = new Date(row?.start ?? row?.payload?.datetime?.start);
      const lead = Number.isFinite(start.valueOf()) ? dueLead(start, now) : null;
      return lead ? { ...row, start: start.toISOString(), lead, remaining: start.valueOf() - now.valueOf() } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.remaining - right.remaining)[0] || null;
}

async function withTotalTimeout(run, timeoutMs = 12_000) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error("notification_internal_timeout"));
      reject(new Error("notification_internal_timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => run(controller.signal)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function withFencedTotalTimeout(run, timeoutMs = 12_000) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("notification_internal_timeout"));
  }, timeoutMs);
  try {
    const result = await Promise.resolve().then(() => run(controller.signal));
    if (timedOut) throw new Error("notification_internal_timeout");
    return result;
  } catch (error) {
    if (timedOut) throw new Error("notification_internal_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function schedulerLeaseKey(name) {
  if (!SCHEDULER_NAMES.includes(name)) throw new TypeError(`unknown notification scheduler: ${name}`);
  return `mobile-notification-scheduler:${name}:v1`;
}

module.exports = {
  SCHEDULER_NAMES,
  buildGoalScienceRequests,
  buildQimenSchedulerRequest,
  dueLead,
  qimenGateClock,
  safeTimezone,
  schedulerLeaseKey,
  selectDueSavedDate,
  withFencedTotalTimeout,
  withTotalTimeout,
  yamQimenHighlight,
  zonedClock,
};
