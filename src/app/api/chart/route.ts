/**
 * POST /api/chart
 * Body: { date:"YYYY-MM-DD", time:"HH:MM"?, longitude?:number, gender?:"M"|"F", birthTimeKnown?:boolean }
 * Returns: full BaZi chart from 6 wrappers + tyme4ts
 * 19 พ.ค. Option α · birthTimeKnown:false → 3p mode · hour null · skip ChildLimit/getSolarTimeAtTST/hsHhs[hour]
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { NO_STORE_HEADERS, sanitizeChartPayload } from "@/lib/api-scrub";
import { getDaymasterProfile, attachDaymasterI18n } from "@/lib/daymaster-profile";
import { buildElementRoles } from "@/lib/element-roles";
import { getProductAccess, PRODUCT_PAGE_ENTITLEMENTS } from "@/lib/product-entitlement";
import { shapeChartPayload } from "@/lib/chart-product-shape";

/* HK_ELEMENT_ROLES_V1 (10 มิ.ย.) · เติม "บทบาทธาตุในชีวิต" เข้า yongshen_v2 (display semantics ทุกดวง)
 * แยก 財星ให้ผล/เปิดทางเงิน/งาน/調候/พยุงตัว ออกจาก 用神/忌神 — แก้ "เว็บพูดสองภาษาในหน้าเดียว" */
function attachElementRoles(yv2: any, dmStem: string, strengthLevel: string | null): any {
  if (!yv2) return yv2;
  const STEM_EL: Record<string, string> = {
    甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
    己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
  };
  const dmEl = STEM_EL[dmStem];
  if (!dmEl) return yv2;
  try {
    yv2.element_roles = buildElementRoles({
      dmElement: dmEl as any,
      structureLabel: yv2.structure_label,
      engineType: yv2.engine_type,
      primaryYongshen: yv2.primary_yongshen,
      xishen: yv2.xishen,
      jishen: yv2.jishen,
      tiaohouRequired: yv2.tiaohou_required,
      strengthLevel,
    });
  } catch { /* additive — พังก็ไม่ขวาง response */ }
  return yv2;
}

/* HK_FOLLOW_NEEDS_OVERRIDE_V1 (10 มิ.ย.) · §00 "สิ่งที่ดวงต้องการ" เป็นข้อความ static 30 โปรไฟล์ (扶抑ดวงปกติ)
 * ดวง從/假從 (เช่น Aeaw 假從財) จะขัด engine ตรงๆ (static สอน "เติมไฟ/ดินพยุงตัว" แต่ engine 忌ไฟ/ดิน)
 * → override needs ด้วยข้อมูลจาก wrapper-7 จริง (engine-derived · ไม่ใช่คำทำนายแต่งเอง) */
function overrideNeedsForFollow(profile: any, yv2: any): any {
  if (!profile || !yv2) return profile;
  const et = String(yv2.engine_type || "");
  const isFollow = yv2.use_follow_override === true
    || /^(WEAK_DM_|TRUE_FOLLOW|HUA_QI|CONG_|ZHUAN_WANG)/.test(et)
    || /從/.test(String(yv2.structure_label || ""));
  if (!isFollow) return profile;
  const TH: Record<string, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
  const j = (a: unknown) => (Array.isArray(a) ? a.map((e) => TH[String(e)] || "").filter(Boolean).join(" · ") : "");
  const yong = j(yv2.primary_yongshen);
  const xi = j(yv2.xishen);
  const ji = j(yv2.jishen);
  const needs =
    `⚠️ ดวงนี้เป็นโครงสร้างพิเศษ "${yv2.structure_label || "ตามกระแส·從"}" — ตัวเราอ่อนมากจนตำราให้ "ไหลตามกระแสที่ครองดวง" แทนการฝืนพยุงตัวเอง` +
    ` คำแนะนำแบบดวงปกติ (เติมธาตุพยุงตัว) จึงไม่ใช้กับดวงนี้` +
    (yong ? ` · ธาตุที่หนุนดวง: ${yong}` : "") +
    (xi ? ` เสริมด้วย ${xi}` : "") +
    (ji ? ` · ธาตุที่ควรระวัง: ${ji} (ฝืนเติม = สวนกระแสดวง)` : "") +
    ` — รายละเอียดดูหัวข้อ "ดวงพิเศษ" และ "ธาตุช่วย 用神 v2" ด้านล่าง`;
  return { ...profile, needs, follow_override: true };
}

