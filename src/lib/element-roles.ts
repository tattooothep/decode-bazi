/**
 * element-roles.ts · HK_ELEMENT_ROLES_V1 · 10 มิ.ย. 2026
 *
 * ELEMENT ROLE FRAMEWORK — ชั้นแปล "บทบาทธาตุในชีวิต" (display semantics layer)
 * แก้ปัญหา "เว็บพูดสองภาษาในหน้าเดียว" (用神หลัก vs 調候 vs ธาตุทรัพย์ ปนกันไม่แยก label)
 *
 * ไม่ใช่ engine ใหม่ — derive จากผล wrapper-7 + ความสัมพันธ์ห้าธาตุล้วนๆ:
 *   財星ให้ผล   = ธาตุที่ DM คุม (我克=財)
 *   เปิดทางเงิน = ธาตุที่ DM ผลิต (我生=食傷 · 食傷生財)
 *   งาน/ระบบ   = ธาตุที่คุม DM (克我=官殺)
 *   พยุงตัว     = ธาตุที่ผลิต DM (生我=印) + ธาตุเดียวกับ DM (比劫)
 *   調候        = regulator จาก wrapper-5 (ส่งเข้ามา)
 * verdict ต่อบทบาทปรับตามโครงดวง (從/身弱/身強) — ดวง從: พยุงตัว="เติมมากฝืนกระแส" · ไฟ調候="ใช้มีเงื่อนไข"
 *
 * ห้ามใช้ตัดสิน用神 — 用神มาจาก wrapper-6/7 เท่านั้น · นี่คือชั้นสื่อสาร
 */

export type ElementEN = "wood" | "fire" | "earth" | "metal" | "water";

const PRODUCES: Record<ElementEN, ElementEN> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const CONTROLS: Record<ElementEN, ElementEN> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};
const producerOf = (el: ElementEN): ElementEN =>
  (Object.keys(PRODUCES) as ElementEN[]).find((k) => PRODUCES[k] === el)!;
const controllerOf = (el: ElementEN): ElementEN =>
  (Object.keys(CONTROLS) as ElementEN[]).find((k) => CONTROLS[k] === el)!;

export interface ElementRole {
  key: "wealth_result" | "wealth_gate" | "career_system" | "climate" | "self_support";
  elements: ElementEN[];
  label: { th: string; en: string; zh: string };
  /** สถานะการใช้: main=ฝั่งดีหลัก · conditional=ใช้แบบมีเงื่อนไข · caution=เติมมากเสีย */
  status: "main" | "conditional" | "caution";
  verdict: { th: string; en: string; zh: string };
}

export interface ElementRolesInput {
  dmElement: ElementEN;
  structureLabel?: string | null;   /* เช่น 假從財格 */
  engineType?: string | null;       /* เช่น WEAK_DM_WATER_HEAVY */
  primaryYongshen?: string[] | null;
  xishen?: string[] | null;
  jishen?: string[] | null;
  tiaohouRequired?: string | null;  /* regulator จาก wrapper-5 */
  strengthLevel?: string | null;    /* very_weak..very_strong จาก wrapper-6 */
}

const VALID = new Set<ElementEN>(["wood", "fire", "earth", "metal", "water"]);

