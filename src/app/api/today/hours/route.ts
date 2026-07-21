/**
 * POST /api/today/hours
 *
 * รับ: { date: 'YYYY-MM-DD', profileId?: string }
 * คืน: { hours: [{label, branch, range, element, quality, isNow}] }
 *
 * 12 ชั่วยาม + quality score เทียบ DM จาก profile ที่ตรวจ ownership แล้ว
 */
import { NextResponse } from "next/server";
import { buildLiuShi, type ElementEN } from "@/lib/bazi-liushi";
import { entitlementDenied } from "@/lib/product-entitlement";
import { withinDayWindow } from "@/lib/product-date-gate";
import { currentRequestProductAccess, nextRequiredPlan } from "@/lib/product-request-access";
import { loadCalendarProfileContext } from "@/lib/calendar-profile-context";

const BRANCH_ELEMENT: Record<string, "wood"|"fire"|"earth"|"metal"|"water"> = {
  子:"water", 丑:"earth", 寅:"wood", 卯:"wood", 辰:"earth", 巳:"fire",
  午:"fire", 未:"earth", 申:"metal", 酉:"metal", 戌:"earth", 亥:"water",
};
const STEM_ELEMENT: Record<string, "wood"|"fire"|"earth"|"metal"|"water"> = {
  甲:"wood",乙:"wood",丙:"fire",丁:"fire",戊:"earth",己:"earth",
  庚:"metal",辛:"metal",壬:"water",癸:"water",
};
const ELEMENT_CONTROLS: Record<string,string> = {wood:"earth",earth:"water",water:"fire",fire:"metal",metal:"wood"};
const ELEMENT_PRODUCES: Record<string,string> = {wood:"fire",fire:"earth",earth:"metal",metal:"water",water:"wood"};

/* 六沖 · ตำราคลาสสิก · กิ่งปะทะกัน (อากงสอน) */
const BRANCH_CLASH: Record<string, string> = {
  子:"午", 午:"子",
  丑:"未", 未:"丑",
  寅:"申", 申:"寅",
  卯:"酉", 酉:"卯",
  辰:"戌", 戌:"辰",
  巳:"亥", 亥:"巳",
};
/* 六害 · กิ่งทำร้าย */
/* 17 พ.ค. · 六合 (combine) + 自刑 (self-punish) · ตำราอากง */
const BRANCH_HE: Record<string, string> = {
  '子':'丑','丑':'子','寅':'亥','亥':'寅','卯':'戌','戌':'卯',
  '辰':'酉','酉':'辰','巳':'申','申':'巳','午':'未','未':'午',
};
const SELF_PUNISH = new Set(['辰','午','酉','亥']);
const BRANCH_HARM: Record<string, string> = {
  子:"未", 未:"子",
  丑:"午", 午:"丑",
  寅:"巳", 巳:"寅",
  卯:"辰", 辰:"卯",
  申:"亥", 亥:"申",
  酉:"戌", 戌:"酉",
};

/* 12 ชั่วยาม · range strings */
const HOUR_DEF: { branch: string; range: string; label_th: string }[] = [
  { branch:"子", range:"23:00-01:00", label_th:"ชวด · ดึก" },
  { branch:"丑", range:"01:00-03:00", label_th:"ฉลู · ดึกมาก" },
  { branch:"寅", range:"03:00-05:00", label_th:"ขาล · ก่อนรุ่ง" },
  { branch:"卯", range:"05:00-07:00", label_th:"เถาะ · รุ่งเช้า" },
  { branch:"辰", range:"07:00-09:00", label_th:"มะโรง · เช้า" },
  { branch:"巳", range:"09:00-11:00", label_th:"มะเส็ง · สาย" },
  { branch:"午", range:"11:00-13:00", label_th:"มะเมีย · เที่ยง" },
  { branch:"未", range:"13:00-15:00", label_th:"มะแม · บ่าย" },
  { branch:"申", range:"15:00-17:00", label_th:"วอก · บ่าย-เย็น" },
  { branch:"酉", range:"17:00-19:00", label_th:"ระกา · เย็น" },
  { branch:"戌", range:"19:00-21:00", label_th:"จอ · ค่ำ" },
  { branch:"亥", range:"21:00-23:00", label_th:"กุน · ดึก-ต้น" },
];

