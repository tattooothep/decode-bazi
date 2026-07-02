/**
 * GET /api/today?date=YYYY-MM-DD&dm=己 (legacy · DM stem only)
 * POST /api/today  body: { date, userChart:{year,month,day,hour}, yongshen?, jishen? }
 *   → ใช้ computeUserDayScore (Single Source of Truth) · 18 พ.ค. unify
 * Returns: today's pillar + Tongshu (黃曆) + verdict
 */
import { NextResponse } from "next/server";
import { computeDailyPersonalVerdict } from "@/lib/daily-personal-verdict";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const date: string = body.date || new Date().toISOString().slice(0, 10);
  const userChart = body.userChart;
  let yongshen: string[] | undefined = Array.isArray(body.yongshen) ? body.yongshen : undefined;
  let jishen:   string[] | undefined = Array.isArray(body.jishen)   ? body.jishen   : undefined;

  /* 18 พ.ค. · ถ้าไม่ส่ง yongshen + มี birth → calc ภายใน · ให้ score ตรง /calendar /network */
  const birthDate = body.birthDate;
  const birthTimeKnown = body.birthTimeKnown !== false;
  const birthTime = body.birthTime || '12:00';
  const birthLng  = parseFloat(body.birthLng ?? body.longitude ?? '100.5018');
  const gender = body.gender || body.birthGender || 'M';
  const dayBoundary = body.dayBoundary || body.day_boundary || '23:00';
  /* 18 พ.ค. · เพิ่ม userSummary 1 บรรทัด · สรุปดวงคุณให้ user อ่านง่าย
   * Codex flag #4 · ใช้ shared cache (yongshen-cache.ts) กัน double-call */
  let userSummary: any = null;
  if (!yongshen && birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    try {
      const { getYongshenSynth, extractFromSynth } = await import("@/lib/yongshen-cache");
        const wrapped = await getYongshenSynth(birthDate, birthTime, birthLng, { birthTimeKnown });
      if (wrapped) {
        const s = wrapped.synth;
        const calc = wrapped.calc;
        const ex = extractFromSynth(s);
        const toList = (v: any): string[] => {
          if (!v) return [];
          if (Array.isArray(v)) return v.map((x: any) => typeof x === 'string' ? x : x?.element).filter(Boolean);
          return [];
        };
        /* 24 พ.ค. · strict: 用神หลักเท่านั้น · ให้ score ตรง /calendar (commit 0f305c6 fix) · ไม่ดึง 喜神 มารวม */
        const primary = toList(s?.primary_yongshen);
        yongshen = primary.length ? primary : ex.yongshen;
        if (!jishen) jishen = ex.jishen;
        /* userSummary · ให้คนไทยเข้าใจดวงตัวเอง 1 บรรทัด */
        const EL_TH: Record<string,string> = {wood:"ไม้",fire:"ไฟ",earth:"ดิน",metal:"ทอง",water:"น้ำ"};
        const STEM_EL: Record<string,string> = {甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'};
        const dmStem = calc.pillars.day?.stem || '';
        const dmEl = STEM_EL[dmStem] || '';
        const xishen = toList(s?.xishen);
        /* Codex flag #3 · bridges dynamic · ใช้ bridge_element จริง · ไม่ hardcode ไม้ */
        const bridgeElements = ex.bridgeElements;
        const bridges_th = bridgeElements.map(e => ({ el: e, th: EL_TH[e] || e }));
        userSummary = {
          dm_stem: dmStem,
          dm_element: dmEl,
          dm_label_th: dmEl ? `${EL_TH[dmEl]} ${dmStem}` : dmStem,
          structure: s?.structure_label || null,
          primary: primary.map(e => ({ el: e, th: EL_TH[e] || e })),
          xishen:  xishen.map(e => ({ el: e, th: EL_TH[e] || e })),
          jishen:  (jishen || []).map(e => ({ el: e, th: EL_TH[e] || e, is_dominant: e === ex.dominantJishen })),
          dominant_jishen: ex.dominantJishen ? { el: ex.dominantJishen, th: EL_TH[ex.dominantJishen] } : null,
          bridges_th,
          confidence: s?.confidence || null,
          strategy: s?.strategy || null,
        };
      }
      if (!yongshen || !yongshen.length) {
        /* fallback · wrapper-6 top-3 */
        const { calcBazi } = await import("@/lib/bazi-calc");
        const calc = birthTimeKnown
          ? await calcBazi({ date: birthDate, time: birthTime, longitude: birthLng, gmtOffsetHours: 7, birthTimeKnown: true })
          : await calcBazi({ date: birthDate, longitude: birthLng, gmtOffsetHours: 7, birthTimeKnown: false });
        const top3 = (calc.yongshen || []).slice(0, 3);
        yongshen = Array.from(new Set(top3.map((y: any) => y.element).filter(Boolean)));
        const allEls = ['wood','fire','earth','metal','water'];
        if (!jishen) jishen = allEls.filter(e => !yongshen!.includes(e));
      }
    } catch (e) { console.warn('[today POST] yongshen-cache failed', e); }
  }

  /* GET-style URL → reuse GET logic · เรียก _buildTongshu + override verdict */
  const url = new URL(req.url);
  url.searchParams.set('date', date);
  if (userChart?.day?.stem) url.searchParams.set('dm', userChart.day.stem);
  const fakeReq = new Request(url.toString(), { method: 'GET' });
  const resp = await GET(fakeReq);
  const data = await resp.json();
  if (data && userChart?.day?.stem && userChart.day.branch && data.pillars?.day) {
    data.verdict = await computeDailyPersonalVerdict({
      date,
      userChart,
      dayPillar: data.pillars.day,
      yongshen,
      jishen,
      birthDate,
      birthTime,
      birthLng,
      birthTimeKnown,
      gender,
      dayBoundary,
    });
  }
  if (userSummary) data.userSummary = userSummary;
  return NextResponse.json(data);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const dm = url.searchParams.get("dm");
  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400 });

  try {
    // /api/today ใช้เวลา 12:00 ของวันนั้น เพื่อหา day pillar (ไม่จำเป็นต้อง TST · day pillar เปลี่ยนที่เที่ยงคืน)
    const tyme = await import("tyme4ts");
    const st = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0);
    const lh = st.getLunarHour();
    const ld = lh.getLunarDay();
    const ec = lh.getEightChar();

    const dayPillar = ec.getDay().getName();
    const monthPillar = ec.getMonth().getName();
    const yearPillar = ec.getYear().getName();

    /* 17 พ.ค. fix · filter yi/ji ตาม 12 day officer (协纪辨方书 ตำราอากง)
     * tyme4ts ส่ง raw · ต้องตัด 闭日 ไม่ให้มี 嫁娶/交易/立券 ฯลฯ */
    const OFFICER_FORBID_TODAY: Record<string, string[]> = {
      '建':['動土','破土','安葬','修造','上樑','上梁'],
      '滿':['服藥','服药','治病','求醫','求医'],'满':['服藥','服药','治病','求醫','求医'],
      '平':['修造','動土','栽種','栽种','取土'],
      '定':['詞訟','词讼','訴訟','诉讼','出行'],
      '執':['移徙','遠行','远行','出行','開市','开市'],'执':['移徙','遠行','远行','出行','開市','开市'],
      '破':['嫁娶','安葬','上樑','上梁','開市','开市','立券','交易','動土','移徙','入宅','安床'],
      '危':['登山','行船','乘船','遠行','远行'],
      '收':['出行','遠行','远行','開市','开市','安葬'],
      '開':['安葬','破土','行喪','行丧'],'开':['安葬','破土','行喪','行丧'],
      '閉':['嫁娶','交易','立券','立卷','開市','开市','開光','开光','上樑','上梁','栽種','栽种','遠行','远行','出行','安門','安门','修造','動土'],
      '闭':['嫁娶','交易','立券','立卷','開市','开市','開光','开光','上樑','上梁','栽種','栽种','遠行','远行','出行','安門','安门','修造','動土'],
    };
    const OFFICER_FAVOR_TODAY: Record<string, string[]> = {
      '閉':['補垣','补垣','塞穴','築堤','筑堤','畋獵','畋猎','取漁','取渔'],
      '闭':['補垣','补垣','塞穴','築堤','筑堤','畋獵','畋猎','取漁','取渔'],
    };
    const officerName = ld.getDuty().getName();
    const forbidSet = new Set(OFFICER_FORBID_TODAY[officerName] || []);
    const favorSet  = new Set(OFFICER_FAVOR_TODAY[officerName]  || []);
    const rawYi = ld.getRecommends().map((x: { getName(): string }) => x.getName());
    const rawJi = ld.getAvoids().map((x: { getName(): string }) => x.getName());
    const finalYi = [...new Set([...rawYi.filter(x => !forbidSet.has(x)), ...rawJi.filter(x => favorSet.has(x))])].slice(0, 8);
    const finalJi = [...new Set([...rawJi.filter(x => !favorSet.has(x)), ...rawYi.filter(x => forbidSet.has(x))])].slice(0, 8);

    const tongshu = {
      lunar: ld.toString(),
      day_officer: officerName,
      twelve_star: ld.getTwelveStar().getName(),
      nine_star: ld.getNineStar().getName(),
      twentyeight_star: ld.getTwentyEightStar().getName(),
      yi: finalYi,
      ji: finalJi,
      gods: ld.getGods().slice(0, 12).map((g: { getName(): string }) => g.getName()),
    };

    let verdict = null;
    if (dm) {
      // Score logic — simple alignment
      const w4 = await import("../../../../data/library/wrappers/4-useful-god.js");
      const ug = w4.getUsefulGod(dm) as { summary?: { friendlyElements: string[] } };
      const dayStem = dayPillar[0];
      const dayElement = ({甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'} as Record<string,string>)[dayStem];
      const friendly = ug.summary?.friendlyElements || [];
      const aligned = friendly.includes(dayElement);
      const score = aligned ? 78 : 52;
      verdict = {
        score,
        label: score >= 80 ? "EXCELLENT" : score >= 65 ? "GOOD" : score >= 50 ? "OK" : score >= 35 ? "CAUTION" : "AVOID",
        action_mode: score >= 80 ? "L1" : score >= 65 ? "L2" : score >= 50 ? "L3" : score >= 35 ? "L4" : "L5",
        aligned,
        day_element: dayElement,
        friendly_elements: friendly,
      };
    }

    /* 📜 64 卦 hexagram ของวัน · Mei Hua Yi Shu style · 15 พ.ค. 2026 */
    let hex: any = null;
    try {
      const yh = await import("@/lib/year-hexagram");
      const dayStem = dayPillar[0];
      const dayBranch = dayPillar[1];
      const h = yh.hexagramForStemBranch(dayStem, dayBranch);
      if (h?.hex) {
        hex = {
          num: h.num,
          zh: h.hex.zh, th: h.hex.th, en: h.hex.en,
          symbol: h.hex.symbol,
          upper_zh: h.upper.zh, upper_th: h.upper.th,
          lower_zh: h.lower.zh, lower_th: h.lower.th,
          changing_line: h.changing_line,
        };
      }
    } catch (_) {}

    return NextResponse.json({
      date,
      pillars: { year: yearPillar, month: monthPillar, day: dayPillar },
      tongshu,
      verdict,
      hex,
    });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[today] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
