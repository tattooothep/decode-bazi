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
 * กติกาคะแนน (เจ้านาย approve r367 · veto hierarchy r417 5-6 ก.ค. 2569):
 *   大凶        → normalized 20 · pass false · cap max 30 (DONGGONG_DAXIONG_CAP) · veto DONGGONG_DAXIONG (ห้าม · ตัดออกจากผลแนะนำ)
 *   凶/不利     → normalized 35 · pass false · cap max 45 (DONGGONG_XIONG_CAP) · ไม่ veto (เลี่ยงเท่านั้น)
 *   ji ตรงกิจกรรม → cap max 45 (DONGGONG_JI_CAP) · veto DONGGONG_JI (ตำราห้ามกิจกรรมนี้ตรง ๆ)
 *   吉/次吉/上吉/全吉/大吉 → normalized 70/80 · up +8 · "เฉพาะ" เมื่อ yi ตรงกิจกรรม หรือ yi/ji ว่างทั้งคู่
 *     (ถ้า yi/ji มีรายการแต่ไม่ตรงกิจกรรมที่ค้น → normalized 55 กลาง + ป้าย "ภาพรวมวัน ไม่เจาะกิจกรรมนี้" ไม่บวก)
 *   yi ตรงกิจกรรม → up +6
 *   平/—        → normalized 55 (กลาง)
 * หมายเหตุ: delta ใน reasons.up ถูก route (applyDongGongBoost) เอาไปบวกจริงหลัง combine
 * (weight ของ dong_gong ใน weights matrix = 0 → ไม่กวน weighted average ของ 11 ศาสตร์เดิม)
 * veto (r417): ไหลผ่าน combineScores() → ScoringResult.vetoes · route.ts ตัด slot ที่ vetoes.length>0
 * ออกจาก candidates จริง (ย้ายไป cutSlots) — ระดับ "ห้าม" (ตำรา/วันเสียเป็นสากล) ต่างจาก cap/warning
 * (ระดับ "เลี่ยง" สำหรับดวงบุคคล/凶 ทั่วไปที่ไม่ตรงกิจกรรม)
 */
