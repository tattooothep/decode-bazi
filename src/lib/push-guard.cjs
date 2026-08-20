/**
 * ตัวคุมกลางก่อนส่งแจ้งเตือนทุกใบ — ตัวยิงทุกตัวต้องผ่านตัวนี้
 *
 * ── ทำไมต้องมีตัวกลาง (30 ก.ค. 69) ─────────────────────────
 * ตอนนี้มีตัวยิงอัตโนมัติ 5 ตัว แต่ละตัวเขียนเงื่อนไขของตัวเอง
 * ผลคือกฎไม่ตรงกัน และไม่มีตัวไหนมีช่วงห้ามรบกวนเลยสักตัว
 * มีกฎกระจายอยู่หลายที่เมื่อไร วันหนึ่งมันจะไม่ตรงกันเสมอ
 *
 * ── กฎที่ตัวนี้บังคับ ───────────────────────────────────────
 * ① ผู้ใช้ต้องเปิดหมวดนั้นเอง — ไม่มีแถวตั้งค่า = ยังไม่ยินยอม = ไม่ส่ง
 * ② ห้ามส่งในช่วงห้ามรบกวน (ตามเวลาท้องถิ่นของผู้ใช้ ไม่ใช่เวลาไทย)
 * ③ ห้ามเกินเพดานต่อวัน
 * ④ ปิดที่ตารางไหนก็ถือว่าปิด — ฝั่งที่เข้มกว่าชนะเสมอ
 *
 * 🔴 ทำไมเลือก "พลาดทางไม่ส่ง" มากกว่า "พลาดทางส่งเกิน"
 * ส่งเกินหนึ่งครั้ง = ผู้ใช้ปิดถาวร แล้วเราเสียเขาไปตลอด
 * ไม่ส่งหนึ่งครั้ง = เขาพลาดยามดีหนึ่งยาม ซึ่งพรุ่งนี้ก็มีอีก
 */

/**
 * ค่าเริ่มต้นเมื่อผู้ใช้ยังไม่เคยตั้งค่า
 *
 * 🔴 ทั้งสามหมวดเป็น **ปิด** โดยตั้งใจ
 * ของเดิมเขียน `COALESCE(p.yam_enabled, true)` = คนที่ไม่มีแถวตั้งค่าถือว่าเปิด
 * ผู้ใช้จึงได้รับแจ้งเตือนโดยไม่เคยกดยินยอมสักครั้ง
 * (ฝั่งเว็บทำถูกอยู่แล้ว ค่าเริ่มต้นเป็นปิด — ฝั่งมือถือกลับกัน)
 */
const DEFAULTS = Object.freeze({
  security_enabled: true,
  saved_date_enabled: false,
  yam_enabled: false,
  auspicious_enabled: false,
  daily_enabled: false,
  qimen_enabled: false,
  shrine_enabled: false,
  goal_enabled: false,
  service_enabled: true,
  quiet_start: 22,
  quiet_end: 7,
  max_per_day: 2,
  paused_until: null,
});

/** เขตเวลาที่ใช้เมื่อไม่รู้ของผู้ใช้จริงๆ */
const FALLBACK_TZ = "Asia/Bangkok";

/**
 * ชั่วโมงปัจจุบันตามเวลาท้องถิ่นของผู้ใช้
 *
 * 🔴 ห้ามบวก 7 ชั่วโมงตายตัว (กับดักที่ระบบนี้เคยพลาดมาแล้ว)
 * `users.timezone` เป็น Asia/Bangkok ทั้ง 16 แถว และตัวยิงบวก 7 ชม.ตรงๆ
 * คนอยู่ลอนดอนจะได้ "สรุปเช้า" ตอนตีหนึ่ง
 */
function localHour(timezone, at = new Date()) {
  const tz = String(timezone || "").trim() || FALLBACK_TZ;
  try {
    const text = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(at);
    const hour = Number.parseInt(text, 10);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    // เขตเวลาที่ระบบไม่รู้จัก — ถอยไปใช้ค่ากลาง ดีกว่าโยนข้อผิดพลาดแล้วทั้งรอบล้ม
    return localHour(FALLBACK_TZ, at);
  }
}