export function buildElementRoles(input: ElementRolesInput): ElementRole[] {
  const dm = input.dmElement;
  if (!VALID.has(dm)) return [];
  const isFollow = /從/.test(String(input.structureLabel || ""))
    || /^(WEAK_DM_|TRUE_FOLLOW|HUA_QI|CONG_)/.test(String(input.engineType || ""));
  const lv = String(input.strengthLevel || "");
  const isWeak = /weak/.test(lv);
  const good = new Set([...(input.primaryYongshen || []), ...(input.xishen || [])].filter((e) => VALID.has(e as ElementEN)));
  const bad = new Set((input.jishen || []).filter((e) => VALID.has(e as ElementEN)));

  const wealthEl = CONTROLS[dm];
  const gateEl = PRODUCES[dm];
  const careerEl = controllerOf(dm);
  const yinEl = producerOf(dm);
  const roles: ElementRole[] = [];

  /* 財星ให้ผล · ดวง從: 財=ดีเสมอ (從格喜食傷財 ตำราชัด · กัน ji เก่าจาก ext ทำป้ายเพี้ยน) */
  roles.push({
    key: "wealth_result", elements: [wealthEl],
    label: { th: "ธาตุทรัพย์ให้ผล · 財星", en: "Wealth element", zh: "財星" },
    status: good.has(wealthEl) ? "main" : isFollow ? "conditional" : bad.has(wealthEl) ? "caution" : "conditional",
    verdict: isFollow && good.has(wealthEl)
      ? { th: "แกนหลักของดวงตามทรัพย์ — ให้ผลแรง ยิ่งไหลตามยิ่งรุ่ง", en: "Core of this wealth-following chart — flows strongly", zh: "從財之核心 · 順之則旺" }
      : good.has(wealthEl)
      ? { th: "ธาตุเงิน/ทรัพย์ที่ให้ผลดีกับดวงนี้", en: "Wealth element favorable to this chart", zh: "財星有利" }
      : isWeak
      ? { th: "ทรัพย์มีจริงแต่ตัวต้องมีแรงแบก — รับทีละพอดี", en: "Wealth exists but requires capacity to carry", zh: "財旺身弱 · 量力而取" }
      : { th: "ธาตุเงิน/ทรัพย์ของดวงนี้", en: "Wealth element of this chart", zh: "本命財星" },
  });

  /* เปิดทางเงิน (食傷生財) · ดวง從: 食傷=ดีเสมอ (生財ตาม勢) */
  roles.push({
    key: "wealth_gate", elements: [gateEl],
    label: { th: "ธาตุเปิดทางเงิน · 食傷生財", en: "Wealth gateway (output)", zh: "食傷生財" },
    status: good.has(gateEl) ? "main" : isFollow ? "conditional" : bad.has(gateEl) ? "caution" : "conditional",
    verdict: isFollow
      ? { th: "ตัวสร้างทรัพย์ตามกระแส — ผลงาน/ฝีมือแปลงเป็นเงิน", en: "Converts skill into wealth along the flow", zh: "生財順勢" }
      : isWeak
      ? { th: "ระบายแรง — ใช้ได้เมื่อมีฐานพอ ระวังรั่วถ้าตัวอ่อนมาก", en: "Drains energy — use when rooted enough", zh: "洩氣 · 身弱慎用" }
      : { th: "ทางระบายศักยภาพสู่ผลงานและรายได้", en: "Channels potential into output and income", zh: "洩秀生財" },
  });

  /* งาน/ระบบ (官殺) */
  roles.push({
    key: "career_system", elements: [careerEl],
    label: { th: "ธาตุงาน/ระบบ · 官殺", en: "Career/structure element", zh: "官殺" },
    status: good.has(careerEl) ? "main" : bad.has(careerEl) ? "caution" : "conditional",
    verdict: isFollow && good.has(careerEl)
      ? { th: "ระบบ/ตำแหน่งที่มากับกระแส — รับได้ตามจังหวะ", en: "Structure that comes with the flow", zh: "依勢之官" }
      : isWeak
      ? { th: "แรงกด/กรอบ — ดีเมื่อมีที่พึ่ง ระวังถ้าแบกเดี่ยว", en: "Pressure/structure — fine with support", zh: "官殺克身 · 需印化" }
      : { th: "วินัย ระบบ ตำแหน่ง — ของดวงแข็งคือบันได", en: "Discipline and position — a ladder for strong charts", zh: "身強任官" },
  });

  /* 調候 */
  const reg = input.tiaohouRequired && VALID.has(input.tiaohouRequired as ElementEN)
    ? (input.tiaohouRequired as ElementEN) : null;
  if (reg) {
    roles.push({
      key: "climate", elements: [reg],
      label: { th: "ธาตุปรับฤดู · 調候", en: "Climate regulator", zh: "調候" },
      status: bad.has(reg) ? "conditional" : good.has(reg) ? "main" : "conditional",
      verdict: isFollow && bad.has(reg)
        ? { th: "ไม่ใช่用神หลัก — เป็นตัวพยุงอาชีพ/แก้สภาพ ใช้แบบมีเงื่อนไขทีละน้อย เติมมากจะฝืนกระแสดวง", en: "Not the primary useful god — situational support only; too much fights the flow", zh: "非主用神 · 調候輔助 · 過則逆勢" }
        : { th: "ปรับสมดุลฤดูของดวง (หนาว/ร้อน/แห้ง/ชื้น)", en: "Balances the chart's seasonal climate", zh: "調節寒暖燥濕" },
    });
  }

  /* พยุงตัว (印+比劫) */
  roles.push({
    key: "self_support", elements: [yinEl, dm],
    label: { th: "ธาตุพยุงตัว · 印比", en: "Self-support elements", zh: "印比扶身" },
    status: isFollow ? "caution" : isWeak ? "main" : "conditional",
    verdict: isFollow
      ? { th: "ช่วยฐานได้เล็กน้อย แต่เติมมากไปจะฝืนกระแสดวง (從格忌印比)", en: "Slight grounding only — too much resists the flow", zh: "從格忌印比 · 微補即可" }
      : isWeak
      ? { th: "ตัวช่วยหลักของดวงอ่อน — ที่พึ่ง/ครู/พวกพ้อง เสริมให้ยืนได้", en: "Main support for a weak chart", zh: "身弱喜印比" }
      : { th: "ตัวมีพอแล้ว — เติมมากจะตันและแย่งทรัพย์", en: "Already sufficient — excess stagnates", zh: "身強印比過則滯" },
  });

  return roles;
}
