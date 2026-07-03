/**
 * Module · 董公擇日 (ตงกง) — r367 · opt-in
 * =====================================================================
 * ห่อข้อมูล c.donggong (คำนวณแล้วใน route ผ่าน dongGong() · lookup ตำรา 董公選要覽)
 * → ModuleResult เพื่อเข้า combineScores (caps/reasons ไหลทางเดียวกับ module อื่น)
 *
 * ⚠️ opt-in เหมือน tian_xing: route แนบ "เฉพาะเมื่อ user ติ๊ก" (dong_gong ∈ activeModules)
 *    ไม่ติ๊ก = ไม่แนบ = พฤติกรรมเดิม (applyDongGongOverlay ใน route) ไม่เปลี่ยนแม้แต่ byte
 * ⚠️ dong_gong ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES —
 *    pass:false ที่นี่ไม่ตัด SQL · ตัดฤกษ์ผ่าน caps (max) ใน combineScores เท่านั้น
 *
 * กติกาคะแนน (เจ้านาย approve r367):
 *   大凶        → normalized 20 · pass false · cap max 30 (DONGGONG_DAXIONG_CAP)
 *   凶/不利     → normalized 35 · pass false · cap max 45 (DONGGONG_XIONG_CAP)
 *   ji ตรงกิจกรรม → cap max 45 (DONGGONG_JI_CAP)
 *   吉/次吉     → normalized 70 · up +8 (ไม่มี cap)
 *   上吉/全吉/大吉 → normalized 80 · up +8 (ไม่มี cap)
 *   yi ตรงกิจกรรม → up +6
 *   平/—        → normalized 55 (กลาง)
 * หมายเหตุ: delta ใน reasons.up ถูก route (applyDongGongBoost) เอาไปบวกจริงหลัง combine
 * (weight ของ dong_gong ใน weights matrix = 0 → ไม่กวน weighted average ของ 11 ศาสตร์เดิม)
 */
import type { ModuleResult, Reason, CapRule, CandidateSlot, ActivityType } from "../types";

/** alias กิจกรรม UI → คำ 宜/忌 ในตำราตงกง (ย้ายมาจาก route.ts r367 · ค่าเดิมทุกตัว · route ใช้ร่วม) */
export const DONGGONG_ACTIVITY_ALIASES: Record<ActivityType, string[]> = {
  立約: ["立約", "交易", "商買"],
  出行: ["出行", "遠行"],
  動土: ["動土", "造", "起造", "修造", "修", "小修", "伐木", "拴架", "定磉", "上樑"],
  搬家: ["入宅", "移居", "移徙"],
  開市: ["開市", "開張", "商買", "大工開張"],
  婚姻: ["嫁", "娶", "嫁娶", "婚姻", "納采", "納彩", "娶親", "會親"],
  求財: ["開市", "商買", "立約", "造倉庫", "倉庫"],
  祭祀: ["還福願"],
};

const TOP_VERDICTS = new Set(["上吉", "全吉", "大吉"]);
const GOOD_VERDICTS = new Set(["吉", "次吉"]);
const XIONG_VERDICTS = new Set(["凶", "不利"]);

function baseResult(status: "missing" | "ready", normalized: number, confidence: number): ModuleResult {
  return {
    module: "dong_gong",
    status,
    score: { raw: normalized, normalized, weight: 1 },
    pass: normalized >= 40,
    tags: [],
    reasons: { up: [], down: [], warning: [] },
    confidence,
    raw: {},
  };
}