/* Day-stem + hour-branch → hour stem (五虎遁) */
const FIVE_TIGERS_START: Record<string, string> = {
  甲:"甲", 己:"甲", 乙:"丙", 庚:"丙", 丙:"戊",
  辛:"戊", 丁:"庚", 壬:"庚", 戊:"壬", 癸:"壬",
};
const STEMS_ORDER = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES_ORDER = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
function hourStemOf(dayStem: string, hourBranch: string): string {
  const start = FIVE_TIGERS_START[dayStem];
  if (!start) return "甲";
  const si = STEMS_ORDER.indexOf(start);
  const bi = BRANCHES_ORDER.indexOf(hourBranch);
  return STEMS_ORDER[(si + bi) % 10];
}

/* คุณภาพชั่วยาม · เทียบกับ DM (4 ระดับ)
 * 18 พ.ค. · เพิ่ม yongshen/jishen layer (อาเจ๊กฮ้งสอน):
 *   ถ้า hourEl อยู่ใน yongshen → upgrade · jishen → downgrade
 *   เลิกใช้ rule "output = good" แบบ blanket · ตำราอาเจ๊กฮ้ง output ของ DM อ่อน = drain = bad */
function qualityFor(dmEl: string, hourEl: string, yongshen?: string[], jishen?: string[], dominantJishen?: string): "best"|"good"|"ok"|"bad" {
  if (!dmEl) return "ok";
  /* Layer 1: yongshen / jishen ตัดสินก่อน (ของช่วย·ของแสลง ตามดวงเฉพาะตัว) */
  if (yongshen && yongshen.includes(hourEl)) {
    if (ELEMENT_PRODUCES[hourEl] === dmEl) return "best";   /* yongshen + resource = สุดยอด */
    return "good";                                           /* yongshen ทั่วไป */
  }
  if (jishen && jishen.includes(hourEl)) {
    if (ELEMENT_CONTROLS[hourEl] === dmEl) return "bad";    /* jishen + power = แย่สุด */
    if (dominantJishen && hourEl === dominantJishen) return "bad"; /* 18 พ.ค. #3 · เติมโรคที่ผังท่วมอยู่แล้ว */
    if (ELEMENT_PRODUCES[dmEl] === hourEl) return "ok";     /* jishen + output = drain แต่ไม่ถึง bad */
    return "ok";                                             /* jishen ทั่วไป = ระวัง (ไม่ใช่ bad เต็ม) */
  }
  /* Layer 2: 5-element fallback (ถ้าไม่มี yongshen data) */
  if (hourEl === dmEl) return "good";                        /* peer */
  if (ELEMENT_PRODUCES[hourEl] === dmEl) return "best";      /* resource */
  if (ELEMENT_PRODUCES[dmEl] === hourEl) return "ok";        /* output · neutral · ไม่ใช่ good อัตโนมัติ */
  if (ELEMENT_CONTROLS[dmEl] === hourEl) return "ok";        /* wealth */
  if (ELEMENT_CONTROLS[hourEl] === dmEl) return "bad";       /* power · attacks DM */
  return "ok";
}

function currentHourBranch(date: Date): string {
  const h = date.getHours();
  /* 23:00-00:59 = 子 · 01:00-02:59 = 丑 · ... */
  const idx = Math.floor((h + 1) / 2) % 12;
  return BRANCHES_ORDER[idx];
}

/* 18 พ.ค. · A · TST NOW · Codex flag · default Bangkok 100.5018° E
 * คำนวณ wall-clock + TST shift → กิ่งชั่วยามที่ถูกต้องตามตำราจริง */
async function currentHourBranchTST(date: Date, longitude: number = 100.5018): Promise<string> {
  try {
    const { applyTST } = await import("@/lib/tyme-tst");
    const tst = applyTST({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      longitude,
      gmtOffsetHours: 7,
    });
    const h = tst.appliedHour;
    const idx = Math.floor((h + 1) / 2) % 12;
    return BRANCHES_ORDER[idx];
  } catch {
    return currentHourBranch(date);
  }
}

