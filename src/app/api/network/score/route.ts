/**
 * POST /api/network/score
 *
 * Body: {
 *   self:   { day:{stem,branch}, year:{stem,branch}, month:{stem,branch}, hour:{stem,branch} },
 *   others: [ { id, day, year, month, hour } ]
 * }
 *
 * Returns: { scores: { [id]: { day, week, month, year, luck } }, tags: { [id]: string[] } }
 *
 * 18 พ.ค. 2026 refactor · ย้าย logic ไป src/lib/scoring/pair-base.ts (Single Source of Truth)
 */
import { NextResponse } from "next/server";
import { pairBaseScore, modulateByTf, type Person } from "@/lib/scoring/pair-base";


export async function POST(req: Request) {
  /* 1 มิ.ย. · ดูคะแนนเครือข่ายต้องสมัคร/login ก่อน (เจ้านายสั่ง) */
  if (!(await (await import("@/lib/auth")).getSession())) return new Response(JSON.stringify({ error: "not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const self: Person = body.self;
  const others: Person[] = Array.isArray(body.others) ? body.others : [];

  /* 📜 Wrapper-7 v2 yongshen synthesizer · อากง+อาม่า 15 พ.ค. 2026 */
  let synthFn: ((natal: any) => any) | null = null;
  try {
    // @ts-ignore — runtime CJS module, no type declarations
    const w7 = await import("../../../../../data/library/wrappers/7-yongshen-v2.js");
    synthFn = (w7 as any).synthesizeYongshen || ((w7 as any).default && (w7 as any).default.synthesizeYongshen) || null;
  } catch { synthFn = null; }
  const slimSynth = (p: Person) => {
    if (!synthFn || !p?.day?.stem || !p?.day?.branch) return null;
    try {
      /* 19 พ.ค. Option α · "ไม่มีคือไม่มี" · ห้าม fabricate hour จาก day
       * ปล่อย hour=null ให้ wrapper-7 activePositions filter ทิ้ง · 3p mode honest */
      const natal: any = {
        year:  p.year  && p.year.stem  && p.year.branch  ? { stem: p.year.stem,  branch: p.year.branch }  : null,
        month: p.month && p.month.stem && p.month.branch ? { stem: p.month.stem, branch: p.month.branch } : null,
        day:   { stem: p.day.stem, branch: p.day.branch },
        hour:  p.hour  && p.hour.stem  && p.hour.branch  ? { stem: p.hour.stem,  branch: p.hour.branch }  : null,
      };
      /* ถ้า year/month ก็ขาด → กลายเป็น degenerate · synthFn จะคืน null/throw · safe */
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
    } catch { return null; }
  };

  const yongshenV2: any = { self: slimSynth(self), others: {} };
  for (const o of others) {
    if (o?.id) yongshenV2.others[o.id] = slimSynth(o);
  }

  const selfYongshen: string[] = Array.isArray(body.selfYongshen) ? body.selfYongshen : [];
  const selfJishen: string[] = Array.isArray(body.selfJishen) ? body.selfJishen : [];
  if (!self || !self.day || !self.day.stem) {
    return NextResponse.json({ error: 'self.day.{stem,branch} required' }, { status: 400 });
  }

  /* 📜 อากง · context flags (จาก frontend หรือ infer · optional) */
  const opts = {
    selfStrengthUncertain: !!body.selfStrengthUncertain,
    selfDmWeak:            !!body.selfDmWeak,
    jishenInMonth:         !!body.jishenInMonth,
    structureYongshen:     Array.isArray(body.structureYongshen) ? body.structureYongshen : undefined,
  };

  const scores: Record<string, Record<string, number>> = {};
  const tagsOut: Record<string, string[]> = {};
  const flagsOut: Record<string, string[]> = {};
  const directionalOut: Record<string, { atob: number; btoa: number }> = {};
  const breakdownOut: Record<string, { atob: any; btoa: any }> = {};
  const labelsOut: Record<string, { th: string; en: string; zh: string }> = {};
  const guidanceOut: Record<string, any> = {};

  /* helper · label จาก overall score */
  function makeLabel(o: number): { th: string; en: string; zh: string } {
    if (o >= 60) return { th:'หนุนอย่างแรง · ★', en:'Strong support ★', zh:'強助 ★' };
    if (o >= 30) return { th:'หนุน · 合', en:'Support · 合', zh:'相助 · 合' };
    if (o >= 10) return { th:'พอเดินไปด้วยกัน', en:'Workable',       zh:'可行' };
    if (o >= -10) return { th:'กลาง · neutral', en:'Neutral',         zh:'中性' };
    if (o >= -30) return { th:'ระวัง · 慎',     en:'Caution · 慎',    zh:'慎' };
    if (o >= -60) return { th:'ปะทะ · 沖',      en:'Clash · 沖',       zh:'沖' };
    return { th:'ปะทะรุนแรง · ⚠', en:'Severe clash ⚠', zh:'重沖 ⚠' };
  }

  /* 📜 Phase 5 · Guidance · 70% confidence ไม่ฟันธง · ขึ้นกับเจตนา */
  function makeGuidance(overall: number, tags: string[], flags: string[], bonus: number, penalty: number, opts: any): any {
    /* confidence ขึ้นกับ extremes + mixed signals + uncertain flags */
    let conf = 0.75;
    if (flags?.includes('yongshen_uncertain_cap')) conf -= 0.15;
    if (flags?.includes('structure_override')) conf += 0.05;
    if (Math.abs(overall) >= 50) conf += 0.10;
    if (bonus >= 20 && penalty >= 15) conf -= 0.10; /* mixed = ไม่ชัด */
    conf = Math.max(0.5, Math.min(0.95, conf));

    /* context notes · นำมาจาก tags */
    const ctx: string[] = [];
    if (tags.includes('沖去忌神 ⚠')) ctx.push('พลังปะทะที่ลบของไม่ดีออก · ระยะแรกอาจกระเทือน · แต่ผลลึกๆ เป็นบุญ');
    if (tags.includes('用神')) ctx.push('เขาเสริมพลังคุณตรง · เป็น "คนที่ฟ้าส่งมา" · ถ้าคุณตั้งใจดี ความสัมพันธ์จะคืนเป็นทอง');
    if (tags.includes('用神·รอง')) ctx.push('เขาเสริมพลังคุณรอง · ใช้ได้ในบางบริบท · ขึ้นกับช่วงชีวิตและเรื่องที่ทำ');
    if (tags.includes('忌神')) ctx.push('ธาตุของเขาไม่ตรงกับสิ่งที่ดวงคุณต้องการ · ไม่ใช่ศัตรู · แค่ "ไม่ใช่ทาง" ของคุณ');
    if (tags.includes('忌神แรง')) ctx.push('忌神 อยู่ในตำแหน่งหลัก · ระวังการใช้พลังแบบที่เป็นมา · เปลี่ยน mindset ก่อนจะตัดสินใจร่วม');
    if (tags.includes('三會')) ctx.push('พลังฤดูธรรมชาติทั้ง ๔ ทิศ · ความสัมพันธ์เกื้อกูลกันโดยธรรมชาติ · ไหลตามเวลา');
    if (tags.includes('半三會')) ctx.push('พลังฤดูหลอม 2 ใน 3 · เข้ากันได้แต่ยังไม่เต็ม · ต้องเติมองค์ประกอบที่ขาด');
    if (tags.includes('三合')) ctx.push('พลังหลอม ๓ ทิศเชื่อมต่อ · ความสัมพันธ์ลึกในระยะยาว · เหมาะร่วมการ');
    if (tags.includes('六合')) ctx.push('คู่ผูกพัน · ทำงานด้วยกันได้นาน · เหมือนเข้าใจกันโดยไม่ต้องอธิบาย');
    if (tags.includes('沖')) ctx.push('มีปะทะตรง ๆ · ไม่ใช่ศัตรูชั่วนิรันดร์ · แต่ต้องสะสาง · ใช้เวลาคุยให้ชัด');
    if (tags.includes('刑')) ctx.push('มีการลงโทษ · บาดเจ็บทางใจ · ระวังคำพูดที่ตัด · ใช้ความเมตตา');
    if (tags.includes('合化用神')) ctx.push('合 หลอมเป็น 用神 · พลังจากการเชื่อมต่อกลายเป็นทอง · ส่งผลถึงทรัพย์/หน้าที่');
    if (tags.includes('合化忌神')) ctx.push('合 หลอมเป็น 忌神 · ระวังพลังที่ดูดีตอนแรกแต่ทำให้ดวงคุณอ่อน · ใช้สติเลือก');
    /* 📜 อากงอาม่า · context notes ใหม่ */
    if (tags.includes('調候·火助')) ctx.push('ดวงคุณหนาวต้องการไฟ · เขามีไฟในผัง · ทำให้คุณอุ่นขึ้น เคลื่อนได้');
    if (tags.includes('用神·根')) ctx.push('เขามี "ราก" ของย่งเสินของคุณในกิ่งเสา · เป็นแหล่งหล่อเลี้ยงระยะยาว · ไม่ใช่แค่ผิวเผิน');
    if (tags.includes('沖·ผสม·พอชดเชย')) ctx.push('การปะทะคู่นี้ครึ่งหนึ่งทำลาย忌神 · ครึ่งหนึ่งกระทบ用神 · จึงพอชดเชยกัน · ไม่ใช่ลบสุดโต่ง');
    if (tags.includes('沖去用神 ⚠⚠')) ctx.push('ระวัง · การปะทะนี้ทำลาย用神 ของคุณตรงๆ · พลังหลักหลุดมือ · ต้องป้องกัน');
    if (tags.includes('生·เสียพลัง')) ctx.push('ก้านวันของคุณเลี้ยงเขา · แต่ดวงคุณอ่อน · "ให้แล้วเหนื่อย" · เก็บพลังตัวเองก่อนช่วยคนอื่น');
    if (tags.includes('แรงขับ·ไม่นิ่ง')) ctx.push('ความสัมพันธ์มีพลังบวกแต่ผ่านการชนเยอะ · ตื่นเต้น/น่าสนใจ · แต่ไม่นิ่ง · ระวังจุดที่ทำให้แตกหัก');

    /* intent guide · 3 modes */
    const intent: any = {};
    if (overall >= 20) {
      intent.work    = { th:'ดี · เหมาะร่วมงานจริง', en:'Good for work', zh:'宜共事' };
      intent.love    = { th:'ดี · ถ้าเจตนาตรง', en:'Good if intention aligns', zh:'宜情 · 同志為要' };
      intent.friend  = { th:'ดี · เพื่อนที่หนุนกัน', en:'Good support friend', zh:'宜友 · 相助' };
    } else if (overall >= -20) {
      intent.work    = { th:'ทำได้ · ต้องชัดเรื่องบทบาท', en:'OK with clear roles', zh:'可 · 明分工' };
      intent.love    = { th:'ขึ้นกับช่วงเวลา · คุยให้ลึก', en:'Depends on timing · talk deeply', zh:'視時機 · 深談' };
      intent.friend  = { th:'เพื่อนระยะกลาง · ไม่ลึก', en:'Mid-range friend', zh:'中等友誼' };
    } else {
      intent.work    = { th:'ระวัง · ถ้าจำเป็นต้องร่วม ตั้งกฎชัด', en:'Caution · set rules if must', zh:'慎 · 必合則明定' };
      intent.love    = { th:'ระวัง · พลังไม่ตรง · ต้องตั้งใจมากกว่าปกติ', en:'Caution · misaligned energy', zh:'慎 · 氣場不和' };
      intent.friend  = { th:'เพื่อนชั่วคราว · เก็บระยะ', en:'Casual friend · keep distance', zh:'淡交 · 留距' };
    }

    /* cautions · safety reminders */
    const cautions: string[] = [];
    if (tags.includes('沖去忌神 ⚠')) cautions.push('สัปดาห์แรกอาจรู้สึกอึดอัด · ให้ผ่านไป');
    if (penalty >= 25) cautions.push('มีโทษหลายชั้น · เลื่อนการตัดสินใจใหญ่ออกไปก่อน');
    if (conf < 0.65) cautions.push('คะแนนยังไม่แม่นมาก · ใช้ใจช่วยตัดสิน ไม่ใช่ตัวเลขอย่างเดียว');

    return {
      confidence: Math.round(conf * 100) / 100,
      primary: ctx[0] || (overall >= 20 ? 'ความสัมพันธ์เกื้อกูลกันโดยทั่วไป' : overall >= -20 ? 'ความสัมพันธ์กลางๆ · ขึ้นกับเจตนา' : 'มีอะไรต้องระวัง · แต่ไม่ใช่จุดจบ'),
      context: ctx.slice(0, 4),
      cautions,
      intent,
      disclaimer: 'การประเมินนี้ขึ้นกับช่วงเวลา · เจตนา · ดวงเปลี่ยนได้ · 70% ของผลขึ้นกับการตัดสินใจของคุณ',
    };
  }

  for (const o of others) {
    if (!o.id || !o.day) continue;
    /* 📜 inject yongshen v2 ของทั้ง 2 ฝั่ง · เพิ่ม structure resonance · 15 พ.ค. */
    const optsAB = { ...opts, aYongshen: yongshenV2.self, bYongshen: yongshenV2.others[o.id] };
    const optsBA = { ...opts, aYongshen: yongshenV2.others[o.id], bYongshen: yongshenV2.self };
    const r1 = pairBaseScore(self, o, selfYongshen, selfJishen, optsAB);
    /* b → a · swap people (ใช้ b เป็น self · ไม่มี b's yongshen → ใช้ heuristic หรือเว้น) */
    const r2 = pairBaseScore(o, self, selfYongshen, selfJishen, optsBA);
    /* timeframe modulated */
    scores[o.id] = {
      day:    modulateByTf(r1.score, 'day'),
      week:   modulateByTf(r1.score, 'week'),
      month:  modulateByTf(r1.score, 'month'),
      year:   modulateByTf(r1.score, 'year'),
      luck:   modulateByTf(r1.score, 'luck'),
      overall: Math.round((modulateByTf(r1.score,'day') + modulateByTf(r1.score,'week') + modulateByTf(r1.score,'month') + modulateByTf(r1.score,'year') + modulateByTf(r1.score,'luck')) / 5),
    } as any;
    tagsOut[o.id] = r1.tags;
    flagsOut[o.id] = r1.flags;
    directionalOut[o.id] = { atob: r1.score, btoa: r2.score };
    breakdownOut[o.id] = {
      atob: { ...r1.bd, transit: 0, breakdown: { events: r1.bd.events.map(e => ({ type:'event', label:e })) } },
      btoa: { ...r2.bd, transit: 0 },
    };
    labelsOut[o.id] = makeLabel((scores[o.id] as any).overall || 0);
    guidanceOut[o.id] = makeGuidance(
      (scores[o.id] as any).overall || 0,
      r1.tags, r1.flags, r1.bd.bonus, r1.bd.penalty, opts
    );
  }

  return NextResponse.json({
    scores, tags: tagsOut, compound_flags: flagsOut,
    directional: directionalOut, breakdown: breakdownOut, labels: labelsOut,
    guidance: guidanceOut,
    yongshen_v2: yongshenV2,
    version: 'phase3.6-structure-resonance',
  });
}