/**
 * อยู่ในช่วงห้ามรบกวนไหม
 *
 * รองรับช่วงที่คร่อมเที่ยงคืน (22:00–07:00) ซึ่งเป็นค่าเริ่มต้น
 * เริ่ม = จบ ถือว่าไม่มีช่วงห้าม (ผู้ใช้ตั้งใจปิดตัวกันเอง)
 */
function inQuietHours(hour, quietStart, quietEnd) {
  if (!Number.isInteger(hour)) return true; // ไม่รู้เวลา = ไม่ส่ง (ฝั่งปลอดภัย)
  const start = Number.isInteger(quietStart) ? quietStart : DEFAULTS.quiet_start;
  const end = Number.isInteger(quietEnd) ? quietEnd : DEFAULTS.quiet_end;
  if (start === end) return false;
  return start < end
    ? hour >= start && hour < end        // ช่วงปกติ เช่น 01:00–06:00
    : hour >= start || hour < end;       // คร่อมเที่ยงคืน เช่น 22:00–07:00
}

/**
 * ตัดสินว่าส่งใบนี้ให้คนนี้ได้ไหม
 *
 * @param {object} input
 * @param {string} input.category   หมวด: yam | auspicious | daily
 * @param {boolean} [input.transactional] true only for requested/essential security or service notices
 * @param {object|null} input.prefs แถวจาก mobile_notification_prefs (null = ยังไม่เคยตั้ง)
 * @param {object|null} input.webPrefs แถวจาก notification_prefs ฝั่งเว็บ (ถ้ามี)
 * @param {string|null} input.timezone เขตเวลาผู้ใช้
 * @param {number} input.sentToday จำนวนที่ส่งไปแล้ววันนี้
 * @param {Date}  [input.at] เวลาที่ใช้ตัดสิน (ใส่เองได้เพื่อทดสอบ)
 * @returns {{allow: boolean, reason: string}}
 */
function mayNotify(input) {
  const { category, prefs, webPrefs, timezone, sentToday, at } = input || {};

  // Compatibility names from pre-V192 senders map to the new category model.
  const normalized = category === "auspicious" ? "shrine" : category === "network" ? "daily" : category;
  const transactional = input?.transactional === true
    && (normalized === "security" || normalized === "service");
  const key = `${normalized}_enabled`;
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
    return { allow: false, reason: `หมวดไม่รู้จัก: ${category}` };
  }

  // Login/password/payment/subscription/support notifications are essential
  // account messages. They bypass marketing consent, quiet hours, pause and cap.
  if (transactional) return { allow: true, reason: "" };

  // ① ยังไม่เคยตั้งค่า = ยังไม่ยินยอม
  if (prefs === null || prefs === undefined) {
    return { allow: false, reason: "ยังไม่เคยตั้งค่า ถือว่ายังไม่ยินยอม" };
  }
  if (prefs[key] !== true) {
    return { allow: false, reason: `ผู้ใช้ปิดหมวด ${category}` };
  }

  // ①ข พักชั่วคราวอยู่ — ต้องตัดก่อนทุกข้อ ไม่ว่าหมวดไหนก็ตาม
  //
  // 🔴 ทำไมต้องมีทางเลือกกลาง
  // เดิมมีแค่ "เปิด" กับ "ปิดถาวร" คนที่แค่รำคาญช่วงสอบ/ช่วงงานยุ่ง
  // จะกดปิดถาวรแล้วไม่เคยกลับมาเปิดอีกเลย = เสียเขาไปตลอด
  const pausedUntil = prefs.paused_until ?? null;
  if (pausedUntil !== null && pausedUntil !== undefined) {
    const until = pausedUntil instanceof Date ? pausedUntil : new Date(String(pausedUntil));
    const nowMs = (at instanceof Date ? at : new Date()).valueOf();
    if (Number.isFinite(until.valueOf()) && until.valueOf() > nowMs) {
      return { allow: false, reason: `ผู้ใช้พักการแจ้งเตือนถึง ${until.toISOString()}` };
    }
  }

  // ④ ปิดที่ตารางไหนก็ถือว่าปิด — ฝั่งเข้มกว่าชนะ
  // ฝั่งเว็บกับฝั่งแอพเก็บคนละหมวดกัน แต่ถ้าวันหน้าชื่อชนกัน ต้องไม่ส่ง
  if (webPrefs && webPrefs[key] === false) {
    return { allow: false, reason: `ผู้ใช้ปิดหมวด ${category} ที่ฝั่งเว็บ` };
  }

  // ③ เพดานต่อวัน
  const cap = Number.isInteger(prefs.max_per_day)
    ? prefs.max_per_day
    : DEFAULTS.max_per_day;
  const already = Number.isInteger(sentToday) ? sentToday : 0;
  if (cap > 0 && already >= cap) {
    return { allow: false, reason: `ถึงเพดานวันละ ${cap} ใบแล้ว` };
  }

  // ② ช่วงห้ามรบกวน — ตามเวลาท้องถิ่นของผู้ใช้
  const tz = prefs.timezone || timezone || FALLBACK_TZ;
  const hour = localHour(tz, at instanceof Date ? at : new Date());
  if (inQuietHours(hour, prefs.quiet_start, prefs.quiet_end)) {
    return {
      allow: false,
      reason: `อยู่ในช่วงห้ามรบกวน (${hour}:00 เวลา ${tz})`,
    };
  }

  return { allow: true, reason: "" };
}