export function computeDongGong(c: CandidateSlot, activity: ActivityType): ModuleResult {
  const dg = c.donggong;
  if (!dg || dg.missing) {
    // ตำราหน้าหาย (_missing) หรือ lookup ไม่เจอ → ไม่ตัดสิน · ไม่กระทบคะแนน (combineScores ข้าม missing)
    return baseResult("missing", 50, 0);
  }

  const aliases = DONGGONG_ACTIVITY_ALIASES[activity] || [];
  const yiMatches = (dg.yi || []).filter((x) => aliases.includes(x));
  const jiMatches = (dg.ji || []).filter((x) => aliases.includes(x));
  const up: Reason[] = [];
  const down: Reason[] = [];
  const caps: CapRule[] = [];
  const tags: string[] = [`dg_${dg.level}`, `dg_${dg.jianchu}`];
  const ctx = `${dg.verdictTh} · ${dg.jianchuTh} ${dg.jianchu}日`;

  let normalized = 55; // 平/— กลาง

  if (dg.verdict === "大凶") {
    normalized = 20;
    caps.push({
      type: "max", value: 30,
      reason: "ตงกงชี้ 大凶 · เพดานคะแนน 30",
      source: "dong_gong",
      code: "DONGGONG_DAXIONG_CAP",
    } as CapRule & { code: string });
    down.push({ code: "DONGGONG_DAXIONG", thai: `ตงกงชี้ ${ctx} · ${dg.noteTh || "วันร้ายหนักตามตำรา"} · เพดานคะแนน 30`, zh: dg.zh, delta: 0, severity: "critical", source: "dong_gong" });
  } else if (XIONG_VERDICTS.has(dg.verdict)) {
    normalized = 35;
    caps.push({
      type: "max", value: 45,
      reason: `ตงกงชี้ ${dg.verdict} (${dg.verdictTh}) · เพดานคะแนน 45`,
      source: "dong_gong",
      code: "DONGGONG_XIONG_CAP",
    } as CapRule & { code: string });
    down.push({ code: "DONGGONG_XIONG", thai: `ตงกงชี้ ${ctx}${dg.noteTh ? ` · ${dg.noteTh}` : ""} · เพดานคะแนน 45`, zh: dg.zh, delta: 0, severity: "warning", source: "dong_gong" });
  } else if (TOP_VERDICTS.has(dg.verdict)) {
    normalized = 80;
    up.push({ code: "DONGGONG_VERDICT_UP", thai: `ตงกงหนุน · ${ctx}${dg.noteTh ? ` · ${dg.noteTh}` : ""}`, zh: dg.zh, delta: 8, severity: "info", source: "dong_gong" });
  } else if (GOOD_VERDICTS.has(dg.verdict)) {
    normalized = 70;
    up.push({ code: "DONGGONG_VERDICT_UP", thai: `ตงกงหนุน · ${ctx}${dg.noteTh ? ` · ${dg.noteTh}` : ""}`, zh: dg.zh, delta: 8, severity: "info", source: "dong_gong" });
  } else {
    // 平 / — (ขึ้นกับวันเกิดเฉพาะตัว) → กลาง 55 · แจ้งบริบทเฉย ๆ
    up.push({ code: "DONGGONG_NEUTRAL", thai: `ตงกงกลาง · ${ctx}`, zh: dg.zh, delta: 0, severity: "info", source: "dong_gong" });
  }

  if (yiMatches.length) {
    up.push({ code: "DONGGONG_YI_MATCH", thai: `ตงกงระบุว่าเหมาะกับกิจกรรมนี้ · 宜 ${yiMatches.join("、")}`, delta: 6, severity: "info", source: "dong_gong" });
    tags.push("dg_yi_match");
  }
  if (jiMatches.length) {
    caps.push({
      type: "max", value: 45,
      reason: `ตงกงมีข้อห้ามตรงกิจกรรมนี้ · 忌 ${jiMatches.join("、")} · เพดานคะแนน 45`,
      source: "dong_gong",
      code: "DONGGONG_JI_CAP",
    } as CapRule & { code: string });
    down.push({ code: "DONGGONG_JI_MATCH", thai: `ตงกงระบุว่าควรเลี่ยงกิจกรรมนี้ · 忌 ${jiMatches.join("、")} (${dg.jianchuTh})`, delta: 0, severity: "warning", source: "dong_gong" });
    tags.push("dg_ji_match");
  }

  const result = baseResult("ready", normalized, 0.85);
  result.tags = tags;
  result.reasons = { up, down, warning: [] };
  if (caps.length) result.caps = caps;
  result.raw = {
    verdict: dg.verdict, verdictTh: dg.verdictTh, level: dg.level,
    jianchu: dg.jianchu, jianchuTh: dg.jianchuTh,
    yi_matches: yiMatches, ji_matches: jiMatches,
    from_exception: dg.fromException, note: dg.noteTh || dg.note || "",
  };
  return result;
}