async function attachSystemBElementWeights(ext: any, natal: any) {
  const { buildElementDistribution } = await import("@/lib/element-distribution-functional");
  const distribution = buildElementDistribution(natal as any, "systemB");
  if (distribution.engine_version !== "system-b-v1") {
    throw new Error(`unsafe element distribution engine: ${distribution.engine_version}`);
  }
  ext.element_distribution = distribution;

  /* Backward-compatible key, but no Voytek/legacy fallback: this payload is
   * derived from SystemB distribution only. */
  const { buildStrengthFunctional } = await import("@/lib/strength-functional");
  ext.voytek_strength = buildStrengthFunctional(natal.day.stem, {}, distribution);
  ext.functional_strength = ext.voytek_strength;
  return distribution;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const productAccess = await getProductAccess(session.userId);
  const productPlan = productAccess?.plan || "free";
  const chartCaps = productAccess?.pages.chart || PRODUCT_PAGE_ENTITLEMENTS.free.chart;

  const body = await req.json().catch(() => ({}));
  const {
    date,
    time: timeRaw,
    longitude = 100.5018,
    gender = "M",
    dayBoundary = "23:00",
    birthTimeKnown: birthTimeKnownRaw,
  } = body;
  if (!date) return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400, headers: NO_STORE_HEADERS });

  const birthTimeKnown = birthTimeKnownRaw !== false;             /* default true · backward compat */
  const time = birthTimeKnown ? (timeRaw || "12:00") : "12:00";    /* anchor only · ไม่ใช่ pillar ใน 3p */

  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400, headers: NO_STORE_HEADERS });

  try {
    // Use shared helper (TST applied · single source of truth)
    const { calcBazi } = await import("@/lib/bazi-calc");
    const w1 = await import("../../../../data/library/wrappers/1-stem-branch-matrix.js");
    const w2 = await import("../../../../data/library/wrappers/2-hs-hhs-combo.js");
    const w4 = await import("../../../../data/library/wrappers/4-useful-god.js");
    const w5 = await import("../../../../data/library/wrappers/5-tiao-hou.js");

    const calc = birthTimeKnown
      ? await calcBazi({
          date,
          time,
          longitude: typeof longitude === "number" ? longitude : 100.5018,
          gmtOffsetHours: 7,
          gender: gender as "M" | "F" | undefined,
          dayBoundary: (dayBoundary === "00:00" ? "00:00" : "23:00"),
          birthTimeKnown: true,
        })
      : await calcBazi({
          date,
          longitude: typeof longitude === "number" ? longitude : 100.5018,
          gmtOffsetHours: 7,
          gender: gender as "M" | "F" | undefined,
          birthTimeKnown: false,
        });
    const natal = calc.pillars;
    let daymasterProfile = getDaymasterProfile(natal.day.stem, {
      level: calc.strength.level,
      percent: calc.strength.percent,
    });

    const matrix     = w1.buildMatrix(natal);
    /* 3p: filter ตำแหน่ง hour ออก · ทุกที่ที่ derefer natal[pos].branch ต้องผ่าน active positions */
    const positions: ("year"|"month"|"day"|"hour")[] =
      calc.mode === "3p" ? ["year","month","day"] : ["year","month","day","hour"];
    const branches  = positions.map(p => natal[p]!.branch);
    const hsHhs     = positions.map(p => ({
      pillar: p,
      ...w2.detectHsHhsCombo(natal[p]!, branches),
    }));
    const usefulGod  = w4.getUsefulGod(natal.day.stem);
    const tiaoHou    = w5.tiaoHouAnalysis(natal);

    /* Voytek-style startAge · use tyme4ts ChildLimit · ต้องการ solar time · 3p: skip · ใช้ null */
    let startAge: number | null = calc.mode === "3p" ? null : 10;
    if (calc.mode === "4p") {
      try {
        const tyme = await import("tyme4ts");
        const { getSolarTimeAtTST } = await import("@/lib/bazi-calc");
        const { st } = await getSolarTimeAtTST({
          date, time,
          longitude: typeof longitude === "number" ? longitude : 100.5018,
          gmtOffsetHours: 7,
          birthTimeKnown: true,
        });
        const g = gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
        const cl = tyme.ChildLimit.fromSolarTime(st, g);
        const yrs = cl.getYearCount();
        const mns = cl.getMonthCount();
        const dys = cl.getDayCount();
        startAge = Math.round((yrs + mns / 12 + dys / 365.25) * 100) / 100;
      } catch (e) {
        console.error("ChildLimit calc failed, falling back to default 10:", e);
        startAge = 10;
      }
    }

    const { buildChartExtensions } = await import("@/lib/chart-extensions");

    /* 19 พ.ค. Option α · 3p mode · hour pillar unknown
     * Still build chart extensions for year/month/day so §02 does not look empty.
     * Keep hour-required engines (Heluo/QiMen precise/solar time) disabled rather than guessing.
     */
    if (calc.mode === "3p") {
      let yongshenV2_3p: any = null;
      try {
        // @ts-ignore — runtime CJS module
        const w7 = await import("../../../../data/library/wrappers/7-yongshen-v2.js");
        const synthFn = (w7 as any).synthesizeYongshen || (w7 as any).default?.synthesizeYongshen;
        if (synthFn) {
          const s = synthFn(natal);
          yongshenV2_3p = {
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
            explain_log: s.explain_log,
          };
        }
      } catch (e) { console.error("yongshen_v2 (3p) synth failed:", e); }

      const birthDateAnchor = new Date(`${date}T12:00:00+07:00`);
      let qiyunLock: any = null;
      let qiyunStartAge = 10;
      try {
        const { computeQiyunLock } = await import("@/lib/bazi-qiyun");
        qiyunLock = await computeQiyunLock({
          date,
          gender: (gender === "F" ? "F" : "M"),
          lng: typeof longitude === "number" ? longitude : 100.5018,
          birthTimeKnown: false,
          dayBoundary: (dayBoundary === "00:00" ? "00:00" : "23:00"),
        });
        qiyunStartAge = qiyunLock?.representativeStartAge ?? 10;
      } catch (e) {
        console.warn("[chart] 3p qiyun lock failed, falling back to startAge=10", e);
      }
      const adjustedYongshenEls = (calc.yongshen || []).map(y => y.element).filter(Boolean);
      const ext = buildChartExtensions(
        natal as any,
        new Date(),
        (gender as "M" | "F") || "M",
        birthDateAnchor,
        qiyunStartAge,
        calc.geJu.structure || null,
        calc.strength.percent,
        calc.yongshen[0]?.element || null,
        adjustedYongshenEls
      );
      if (qiyunLock?.mode === "unavailable" && qiyunLock.error) {
        qiyunLock = { ...qiyunLock, error: "qiyun_unavailable" };
      }
      const qiyunTimingMethod = qiyunLock?.authority === "full_day_interval"
        ? "HK_QIYUN_LOCK_V1 full_day_interval → representativeStartAge; no exact birth time"
        : "HK_QIYUN_LOCK_V1 unavailable → fallback startAge";
      if (Array.isArray((ext as any).luck_pillars)) {
        (ext as any).luck_pillars = (ext as any).luck_pillars.map((p: any) => ({
          ...p,
          timing_method: qiyunTimingMethod,
        }));
      }
      if (Array.isArray((ext as any).luck_decade_drilldown)) {
        (ext as any).luck_decade_drilldown = (ext as any).luck_decade_drilldown.map((d: any) => ({
          ...d,
          timing_method: qiyunTimingMethod,
        }));
      }
      const systemBDistribution = await attachSystemBElementWeights(ext, natal);

      try {
        // @ts-ignore — runtime CJS
        const w7 = await import("../../../../data/library/wrappers/7-yongshen-v2.js");
        const synth = (w7 as any).synthesizeYongshen || ((w7 as any).default && (w7 as any).default.synthesizeYongshen);
        if (synth) {
          const sFull = synth(natal);
          const rootedness = sFull?._details?.rootedness;
          if (rootedness) {
            const distribution = systemBDistribution;
            const { buildStrengthFunctional } = await import("@/lib/strength-functional");
            const fnStrength = buildStrengthFunctional(natal.day.stem, rootedness, distribution);
            (ext as any).voytek_strength = fnStrength;
            (ext as any).functional_strength = fnStrength;
            /* HK_DAYMASTER_STRENGTH_UNIFY_V1 (สเตป 5) · ภาพรวมตัวตนใช้ calc.strength(wrapper-6·เดียวกับ用神) ไม่ใช่ fnStrength(element-dist) → 強/弱 ตรง用神 */
            daymasterProfile = getDaymasterProfile(natal.day.stem, {
              level: calc.strength.level,
              percent: calc.strength.percent,
            });
            try {
              const { buildHealthFunctional } = await import("@/lib/health-functional");
              (ext as any).health_mapping = buildHealthFunctional(natal.day.stem, rootedness, fnStrength.supporting_pct, distribution);
            } catch (e) {
              console.warn("[chart] 3p health_mapping failed", e);
            }
            try {
              const { buildRootednessExplain } = await import("@/lib/explain-rootedness");
              (ext as any).rootedness_explain = buildRootednessExplain(natal.day.stem, rootedness, distribution);
            } catch (e) {
              console.warn("[chart] 3p rootedness_explain failed", e);
            }
            try {
              if (distribution) {
                const { buildRootednessExplainV2 } = await import("@/lib/rootedness-explain-v2");
                (ext as any).rootedness_explain_v2 = buildRootednessExplainV2(natal.day.stem, distribution);
              }
            } catch (e) {
              console.warn("[chart] 3p rootedness_explain_v2 failed", e);
            }
          }
        }
      } catch (e) {
        console.warn("[chart] 3p functional override failed", e);
      }

      const response = {
        input: { date, time: null, longitude, gender, birthTimeKnown: false },
        pillars: natal,
        pillarsZh: calc.pillarsZh,
        dayMaster: calc.dayMaster,
        day_master: calc.dayMaster,
        strength: calc.strength,
        geJu: calc.geJu,
        ge_ju: calc.geJu,
        yongshen: calc.yongshen,
        climate: calc.climate,
        lunar: calc.lunar,
        tst: null,
        mode: "3p" as const,
        birthTimeKnown: false,
        start_luck_age: qiyunStartAge,
        qiyun_lock: qiyunLock,
        uncertainty: {
          dayBoundaryUncertain: calc.dayBoundaryUncertain,
          monthPillarUncertainNearJieqi: calc.monthPillarUncertainNearJieqi,
          dayPillarUncertain: calc.dayPillarUncertain,
          dateAnchor: calc.dateAnchor,
          ignoredDayBoundary: calc.ignoredDayBoundary,
        },
        analysis: {
          ge_ju: calc.geJu,
          useful_god: usefulGod,
          tiao_hou: tiaoHou,
          strength_yongshen: { strength: calc.strength, yongshenFinal: calc.yongshen, climate: { climate: calc.climate } },
          hs_hhs: hsHhs,
          matrix_summary: matrix.summary,
          element_counts: ext.element_counts,
          ten_gods_map: ext.ten_gods_map,
          qi_phases: ext.qi_phases,
          interactions: ext.interactions,
          punishments: ext.punishments,
          combinations: ext.combinations,
          jishen: ext.jishen,
          today_overlay: ext.today_overlay,
          luck_pillars: ext.luck_pillars,
          current_luck_idx: ext.current_luck_idx,
          /* G1 · §02 Joey Yap-style table · 3p-safe: hour fields are null/empty only */
          nayin: ext.nayin,
          kong_wang: ext.kong_wang,
          three_phases: ext.three_phases,
          special_stars: ext.special_stars,
          carries: [],
          /* G4 · natal sections that can be derived from 3 pillars */
          life_palace: null,
          palace_readings: ext.palace_readings,
          five_structure: ext.five_structure,
          personal_stars: ext.personal_stars,
          qimen_destiny: null,
          stem_interactions: ext.stem_interactions,
          fan_yin_fu_yin: ext.fan_yin_fu_yin,
          current_year_pillar: ext.current_year_pillar,
          voytek_strength: ext.voytek_strength,
          functional_strength: (ext as any).functional_strength,
          lp_natal_interactions: ext.lp_natal_interactions,
          tian_di_he: ext.tian_di_he,
          liu_nian_timeline: ext.liu_nian_timeline,
          luck_decade_drilldown: ext.luck_decade_drilldown,
          special_chart: ext.special_chart,
          spouse_palace: ext.spouse_palace,
          career_industry: ext.career_industry,
          health_mapping: ext.health_mapping,
          rootedness_explain: (ext as any).rootedness_explain,
          rootedness_explain_v2: (ext as any).rootedness_explain_v2,
          element_distribution: (ext as any).element_distribution,
          start_luck_age: qiyunStartAge,
          qiyun_lock: qiyunLock,
          daymaster_profile: attachDaymasterI18n(overrideNeedsForFollow(daymasterProfile, yongshenV2_3p), yongshenV2_3p),
        },
        yongshen_v2: attachElementRoles(yongshenV2_3p, natal.day.stem, calc.strength?.level || null),
        heluo_astrology: null,        /* 3p · ต้องการ hour pillar · skip */
        solar_terms_birth: null,       /* 3p · ต้องการ time precise · skip */
      };
      return NextResponse.json(
        shapeChartPayload(sanitizeChartPayload(response), productPlan, chartCaps),
        { headers: NO_STORE_HEADERS }
      );
    }

    /* 4p path · เดิม · backward compat 100% (TS narrowed calc to BaziAnalysis4p จาก early return) */
    const birthDate = new Date(`${date}T${time}:00`);
    const adjustedYongshenEls = (calc.yongshen || []).map(y => y.element).filter(Boolean);
    const ext = buildChartExtensions(
      calc.pillars, new Date(), (gender as "M" | "F") || "M", birthDate, startAge!,
      calc.geJu.structure || null,
      calc.strength.percent,
      calc.yongshen[0]?.element || null,
      adjustedYongshenEls
    );
    const systemBDistribution = await attachSystemBElementWeights(ext, natal);

    /* G4 · QiMen destiny mini-card (async · cache + timeout + fail-open null) */
    const { buildQimenDestiny } = await import("@/lib/qimen-destiny");
    const qimenDestiny = await buildQimenDestiny(date, time, Number(longitude || 100.5018));

    /* 📜 อากง v3 · 24 節氣 ของปีเกิด · highlight jieqi ของเดือนเกิด (additive · fail-open null)
       ลำดับ source: (1) อากง v3 ถ้าปี 2020-2035 (2) DB ref_solar_terms ถ้าปี 1900-2100 */
    let solarTermsBirth: any = null;
    try {
      const { q, q1 } = await import("@/lib/db");
      const BRANCH_MAP_MAJ: Record<string, string> = { 立春:'寅',驚蟄:'卯',清明:'辰',立夏:'巳',芒種:'午',小暑:'未',立秋:'申',白露:'酉',寒露:'戌',立冬:'亥',大雪:'子',小寒:'丑' };
      const formatCst = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
      };

      let terms: Array<{ no: number; name: string; date: string; branch_starts?: string | null }> = [];
      let yearStemBranch = '', liChunCst = '', source = '';

      // (1) primary: อากง v3 (precise CST)
      const precise = await q1<{ data: { annual_tables: Record<string, any> } }>(
        `SELECT data FROM ref_akg_data WHERE key='v3_solar_precise_2020_2035'`
      );
      const annual = precise?.data?.annual_tables?.[String(yy)];
      if (annual) {
        terms = annual.terms;
        yearStemBranch = annual.year_stem_branch;
        liChunCst = annual.li_chun;
        source = 'อากง v3 · Purple Mountain Observatory';
      } else {
        // (2) fallback: DB ref_solar_terms (1900-2100)
        const dbRows = await q<{ chinese: string; beijing_datetime: Date; order_num: number }>(
          `SELECT chinese, beijing_datetime, order_num FROM ref_solar_terms WHERE year=$1 ORDER BY order_num`,
          [yy]
        );
        if (dbRows.length) {
          terms = dbRows.map(r => ({
            no: r.order_num,
            name: r.chinese,
            date: r.beijing_datetime ? formatCst(new Date(r.beijing_datetime)) : '',
            branch_starts: BRANCH_MAP_MAJ[r.chinese] || null,
          }));
          const li = dbRows.find(r => r.chinese === '立春');
          if (li?.beijing_datetime) liChunCst = formatCst(new Date(li.beijing_datetime));
          // year_stem_branch จาก calc (year pillar เกิด · ถ้าวันเกิดก่อน 立春 = ปีก่อน) — ใช้ pillarsZh.year
          yearStemBranch = calc.pillarsZh?.year || '';
          source = 'ref_solar_terms (DB · 1900-2100)';
        }
      }

      if (terms.length) {
        const birthMs = new Date(`${date}T${time}:00+07:00`).getTime();
        let monthJieqi: any = null, nextJieqi: any = null;
        // เรียงตาม datetime จริง · ไม่ใช่ order_num (เพราะ DB เก็บ #23/24 อาจอยู่ Jan ของปีก่อน)
        const termsMaj = terms.filter(t => t.no % 2 === 1)
          .map(t => ({ ...t, _ms: new Date(t.date.replace(' ', 'T') + ':00+08:00').getTime() }))
          .sort((a, b) => a._ms - b._ms);
        for (let i = 0; i < termsMaj.length; i++) {
          if (termsMaj[i]._ms <= birthMs) { monthJieqi = termsMaj[i]; nextJieqi = termsMaj[i+1] || null; }
          else break;
        }
        solarTermsBirth = {
          year: yy,
          year_stem_branch: yearStemBranch,
          li_chun_cst: liChunCst,
          terms,
          birth_month_jieqi: monthJieqi ? {
            zh: monthJieqi.name, date_cst: monthJieqi.date,
            branch_starts: monthJieqi.branch_starts || null,
          } : null,
          next_jieqi: nextJieqi ? { zh: nextJieqi.name, date_cst: nextJieqi.date } : null,
          source,
        };
      }
    } catch (e) {
      console.error('solar_terms_birth fetch failed:', e);
    }

    /* 📜 Yongshen v2 · wrapper-7 · อากง 15 พ.ค. 2026 (additive · ไม่กระทบ Voytek/anchors) */
    let yongshenV2: any = null;
    try {
      // @ts-ignore — runtime CJS module
      const w7 = await import("../../../../data/library/wrappers/7-yongshen-v2.js");
      const synth = (w7 as any).synthesizeYongshen || ((w7 as any).default && (w7 as any).default.synthesizeYongshen);
      if (synth) {
        const s = synth(natal);
        yongshenV2 = {
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
          explain_log: s.explain_log,
        };
      }
    } catch (e) {
      console.error("yongshen_v2 synth failed:", e);
    }

    /* 19 พ.ค. · Functional override · ใช้ rootedness (Functional Strength) จาก wrapper-7
     * แทน Raw count ใน buildHealthMapping + buildVoytekStrength
     * เหตุ: ตำราอากง · "ดูพลังจริง" ไม่ใช่ "นับ"
     * Aeaw: Raw 44%/56% สมดุล-อ่อน → Functional 23%/77% อ่อน (ตรงตำรา假從財) */
    try {
      // @ts-ignore — runtime CJS
      const w7 = await import("../../../../data/library/wrappers/7-yongshen-v2.js");
      const synth = (w7 as any).synthesizeYongshen || ((w7 as any).default && (w7 as any).default.synthesizeYongshen);
      if (synth) {
        const sFull = synth(natal);
        const rootedness = sFull?._details?.rootedness;
        if (rootedness) {
          /* Phase 17g · compute distribution_score (Plan C v6 strict · Codex APPROVED) */
          const distribution = systemBDistribution;
          /* DM strength Functional · Phase 17g · ใช้ distribution ถ้ามี */
          const { buildStrengthFunctional } = await import("@/lib/strength-functional");
          const fnStrength = buildStrengthFunctional(natal.day.stem, rootedness, distribution);
          (ext as any).voytek_strength = fnStrength;
          (ext as any).functional_strength = fnStrength;
          /* HK_DAYMASTER_STRENGTH_UNIFY_V1 (สเตป 5) · 4p · calc.strength(wrapper-6·เดียวกับ用神) */
          daymasterProfile = getDaymasterProfile(natal.day.stem, {
            level: calc.strength.level,
            percent: calc.strength.percent,
          });
          /* Health Functional · Phase 17g */
          const { buildHealthFunctional } = await import("@/lib/health-functional");
          const fnHealth = buildHealthFunctional(natal.day.stem, rootedness, fnStrength.supporting_pct, distribution);
          (ext as any).health_mapping = fnHealth;
          /* rootedness explain · Phase 17g · legacy v1 */
          try {
            const { buildRootednessExplain } = await import("@/lib/explain-rootedness");
            (ext as any).rootedness_explain = buildRootednessExplain(natal.day.stem, rootedness, distribution);
          } catch (e) {
            console.warn("[chart] rootedness_explain failed", e);
          }
          /* rootedness explain v2 · Phase 18 · 4 layers · ภาษาคน · 3 lang */
          try {
            if (distribution) {
              const { buildRootednessExplainV2 } = await import("@/lib/rootedness-explain-v2");
              (ext as any).rootedness_explain_v2 = buildRootednessExplainV2(natal.day.stem, distribution);
            }
          } catch (e) {
            console.warn("[chart] rootedness_explain_v2 failed", e);
          }
        }
      }
    } catch (e) {
      console.warn("[chart] functional override failed", e);
    }

    /* 18 พ.ค. · 拱·夾 (Carry Image) · sifu-grade classical · เพิ่มใหม่ */
    let carries: any[] = [];
    try {
      const { detectCarries } = await import("@/lib/chart-carry");
      const lpIdx: number = (ext as any).current_luck_idx ?? -1;
      const lpBranch: string | undefined = lpIdx >= 0 ? (ext as any).luck_pillars?.[lpIdx]?.branch : undefined;
      /* 18 พ.ค. · Codex flag #1 · ext exposes current_year_pillar (not annual_pillar_now) */
      const annualBranch: string | undefined = (ext as any).current_year_pillar?.branch;
      const yongshenEls = (yongshenV2?.primary_yongshen || []).concat(yongshenV2?.xishen || []);
      const jishenEls = yongshenV2?.jishen || [];
      carries = detectCarries(natal as any, {
        yongshenElements: yongshenEls,
        jishenElements: jishenEls,
        luckPillarBranch: lpBranch,
        annualBranch,
      });
    } catch (e) {
      console.error("chart-carry detect failed:", e);
    }

    const response = {
      input: { date, time, longitude, gender, birthTimeKnown: true },
      pillars: natal,
      pillarsZh: calc.pillarsZh,
      dayMaster: calc.dayMaster,
      day_master: calc.dayMaster,
      strength: calc.strength,
      geJu: calc.geJu,
      ge_ju: calc.geJu,
      yongshen: calc.yongshen,
      climate: calc.climate,
      lunar: calc.lunar,
      tst: calc.tst,
      analysis: {
        ge_ju: calc.geJu,
        useful_god: usefulGod,
        tiao_hou: tiaoHou,
        strength_yongshen: { strength: calc.strength, yongshenFinal: calc.yongshen, climate: { climate: calc.climate } },
        hs_hhs: hsHhs,
        matrix_summary: matrix.summary,
        element_counts: ext.element_counts,
        ten_gods_map: ext.ten_gods_map,
        qi_phases: ext.qi_phases,
        interactions: ext.interactions,
        punishments: ext.punishments,
        combinations: ext.combinations,
        jishen: ext.jishen,
        today_overlay: ext.today_overlay,
        luck_pillars: ext.luck_pillars,
        current_luck_idx: ext.current_luck_idx,
        /* G1 · §02 Joey Yap-style table */
        nayin: ext.nayin,
        kong_wang: ext.kong_wang,
        three_phases: ext.three_phases,
        special_stars: ext.special_stars,
        /* 18 พ.ค. · 拱·夾 carry image · sifu-grade · เปิดเมื่อต้องการ deep reading */
        carries,
        /* G4 · 4 BaZi natal sections */
        life_palace: ext.life_palace,
        palace_readings: ext.palace_readings,
        five_structure: ext.five_structure,
        personal_stars: ext.personal_stars,
        /* G4 · QiMen destiny mini-card */
        qimen_destiny: qimenDestiny,
        /* Voytek alignment · 4 bug fixes */
        stem_interactions: ext.stem_interactions,
        fan_yin_fu_yin: ext.fan_yin_fu_yin,
        current_year_pillar: ext.current_year_pillar,
        voytek_strength: ext.voytek_strength,
        functional_strength: (ext as any).functional_strength,
        /* Engine 1 · LP × natal + 天地合 + 流年 timeline */
        lp_natal_interactions: ext.lp_natal_interactions,
        tian_di_he: ext.tian_di_he,
        liu_nian_timeline: ext.liu_nian_timeline,
        luck_decade_drilldown: ext.luck_decade_drilldown,
        /* Engine 2 · Special chart + Spouse + Career + Health */
        special_chart: ext.special_chart,
        spouse_palace: ext.spouse_palace,
        career_industry: ext.career_industry,
        health_mapping: ext.health_mapping,
        /* 19 พ.ค. · ภาษาซินแสอธิบาย rootedness ของแต่ละธาตุ (legacy v1) */
        rootedness_explain: (ext as any).rootedness_explain,
        /* Phase 18 · rootedness explain v2 · 4 layers · ภาษาคน · 3 lang */
        rootedness_explain_v2: (ext as any).rootedness_explain_v2,
        /* Phase 17g · distribution engine output · debug/observability */
        element_distribution: (ext as any).element_distribution,
        daymaster_profile: attachDaymasterI18n(overrideNeedsForFollow(daymasterProfile, yongshenV2), yongshenV2),
      },
      /* 📜 Yongshen v2 (wrapper-7) · structure + disease + medicine + bridges · 15 พ.ค. */
      yongshen_v2: attachElementRoles(yongshenV2, natal.day.stem, calc.strength?.level || null),
      /* 📜 17 พ.ค. · 河洛理數 Heluo Astrology (Pre/Post + Annual + Monthly) */
      heluo_astrology: (() => {
        try {
          const { calcHeluo } = require("@/lib/heluo-astrology");
          return calcHeluo(natal, yy, new Date());
        } catch (e) { console.error('heluo calc failed:', e); return null; }
      })(),
      /* 📜 อากง v3 · 24 節氣 ของปีเกิด + jieqi ของเดือนเกิด · 16 พ.ค. */
      solar_terms_birth: solarTermsBirth,
    };
    return NextResponse.json(
      shapeChartPayload(sanitizeChartPayload(response), productPlan, chartCaps),
      { headers: NO_STORE_HEADERS }
    );
  } catch (e: unknown) {
    console.error("[chart] error:", e);  // 1 มิ.ย. · log เต็มฝั่ง server · ไม่คืน stack/message ดิบให้ client
    return NextResponse.json({ error: "internal error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