/**
 * ท่อน SQL สำหรับดึงค่าตั้งค่าพร้อมเขตเวลา
 *
 * ตัวยิงทุกตัวควรใช้ท่อนนี้ ไม่เขียนเงื่อนไขเอง
 * 🔴 ไม่มีการ COALESCE เป็น true ที่นี่ — คนที่ไม่มีแถวจะได้ prefs = null
 * แล้ว mayNotify() จะตัดออกเอง
 */
const PREFS_SELECT = `
  LEFT JOIN mobile_notification_prefs np ON np.user_id = u.id
`;

const PREFS_COLUMNS = `
  np.security_enabled, np.saved_date_enabled,
  np.yam_enabled, np.auspicious_enabled, np.daily_enabled,
  np.qimen_enabled, np.shrine_enabled, np.goal_enabled, np.service_enabled,
  np.yam_min_quality, np.yam_lead_minutes, np.daily_slot,
  np.quiet_start, np.quiet_end, np.max_per_day, np.paused_until,
  COALESCE(np.timezone, u.timezone) AS user_timezone,
  (np.user_id IS NOT NULL) AS has_prefs
`;

/**
 * วันที่ตามปฏิทินท้องถิ่นของผู้ใช้ (YYYY-MM-DD)
 *
 * 🔴 ห้ามใช้วันที่ของเครื่องแม่ข่ายหรือของไทยเป็นตัวตั้ง
 * ตัวยิงเดิมเขียน `new Date(Date.now() + 7 * 3600_000)` แล้วใช้วันนั้นกับทุกคน
 * คนอยู่ฮาวายจะได้ "ดวงวันนี้" ของวันพรุ่งนี้ตามปฏิทินเขา
 * ซึ่งผิดทั้งใบ ไม่ใช่แค่ผิดเวลา
 */
function localDateStr(timezone, at = new Date()) {
  const tz = String(timezone || "").trim() || FALLBACK_TZ;
  try {
    // en-CA ให้รูปแบบ YYYY-MM-DD ตรงตัว ไม่ต้องประกอบเอง
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return localDateStr(FALLBACK_TZ, at);
  }
}

/**
 * นาทีนับจากเที่ยงคืนตามเวลาท้องถิ่นของผู้ใช้
 *
 * ใช้เทียบกับเวลาเริ่มยาม ("HH:MM-HH:MM") ซึ่งเป็นเวลาท้องถิ่นเช่นกัน
 */
function localMinutes(timezone, at = new Date()) {
  const tz = String(timezone || "").trim() || FALLBACK_TZ;
  try {
    const text = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
    const m = /^(\d{2}):(\d{2})$/.exec(text.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  } catch {
    return localMinutes(FALLBACK_TZ, at);
  }
}

module.exports = {
  DEFAULTS,
  FALLBACK_TZ,
  localHour,
  localDateStr,
  localMinutes,
  inQuietHours,
  mayNotify,
  PREFS_SELECT,
  PREFS_COLUMNS,
};