async function _calcYongshenFromBirth(birthDate?: string, birthTime?: string, birthLng?: number, birthTimeKnown = true): Promise<{yongshen: string[]; jishen: string[]; dominantJishen: string | null}> {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { yongshen: [], jishen: [], dominantJishen: null };
  /* 18 พ.ค. · Codex flag #4 · ใช้ shared cache · กัน double-call wrapper-7 */
  const { getYongshenSynth, extractFromSynth } = await import("@/lib/yongshen-cache");
  const wrapped = await getYongshenSynth(birthDate, birthTime, birthLng, { birthTimeKnown });
  if (!wrapped) return { yongshen: [], jishen: [], dominantJishen: null };
  const { yongshen, jishen, dominantJishen } = extractFromSynth(wrapped.synth);
  /* fallback · wrapper-6 top-3 ถ้า wrapper-7 ไม่มี yongshen */
  if (!yongshen.length) {
    const top3 = ((wrapped.calc?.yongshen as any[]) || []).slice(0, 3);
    const ys2: string[] = Array.from(new Set(top3.map((y: any) => String(y.element || '')).filter(Boolean)));
    return { yongshen: ys2, jishen, dominantJishen };
  }
  return { yongshen, jishen, dominantJishen };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const date: string = body.date || new Date().toISOString().slice(0, 10);
  const product = await currentRequestProductAccess(req);
  const requestedProfileId = String(body.profileId || "").replace(/^p_/, "").trim();
  if (requestedProfileId && (!product.session?.userId || !product.session?.orgId)) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }
  const profileContext = requestedProfileId && product.session?.userId && product.session?.orgId
    ? await loadCalendarProfileContext({
        userId: product.session.userId,
        orgId: product.session.orgId,
        profileId: requestedProfileId,
      })
    : null;
  if (requestedProfileId && !profileContext) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }
  // Personal timing inputs must come from the owned server profile only.
  const userChart = profileContext?.pillars || null;
  const dmStem: string | undefined = userChart?.day?.stem;
  const dmEl = dmStem ? STEM_ELEMENT[dmStem] : "";
  const userBranch: string | undefined = userChart?.day?.branch;
  /* 18 พ.ค. · รับ yongshen/jishen หรือคำนวณภายในจาก birth · อาเจ๊กฮ้งสอน */
  let yongshen: string[] = [];
  let jishen:   string[] = [];
  let dominantJishen: string | null = null;
  const trustedBirthDate = profileContext?.birthDate || undefined;
  const trustedBirthTime = profileContext?.birthTime || undefined;
  const trustedBirthLng = profileContext?.birthLng ?? undefined;
  const trustedBirthTimeKnown = profileContext?.birthTimeKnown ?? false;
  if (!yongshen.length && trustedBirthDate) {
    const r = await _calcYongshenFromBirth(trustedBirthDate, trustedBirthTime, trustedBirthLng, trustedBirthTimeKnown);
    yongshen = r.yongshen; jishen = r.jishen; dominantJishen = r.dominantJishen;
  }

  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400 });
  const todayCaps = product.pages.today;
  if (!withinDayWindow(date, todayCaps.day_window)) {
    return NextResponse.json(
      entitlementDenied("today_date_window", { plan: product.plan, max_days: todayCaps.day_window }),
      { status: 403 }
    );
  }

  /* === คำนวณกิ่งวัน (วันนี้) เพื่อ detect 六沖 · อากงสอน === */
  let dayBranch = "";
  let dayStem = "";
  try {
    const tyme = await import("tyme4ts");
    const st = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0);
    const dayPillar = st.getLunarHour().getEightChar().getDay().getName();
    dayStem = dayPillar[0];
    dayBranch = dayPillar[1];
  } catch (_) {}

  /* current hour (only mark isNow if date is today · Bangkok local time)
   * Fix 17 พ.ค.: เดิมใช้ toISOString() UTC → ช่วง 17:00-23:59 BKK ตก UTC วันก่อน → isToday=false ตลอด
   * แก้: ใช้ local date components ของ server (server tz=Asia/Bangkok) */
  const now = new Date();
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const isToday = localDateStr === date;
  /* 18 พ.ค. · A · ใช้ TST · ใกล้ขอบเปลี่ยนชั่วยามแม่นกว่า · longitude จาก birthLng ถ้ามี */
  const nowLng = typeof trustedBirthLng === 'number' ? trustedBirthLng : 100.5018;
  const nowBranch = isToday ? await currentHourBranchTST(now, nowLng) : "";

  const QUAL_TH: Record<string, string> = { best:"ดีมาก", good:"ดี", ok:"กลาง", bad:"ห้าม" };
  const QUAL_EN: Record<string, string> = { best:"best", good:"good", ok:"neutral", bad:"avoid" };
  const QUAL_ZH: Record<string, string> = { best:"大吉", good:"吉", ok:"中", bad:"忌" };
  const hours = HOUR_DEF.map(h => {
    const hourEl = BRANCH_ELEMENT[h.branch];
    let quality = qualityFor(dmEl, hourEl, yongshen, jishen, dominantJishen || undefined);
    /* ตำราคลาสสิก · override: 沖 = ห้าม (อากงสอน) */
    const reasons: string[] = [];
    if (dayBranch && BRANCH_CLASH[dayBranch] === h.branch) {
      quality = "bad";
      reasons.push(`沖${dayBranch} · ปะทะกิ่งวัน`);
    }
    if (userBranch && BRANCH_CLASH[userBranch] === h.branch) {
      quality = "bad";
      reasons.push(`沖${userBranch} · ปะทะกิ่งวันเกิด`);
    }
    if (dayBranch && BRANCH_HARM[dayBranch] === h.branch && quality !== "bad") {
      if (quality === "best") quality = "good";
      else if (quality === "good") quality = "ok";
      else quality = "ok";
      reasons.push(`害${dayBranch} · ทำร้ายกิ่งวัน`);
    }
    /* 17 พ.ค. · 六合 day·hour = boost (ตำราอากง)
     * 18 พ.ค. · Codex flag #2 · ห้าม boost ถ้า hour element เป็น jishen
     * เหตุ: ของแสลงไม่ควรกลายเป็น "ดี" เพราะ harmony · ตำราจริงถือ harmony เป็นแค่ลดทอน clash */
    if (dayBranch && BRANCH_HE[dayBranch] === h.branch) {
      const hourIsJishen = jishen && jishen.includes(hourEl);
      if (!hourIsJishen) {
        if (quality === "ok") quality = "good";
        else if (quality === "good") quality = "best";
        reasons.push(`合${dayBranch} · ผสานกิ่งวัน`);
      } else {
        reasons.push(`合${dayBranch} · ผสานแต่เป็นของแสลง · ไม่ boost`);
      }
    }
    /* 17 พ.ค. · 自刑 (辰·午·酉·亥) day=hour = caution */
    if (dayBranch && SELF_PUNISH.has(dayBranch) && dayBranch === h.branch) {
      if (quality === "best") quality = "ok";
      else if (quality === "good") quality = "ok";
      else if (quality === "ok") quality = "bad";
      reasons.push(`${dayBranch}自刑 · ทำร้ายตัวเอง`);
    }
    /* 18 พ.ค. · #1 · reason ภาษาคน 3 ภาษา · อาม่าอากงสั่งให้คนไทยอ่านง่าย + กฎ session 3 lang */
    const EL_TH: Record<string,string> = {wood:"ไม้",fire:"ไฟ",earth:"ดิน",metal:"ทอง",water:"น้ำ"};
    const EL_EN: Record<string,string> = {wood:"Wood",fire:"Fire",earth:"Earth",metal:"Metal",water:"Water"};
    const EL_ZH: Record<string,string> = {wood:"木",fire:"火",earth:"土",metal:"金",water:"水"};
    const elTH = EL_TH[hourEl] || hourEl;
    const elEN = EL_EN[hourEl] || hourEl;
    const elZH = EL_ZH[hourEl] || hourEl;
    let reason_th = "", reason_en = "", reason_zh = "";
    if (yongshen.includes(hourEl) && ELEMENT_PRODUCES[hourEl] === dmEl) {
      reason_th = `${elTH}เกื้อกูล + เสริมตัวคุณ · ของช่วยอันดับ ๑`;
      reason_en = `${elEN} nourishes + supports you · primary yongshen`;
      reason_zh = `${elZH}生身 + 助身 · 用神之首`;
    } else if (yongshen.includes(hourEl)) {
      reason_th = `${elTH}เป็นของช่วยของคุณ`;
      reason_en = `${elEN} is a yongshen for you`;
      reason_zh = `${elZH}為您之用神`;
    } else if (jishen.includes(hourEl) && hourEl === dominantJishen) {
      reason_th = `${elTH}คือของแสลงตัวเอก · เติมโรคในผังคุณ`;
      reason_en = `${elEN} is your primary jishen · feeds chart's disease`;
      reason_zh = `${elZH}為主忌神 · 加重命局之病`;
    } else if (jishen.includes(hourEl) && ELEMENT_CONTROLS[hourEl] === dmEl) {
      reason_th = `${elTH}กดตัวคุณตรงๆ · ระวัง`;
      reason_en = `${elEN} directly attacks DM · caution`;
      reason_zh = `${elZH}直剋日主 · 慎`;
    } else if (jishen.includes(hourEl)) {
      reason_th = `${elTH}เป็นของแสลงทั่วไป · ระวังเล็กน้อย`;
      reason_en = `${elEN} is a general jishen · minor caution`;
      reason_zh = `${elZH}為一般忌神 · 略慎`;
    } else if (hourEl === dmEl) {
      reason_th = `${elTH}เป็นเพื่อนคุณ · เสริมพลัง`;
      reason_en = `${elEN} is your peer · adds energy`;
      reason_zh = `${elZH}為比劫 · 助力`;
    } else if (ELEMENT_PRODUCES[hourEl] === dmEl) {
      reason_th = `${elTH}สร้างพลังให้คุณ`;
      reason_en = `${elEN} generates energy for you`;
      reason_zh = `${elZH}生身`;
    } else if (ELEMENT_CONTROLS[dmEl] === hourEl) {
      reason_th = `${elTH}คือทรัพย์ของคุณ · ทำได้แต่อย่าหนัก`;
      reason_en = `${elEN} is wealth · doable but not heavy`;
      reason_zh = `${elZH}為財 · 可行但勿過`;
    } else if (ELEMENT_CONTROLS[hourEl] === dmEl) {
      reason_th = `${elTH}กดตัวคุณ · ระวัง`;
      reason_en = `${elEN} controls DM · caution`;
      reason_zh = `${elZH}剋身 · 慎`;
    } else {
      reason_th = `${elTH}ทั่วไป · ใช้ได้ปกติ`;
      reason_en = `${elEN} neutral · usable`;
      reason_zh = `${elZH}中性 · 可用`;
    }
    /* override reasons · 3 ภาษา · Codex flag #2 */
    if (reasons.length) {
      const mkOv = (r: string, lang: 'th'|'en'|'zh') => {
        const TX: Record<string, Record<string,string>> = {
          th:{ birth:'ปะทะวันเกิด · ห้ามทำเรื่องสำคัญ', day:'ปะทะวันนี้ · ห้ามทำเรื่องสำคัญ', noboost:'จับคู่กับวัน · แต่เป็นของแสลง ไม่ดันขึ้น', he:'จับคู่กับวัน · ลื่นไหล', harm:'เบียดวัน · ลดทอนนิดหน่อย', self:'ซ้ำตัวเอง · ระวังจิตใจ' },
          en:{ birth:'Clash with birth · avoid important', day:'Clash with today · avoid important', noboost:'Combines but jishen · no boost', he:'Combines with day · smooth', harm:'Harm with day · slight reduction', self:'Self-punish · watch mind' },
          zh:{ birth:'沖年支(命) · 慎重大事', day:'沖日支(時) · 慎重大事', noboost:'六合但為忌 · 不增益', he:'六合 · 順', harm:'相害 · 略損', self:'自刑 · 慎心緒' },
        };
        const t = TX[lang];
        if (r.includes('ปะทะกิ่งวันเกิด')) return t.birth;
        if (r.includes('ปะทะกิ่งวัน'))     return t.day;
        if (r.includes('ไม่ boost'))       return t.noboost;
        if (r.includes('ผสาน'))            return t.he;
        if (r.includes('害'))              return t.harm;
        if (r.includes('自刑'))            return t.self;
        return r;
      };
      reason_th = `${reason_th} · ${reasons.map(r => mkOv(r,'th')).join(' · ')}`;
      reason_en = `${reason_en} · ${reasons.map(r => mkOv(r,'en')).join(' · ')}`;
      reason_zh = `${reason_zh} · ${reasons.map(r => mkOv(r,'zh')).join(' · ')}`;
    }
    return {
      branch: h.branch,
      range: h.range,
      label: QUAL_TH[quality],           /* ป้ายสั้นสำหรับ grid */
      label_en: QUAL_EN[quality],
      label_zh: QUAL_ZH[quality],
      name_th: h.label_th,              /* ชื่อเต็ม ราศี/ช่วงเวลา */
      element: hourEl,
      stem: dayStem ? hourStemOf(dayStem, h.branch) : (dmStem ? hourStemOf(dmStem, h.branch) : null), /* 18 พ.ค. · B · 五鼠遁 ใช้ dayStem ของวันนี้ ไม่ใช่ natal DM */
      quality,
      clash_reasons: reasons,            /* อธิบายตำรา */
      reason_th,                          /* 18 พ.ค. · ภาษาคนไทยอ่านง่าย */
      reason_en,                          /* PR2 D · EN */
      reason_zh,                          /* PR2 D · ZH */
      isNow: h.branch === nowBranch,
    };
  });

  /* B · เวลาทอง · best window + avoid window
   * หาช่วงต่อเนื่องของ best/good และ bad
   * range "23:00-01:00" → start=23, end=1 (next day) */
  function rngStart(r: string): number { return parseInt(r.split("-")[0].split(":")[0], 10); }
  function rngEnd(r: string): number { return parseInt(r.split("-")[1].split(":")[0], 10); }

  /* R520 · calm/golden/avoid window = ช่วง "ต่อเนื่องจริง" ยาวสุดของ 12 ยาม
   * 12 ยามเรียงเป็น "วง" 24 ชม. (子 23:00 → 亥 21:00-23:00) · 亥 ต่อ 子 ข้ามเที่ยงคืนได้
   * เดิม (r519) สแกนเป็นเส้นตรง → ไม่ต่อ 亥→子 · ช่วงที่คร่อมเที่ยงคืนถูกตัด/สั้นผิด
   *   เช่น 辰-day: ยามสงบจริง 21:00-07:00 (亥子丑寅卯) แต่เดิมรายงาน 23:00-07:00
   * แก้: หา run ต่อเนื่องยาวสุดแบบวงกลม + ธง crosses_midnight ให้สื่อ wrap ชัด
   *   (ค่า start/end เดิมยังคงรูปเดิม HH:00 เพื่อ backward-compat กับ passthrough ในแอพ) */
  function findLongestRun(predicate: (q: string) => boolean): { start: string; end: string; crosses_midnight: boolean } | null {
    const n = hours.length;                                   // 12
    const match = hours.map(h => predicate(h.quality));
    const count = match.filter(Boolean).length;
    if (count === 0) return null;
    if (count === n) {
      /* ทุกยามเข้าเงื่อนไข = ต่อเนื่องทั้งวัน (23:00→23:00 รอบวง) */
      const s = String(rngStart(hours[0].range)).padStart(2,"0") + ":00";
      return { start: s, end: s, crosses_midnight: true };
    }
    /* สแกน 2 รอบ (วงกลม) หา run ต่อเนื่องยาวสุด · reset เมื่อเจอยามที่ไม่เข้า */
    let bestLen = 0, bestStart = -1, curLen = 0, curStart = -1;
    for (let i = 0; i < 2 * n; i++) {
      const idx = i % n;
      if (match[idx]) {
        if (curLen === 0) curStart = idx;
        curLen++;
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
      } else {
        curLen = 0;
      }
      if (curLen === n) break;                                // กันเผื่อ (count<n จึงไม่ถึง)
    }
    if (bestLen === 0 || bestStart < 0) return null;
    const endIdx = (bestStart + bestLen - 1) % n;
    /* คร่อมเที่ยงคืน = run เริ่มที่ยาม子(23:00, index 0) หรือ run พันข้ามปลาย array (亥→子) */
    const crosses_midnight = bestStart === 0 || bestStart + bestLen > n;
    return {
      start: String(rngStart(hours[bestStart].range)).padStart(2,"0") + ":00",
      end:   String(rngEnd(hours[endIdx].range)).padStart(2,"0") + ":00",
      crosses_midnight,
    };
  }

  const golden_window = findLongestRun(q => q === "best" || q === "good");
  const avoid_window  = findLongestRun(q => q === "bad");
  const calm_window   = findLongestRun(q => q === "ok");

  /* 流時 deep (30 พ.ค.) — เทียบยาม × ทุกเสาในดวง + chain 大運/流年/流月 + 神煞
   * ทำงานเมื่อมี natal 4 เสาครบ (userChart.year/month/day/hour) · ไม่ครบ → liushi=null (hours เดิมยังทำงาน) */
  let liushi: ReturnType<typeof buildLiuShi> | null = null;
  try {
    const np = {
      year: userChart?.year?.stem && userChart?.year?.branch ? { stem: userChart.year.stem, branch: userChart.year.branch } : null,
      month: userChart?.month?.stem && userChart?.month?.branch ? { stem: userChart.month.stem, branch: userChart.month.branch } : null,
      day: userChart?.day?.stem && userChart?.day?.branch ? { stem: userChart.day.stem, branch: userChart.day.branch } : null,
      hour: userChart?.hour?.stem && userChart?.hour?.branch ? { stem: userChart.hour.stem, branch: userChart.hour.branch } : null,
    };
    if (dmStem && (np.year || np.month || np.hour)) {
      liushi = buildLiuShi({
        natalPillars: np,
        dmStem,
        todayDayStem: dayStem || dmStem,
        todayDayBranch: dayBranch,
        luckBranch: typeof body.luckBranch === "string" ? body.luckBranch : null,
        yearBranch: typeof body.flowYearBranch === "string" ? body.flowYearBranch : null,
        monthBranch: typeof body.flowMonthBranch === "string" ? body.flowMonthBranch : null,
        yongshen: yongshen as ElementEN[],
        jishen: jishen as ElementEN[],
        nowBranch,
      });
    }
  } catch (_) { liushi = null; }

  const detailedLimit = Math.max(0, Math.min(hours.length, todayCaps.detailed_hours));
  const detailedIndexes = new Set<number>();
  const currentIndex = hours.findIndex((hour) => hour.isNow);
  if (product.plan === "free" && currentIndex >= 0) {
    detailedIndexes.add(currentIndex);
    if (detailedLimit > 1) detailedIndexes.add((currentIndex + 1) % hours.length);
  }
  const qualityRank: Record<string, number> = { best: 4, good: 3, ok: 2, bad: 1 };
  [...hours.keys()]
    .sort((a, b) => (qualityRank[hours[b].quality] || 0) - (qualityRank[hours[a].quality] || 0) || a - b)
    .forEach((index) => {
      if (detailedIndexes.size < detailedLimit) detailedIndexes.add(index);
    });
  const requiredPlan = nextRequiredPlan(product.plan);
  const entitledHours = hours.map((hour, index) => {
    if (detailedIndexes.has(index)) return { ...hour, locked: false };
    return {
      branch: hour.branch,
      range: hour.range,
      name_th: hour.name_th,
      isNow: hour.isNow,
      locked: true,
      required_plan: requiredPlan,
    };
  });
  const fullHourAccess = detailedLimit >= hours.length;

  return NextResponse.json({
    date,
    profile_context: profileContext ? {
      profileId: profileContext.profileId,
      userId: profileContext.userId,
      isSelf: profileContext.isSelf,
      source: profileContext.source,
      birthTimeKnown: profileContext.birthTimeKnown,
    } : null,
    day_pillar: dayStem + dayBranch,
    day_branch: dayBranch,
    clash_branch: dayBranch ? BRANCH_CLASH[dayBranch] : null,
    user_branch: userBranch || null,
    yongshen, jishen,
    hours: entitledHours,
    golden_window: fullHourAccess ? golden_window : null,
    avoid_window: fullHourAccess ? avoid_window : null,
    calm_window: fullHourAccess ? calm_window : null,
    liushi: product.plan === "master" ? liushi : null,
    entitlement: {
      plan: product.plan,
      detailed_hours: detailedLimit,
      total_hours: hours.length,
      technical: product.plan === "master",
    },
  });
}
