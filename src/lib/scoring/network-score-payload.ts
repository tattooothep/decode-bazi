import { pairBaseScore, modulateByTf, type Person } from "./pair-base";
import { computePairReactionV2, type PairReactionUseful } from "./pair-reaction-v2";

export async function buildNetworkScorePayload(body: any, requestUrl = "http://localhost/api/network/score") {
  const self: Person = body.self;
  const others: Person[] = Array.isArray(body.others) ? body.others : [];
  const scoringVersion = body.scoringVersion === "v2" || new URL(requestUrl).searchParams.get("v") === "2";

  let synthFn: ((natal: any) => any) | null = null;
  try {
    // @ts-ignore — runtime CJS module, no type declarations
    const w7 = await import("../../../data/library/wrappers/7-yongshen-v2.js");
    synthFn = (w7 as any).synthesizeYongshen || ((w7 as any).default && (w7 as any).default.synthesizeYongshen) || null;
  } catch {
    synthFn = null;
  }

  const slimSynth = (p: Person) => {
    if (!synthFn || !p?.day?.stem || !p?.day?.branch) return null;
    try {
      const natal: any = {
        year: p.year && p.year.stem && p.year.branch ? { stem: p.year.stem, branch: p.year.branch } : null,
        month: p.month && p.month.stem && p.month.branch ? { stem: p.month.stem, branch: p.month.branch } : null,
        day: { stem: p.day.stem, branch: p.day.branch },
        hour: p.hour && p.hour.stem && p.hour.branch ? { stem: p.hour.stem, branch: p.hour.branch } : null,
      };
      if (!natal.year || !natal.month) return null;
      const s = synthFn(natal);
      return {
        structure_label: s.structure_label,
        engine_type: s.engine_type,
        use_follow_override: s.use_follow_override,
        primary_yongshen: s.primary_yongshen,
        xishen: s.xishen,
        jishen: s.jishen,
        tiaohou_required: s.tiaohou_required,
        tiaohou_weight: s.tiaohou_weight,
        diseases: s.diseases,
        medicine: s.medicine,
        bridges: s.bridges,
        strategy: s.strategy,
        confidence: s.confidence,
      };
    } catch {
      return null;
    }
  };

  const yongshenV2: any = { self: slimSynth(self), others: {} };
  for (const o of others) {
    if (o?.id) yongshenV2.others[o.id] = slimSynth(o);
  }

  const selfYongshen: string[] = Array.isArray(body.selfYongshen) ? body.selfYongshen : [];
  const selfJishen: string[] = Array.isArray(body.selfJishen) ? body.selfJishen : [];
  if (!self || !self.day || !self.day.stem) {
    return { error: "self.day.{stem,branch} required" };
  }

  const opts = {
    selfStrengthUncertain: !!body.selfStrengthUncertain,
    selfDmWeak: !!body.selfDmWeak,
    jishenInMonth: !!body.jishenInMonth,
    structureYongshen: Array.isArray(body.structureYongshen) ? body.structureYongshen : undefined,
  };

  const scores: Record<string, Record<string, number>> = {};
  const tagsOut: Record<string, string[]> = {};
  const flagsOut: Record<string, string[]> = {};
  const directionalOut: Record<string, { atob: number; btoa: number }> = {};
  const breakdownOut: Record<string, { atob: any; btoa: any; contexts?: any }> = {};
  const labelsOut: Record<string, { th: string; en: string; zh: string }> = {};
  const guidanceOut: Record<string, any> = {};
  const reactionV2Out: Record<string, any> = {};

  function fieldOrFallback(value: any, fallback: string[] = []) {
    return Array.isArray(value) && value.length ? value : fallback;
  }

  function usefulFromSynth(s: any, fallbackYongshen: string[] = [], fallbackJishen: string[] = []): PairReactionUseful {
    return {
      primary_yongshen: fieldOrFallback(s?.primary_yongshen, fallbackYongshen),
      xishen: s?.xishen || [],
      jishen: fieldOrFallback(s?.jishen, fallbackJishen),
      medicine: s?.medicine || [],
      diseases: s?.diseases || [],
      structure_label: s?.structure_label || null,
      engine_type: s?.engine_type || null,
    };
  }

  function v2Breakdown(dir: any) {
    const bd = dir?.breakdown || {};
    const events = Array.isArray(bd.events) ? bd.events : [];
    const mappedEvents = events.map((e: any) => {
      const tag = String(e.tag || e.type || "");
      const type = e.kind || "event";
      return { type, label: tag || e.reason || type, score: e.score, axis: e.axis, reason: e.reason };
    });
    return {
      base: dir?.score || 0,
      nobleman: 0,
      group: 0,
      bonus: Math.round((bd.support || 0) + (bd.bond || 0)),
      penalty: Math.round((bd.friction || 0) + (bd.volatility || 0)),
      transit: 0,
      support: bd.support || 0,
      bond: bd.bond || 0,
      friction: bd.friction || 0,
      volatility: bd.volatility || 0,
      axis: bd.axis || {},
      useful: bd.useful || {},
      breakdown: { events: mappedEvents },
    };
  }

  function makeLabel(o: number): { th: string; en: string; zh: string } {
    if (o >= 60) return { th: "หนุนอย่างแรง · ★", en: "Strong support ★", zh: "強助 ★" };
    if (o >= 30) return { th: "หนุน · 合", en: "Support · 合", zh: "相助 · 合" };
    if (o >= 10) return { th: "พอเดินไปด้วยกัน", en: "Workable", zh: "可行" };
    if (o >= -10) return { th: "กลาง · neutral", en: "Neutral", zh: "中性" };
    if (o >= -30) return { th: "ระวัง · 慎", en: "Caution · 慎", zh: "慎" };
    if (o >= -60) return { th: "ปะทะ · 沖", en: "Clash · 沖", zh: "沖" };
    return { th: "ปะทะรุนแรง · ⚠", en: "Severe clash ⚠", zh: "重沖 ⚠" };
  }

  function makeGuidance(overall: number, tags: string[], flags: string[], bonus: number, penalty: number): any {
    let conf = 0.75;
    if (flags?.includes("yongshen_uncertain_cap")) conf -= 0.15;
    if (flags?.includes("structure_override")) conf += 0.05;
    if (Math.abs(overall) >= 50) conf += 0.1;
    if (bonus >= 20 && penalty >= 15) conf -= 0.1;
    conf = Math.max(0.5, Math.min(0.95, conf));

    const ctx: string[] = [];
    if (tags.includes("沖去忌神 ⚠")) ctx.push("พลังปะทะที่ลบของไม่ดีออก · ระยะแรกอาจกระเทือน · แต่ผลลึกๆ เป็นบุญ");
    if (tags.includes("用神")) ctx.push("เขาเสริมพลังคุณตรง · เป็น \"คนที่ฟ้าส่งมา\" · ถ้าคุณตั้งใจดี ความสัมพันธ์จะคืนเป็นทอง");
    if (tags.includes("忌神")) ctx.push("ธาตุของเขาไม่ตรงกับสิ่งที่ดวงคุณต้องการ · ไม่ใช่ศัตรู · แค่ \"ไม่ใช่ทาง\" ของคุณ");
    if (tags.includes("三會")) ctx.push("พลังฤดูธรรมชาติทั้ง ๔ ทิศ · ความสัมพันธ์เกื้อกูลกันโดยธรรมชาติ · ไหลตามเวลา");
    if (tags.includes("三合")) ctx.push("พลังหลอม ๓ ทิศเชื่อมต่อ · ความสัมพันธ์ลึกในระยะยาว · เหมาะร่วมการ");
    if (tags.includes("六合")) ctx.push("คู่ผูกพัน · ทำงานด้วยกันได้นาน · เหมือนเข้าใจกันโดยไม่ต้องอธิบาย");
    if (tags.includes("沖")) ctx.push("มีปะทะตรง ๆ · ไม่ใช่ศัตรูชั่วนิรันดร์ · แต่ต้องสะสาง · ใช้เวลาคุยให้ชัด");
    if (tags.includes("刑")) ctx.push("มีการลงโทษ · บาดเจ็บทางใจ · ระวังคำพูดที่ตัด · ใช้ความเมตตา");
    if (tags.includes("生·เสียพลัง")) ctx.push("ก้านวันของคุณเลี้ยงเขา · แต่ดวงคุณอ่อน · ให้แล้วเหนื่อย · เก็บพลังตัวเองก่อนช่วยคนอื่น");

    const intent: any = {};
    if (overall >= 20) {
      intent.work = { th: "ดี · เหมาะร่วมงานจริง", en: "Good for work", zh: "宜共事" };
      intent.love = { th: "ดี · ถ้าเจตนาตรง", en: "Good if intention aligns", zh: "宜情 · 同志為要" };
      intent.friend = { th: "ดี · เพื่อนที่หนุนกัน", en: "Good support friend", zh: "宜友 · 相助" };
    } else if (overall >= -20) {
      intent.work = { th: "ทำได้ · ต้องชัดเรื่องบทบาท", en: "OK with clear roles", zh: "可 · 明分工" };
      intent.love = { th: "ขึ้นกับช่วงเวลา · คุยให้ลึก", en: "Depends on timing · talk deeply", zh: "視時機 · 深談" };
      intent.friend = { th: "เพื่อนระยะกลาง · ไม่ลึก", en: "Mid-range friend", zh: "中等友誼" };
    } else {
      intent.work = { th: "ระวัง · ถ้าจำเป็นต้องร่วม ตั้งกฎชัด", en: "Caution · set rules if must", zh: "慎 · 必合則明定" };
      intent.love = { th: "ระวัง · พลังไม่ตรง · ต้องตั้งใจมากกว่าปกติ", en: "Caution · misaligned energy", zh: "慎 · 氣場不和" };
      intent.friend = { th: "เพื่อนชั่วคราว · เก็บระยะ", en: "Casual friend · keep distance", zh: "淡交 · 留距" };
    }

    const cautions: string[] = [];
    if (tags.includes("沖去忌神 ⚠")) cautions.push("สัปดาห์แรกอาจรู้สึกอึดอัด · ให้ผ่านไป");
    if (penalty >= 25) cautions.push("มีโทษหลายชั้น · เลื่อนการตัดสินใจใหญ่ออกไปก่อน");
    if (conf < 0.65) cautions.push("คะแนนยังไม่แม่นมาก · ใช้ใจช่วยตัดสิน ไม่ใช่ตัวเลขอย่างเดียว");

    return {
      confidence: Math.round(conf * 100) / 100,
      primary: ctx[0] || (overall >= 20 ? "ความสัมพันธ์เกื้อกูลกันโดยทั่วไป" : overall >= -20 ? "ความสัมพันธ์กลางๆ · ขึ้นกับเจตนา" : "มีอะไรต้องระวัง · แต่ไม่ใช่จุดจบ"),
      context: ctx.slice(0, 4),
      cautions,
      intent,
      disclaimer: "การประเมินนี้ขึ้นกับช่วงเวลา · เจตนา · ดวงเปลี่ยนได้ · 70% ของผลขึ้นกับการตัดสินใจของคุณ",
    };
  }

  for (const o of others) {
    if (!o.id || !o.day) continue;
    if (scoringVersion) {
      const v2 = computePairReactionV2({
        a: { ...self, useful: usefulFromSynth(yongshenV2.self, selfYongshen, selfJishen) },
        b: { ...o, useful: usefulFromSynth(yongshenV2.others[o.id]) },
        date: body.date,
      });
      scores[o.id] = v2.scores as any;
      tagsOut[o.id] = v2.directional.atob.tags;
      flagsOut[o.id] = v2.directional.atob.flags;
      directionalOut[o.id] = { atob: v2.directional.atob.score, btoa: v2.directional.btoa.score };
      breakdownOut[o.id] = {
        atob: v2Breakdown(v2.directional.atob),
        btoa: v2Breakdown(v2.directional.btoa),
        contexts: v2.contexts,
      };
      labelsOut[o.id] = v2.label;
      guidanceOut[o.id] = v2.guidance;
      reactionV2Out[o.id] = v2;
      continue;
    }

    const optsAB = { ...opts, aYongshen: yongshenV2.self, bYongshen: yongshenV2.others[o.id] };
    const optsBA = { ...opts, aYongshen: yongshenV2.others[o.id], bYongshen: yongshenV2.self };
    const r1 = pairBaseScore(self, o, selfYongshen, selfJishen, optsAB);
    const r2 = pairBaseScore(o, self, selfYongshen, selfJishen, optsBA);

    scores[o.id] = {
      day: modulateByTf(r1.score, "day"),
      week: modulateByTf(r1.score, "week"),
      month: modulateByTf(r1.score, "month"),
      year: modulateByTf(r1.score, "year"),
      luck: modulateByTf(r1.score, "luck"),
      overall: Math.round((modulateByTf(r1.score, "day") + modulateByTf(r1.score, "week") + modulateByTf(r1.score, "month") + modulateByTf(r1.score, "year") + modulateByTf(r1.score, "luck")) / 5),
    } as any;
    tagsOut[o.id] = r1.tags;
    flagsOut[o.id] = r1.flags;
    directionalOut[o.id] = { atob: r1.score, btoa: r2.score };
    breakdownOut[o.id] = {
      atob: { ...r1.bd, transit: 0, breakdown: { events: r1.bd.events.map(e => ({ type: "event", label: e })) } },
      btoa: { ...r2.bd, transit: 0 },
    };
    labelsOut[o.id] = makeLabel((scores[o.id] as any).overall || 0);
    guidanceOut[o.id] = makeGuidance((scores[o.id] as any).overall || 0, r1.tags, r1.flags, r1.bd.bonus, r1.bd.penalty);
  }

  return {
    scores,
    tags: tagsOut,
    compound_flags: flagsOut,
    directional: directionalOut,
    breakdown: breakdownOut,
    labels: labelsOut,
    guidance: guidanceOut,
    reaction_v2: reactionV2Out,
    yongshen_v2: yongshenV2,
    version: scoringVersion ? "pair-reaction-v2" : "phase3.6-structure-resonance",
  };
}