import type { ModuleResult, Reason, CapRule, VetoReason, CandidateSlot, ActivityType } from "../types";

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
  /* r413a: ตรวจ DB จริง 5 ก.ค. 2026 (ref_donggong_day.yi/ji มี 20 คำ + note · ref_donggong_exception.note/verdict) —
     ไม่พบคำเกี่ยวการแพทย์เลย (求醫/療病/針/藥/灸/病 = 0 แถว) → ตำราตงกงเป็นกลางกับการแพทย์
     aliases ว่าง = yi/ji ไม่ match กิจกรรมนี้ (ซื่อตรงต่อตำรา · ห้ามแต่งคำเอง) · verdict ราย วัน (吉/凶/大凶) ยังทำงานปกติ */
  求醫: [],
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
  const veto: VetoReason[] = [];
  const tags: string[] = [`dg_${dg.level}`, `dg_${dg.jianchu}`];
  const ctx = `${dg.verdictTh} · ${dg.jianchuTh} ${dg.jianchu}日`;

  /* r417 · เงื่อนไข "บวกวันดีเฉพาะกิจกรรมเกี่ยวข้อง" (เจ้านายเคาะ 5-6 ก.ค. 2569):
   *  บวกวันดี (吉/上吉) เฉพาะเมื่อ (ก) กิจกรรมนี้ตรง 宜 ของวันจริง หรือ (ข) วันนี้ตำราไม่ได้
   *  เจาะกิจกรรมเลย (yi/ji ว่างทั้งคู่ = คำตัดสินภาพรวม ใช้ได้ทุกกิจกรรม)
   *  ถ้า yi/ji มีรายการแต่ไม่ตรงกิจกรรมที่ค้น → ป้ายกลาง "ภาพรวมวัน ไม่เจาะกิจกรรมนี้" ไม่บวก */
  const dayHasActivityLists = (dg.yi?.length || 0) > 0 || (dg.ji?.length || 0) > 0;
  const verdictAppliesToActivity = yiMatches.length > 0 || !dayHasActivityLists;

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
    // r417 · 大凶 = "ห้าม" สากล ตัดออกจากผลแนะนำจริง (ไม่ใช่แค่หักคะแนน)
    veto.push({
      code: "DONGGONG_DAXIONG",
      reasonTh: `ตงกงชี้ ${ctx} เป็น大凶 (ร้ายหนัก)${dg.noteTh ? ` · ${dg.noteTh}` : ""} — ตำราห้ามใช้วันนี้`,
      reasonEn: `Dong Gong verdict: 大凶 (severely inauspicious) on ${ctx} — the classical text forbids using this day.`,
      reasonZh: `董公選要覽判「大凶」· ${ctx}${dg.note ? ` · ${dg.note}` : ""} · 通書忌用`,
    });
  } else if (XIONG_VERDICTS.has(dg.verdict)) {
    normalized = 35;
    caps.push({
      type: "max", value: 45,
      reason: `ตงกงชี้ ${dg.verdict} (${dg.verdictTh}) · เพดานคะแนน 45`,
      source: "dong_gong",
      code: "DONGGONG_XIONG_CAP",
    } as CapRule & { code: string });
    down.push({ code: "DONGGONG_XIONG", thai: `ตงกงชี้ ${ctx}${dg.noteTh ? ` · ${dg.noteTh}` : ""} · เพดานคะแนน 45`, zh: dg.zh, delta: 0, severity: "warning", source: "dong_gong" });
    // r417 · 凶/不利 = "เลี่ยง" เท่านั้น (ไม่ใช่ห้ามสากล) → คง cap 45 + warning ไม่ veto
  } else if (TOP_VERDICTS.has(dg.verdict) || GOOD_VERDICTS.has(dg.verdict)) {
    const isTop = TOP_VERDICTS.has(dg.verdict);
    if (verdictAppliesToActivity) {
      normalized = isTop ? 80 : 70;
      up.push({ code: "DONGGONG_VERDICT_UP", thai: `ตงกงหนุน · ${ctx}${dg.noteTh ? ` · ${dg.noteTh}` : ""}`, zh: dg.zh, delta: 8, severity: "info", source: "dong_gong" });
    } else {
      // r417 · yi/ji มีรายการแต่ไม่ตรงกิจกรรมที่ค้น → กลาง 55 · ป้ายอธิบายชัดว่าตำราเจาะกิจกรรมอื่น
      normalized = 55;
      up.push({
        code: "DONGGONG_OFF_TOPIC",
        thai: `คำตัดสินภาพรวมของวัน — ตำราวันนี้เจาะกิจกรรมอื่น (${ctx})`,
        zh: "本日董公斷語另有所指，非本活動之宜忌",
        delta: 0, severity: "info", source: "dong_gong",
      });
    }
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
    // r417 · 忌 ตรงกิจกรรมนี้ตรง ๆ = "ห้าม" สากล (ตำราชี้เฉพาะกิจกรรมนี้เลย) → veto
    veto.push({
      code: "DONGGONG_JI",
      reasonTh: `ตงกงระบุข้อห้ามตรงกิจกรรมนี้ · 忌 ${jiMatches.join("、")} (${dg.jianchuTh}) — ตำราห้ามใช้วันนี้กับกิจกรรมนี้`,
      reasonEn: `Dong Gong explicitly forbids this activity today — 忌 ${jiMatches.join("、")} (${dg.jianchu}日).`,
      reasonZh: `董公選要覽「忌 ${jiMatches.join("、")}」直指本活動 · 通書忌用`,
    });
  }

  const result = baseResult("ready", normalized, 0.85);
  result.tags = tags;
  result.reasons = { up, down, warning: [] };
  if (caps.length) result.caps = caps;
  if (veto.length) result.veto = veto;
  result.raw = {
    verdict: dg.verdict, verdictTh: dg.verdictTh, level: dg.level,
    jianchu: dg.jianchu, jianchuTh: dg.jianchuTh,
    yi_matches: yiMatches, ji_matches: jiMatches,
    from_exception: dg.fromException, note: dg.noteTh || dg.note || "",
    off_topic_verdict: (TOP_VERDICTS.has(dg.verdict) || GOOD_VERDICTS.has(dg.verdict)) && !verdictAppliesToActivity,
  };
  return result;
}
