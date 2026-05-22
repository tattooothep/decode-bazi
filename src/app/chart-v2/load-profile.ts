/**
 * Load real profile from DB + run engine wrappers + return data shape ที่ chart-v2 ใช้
 * shape ตรงกับ ./data.ts เดิม (drop-in replacement)
 */
import { q1 } from "@/lib/db";
import type { ElementCode } from "./data";

type Pillar = { stem: string; branch: string };
type ProfileRow = {
  id: string;
  name: string;
  birth_datetime: string;
  birth_time_known?: boolean;
  birth_location_name?: string;
  birth_lat?: string;
  birth_lng?: string;
  day_master?: string;
  day_master_strength?: string;
  yongshen?: { top3?: { stem: string; element: string }[]; climate?: string };
  bazi_pillars?: { pillars?: { year?: Pillar; month?: Pillar; day?: Pillar; hour?: Pillar | null }; ge_ju?: string };
  gender?: string;
};

const STEM_ELEMENT: Record<string, ElementCode> = {
  甲:'Wood',乙:'Wood',丙:'Fire',丁:'Fire',戊:'Earth',己:'Earth',庚:'Metal',辛:'Metal',壬:'Water',癸:'Water'
};
const BRANCH_ELEMENT: Record<string, ElementCode> = {
  子:'Water',丑:'Earth',寅:'Wood',卯:'Wood',辰:'Earth',巳:'Fire',午:'Fire',未:'Earth',申:'Metal',酉:'Metal',戌:'Earth',亥:'Water'
};
const HIDDEN: Record<string, string[]> = {
  子:['癸'],丑:['己','癸','辛'],寅:['甲','丙','戊'],卯:['乙'],
  辰:['戊','乙','癸'],巳:['丙','戊','庚'],午:['丁','己'],未:['己','丁','乙'],
  申:['庚','壬','戊'],酉:['辛'],戌:['戊','辛','丁'],亥:['壬','甲']
};

const STRENGTH_LABEL: Record<string, "Weak" | "Slightly Weak" | "Balanced" | "Slightly Strong" | "Strong" | "Very Strong"> = {
  extremely_weak:'Weak',very_weak:'Weak',weak:'Weak',slightly_weak:'Slightly Weak',
  balanced:'Balanced',slightly_strong:'Slightly Strong',strong:'Strong',
  very_strong:'Very Strong',extremely_strong:'Very Strong',transformed:'Balanced',
};

const STEM_PINYIN: Record<string,string> = {甲:'Jiǎ',乙:'Yǐ',丙:'Bǐng',丁:'Dīng',戊:'Wù',己:'Jǐ',庚:'Gēng',辛:'Xīn',壬:'Rén',癸:'Guǐ'};
const BRANCH_PINYIN: Record<string,string> = {子:'Zǐ',丑:'Chǒu',寅:'Yín',卯:'Mǎo',辰:'Chén',巳:'Sì',午:'Wǔ',未:'Wèi',申:'Shēn',酉:'Yǒu',戌:'Xū',亥:'Hài'};
const STEM_TH: Record<string,string> = {甲:'ไม้หยาง',乙:'ไม้หยิน',丙:'ไฟหยาง',丁:'ไฟหยิน',戊:'ดินหยาง',己:'ดินหยิน',庚:'ทองหยาง',辛:'ทองหยิน',壬:'น้ำหยาง',癸:'น้ำหยิน'};

export async function loadProfileChart(profileId: string, orgId: string) {
  const row = await q1<ProfileRow>(
    `SELECT id, name, birth_datetime, birth_time_known, birth_location_name, birth_lat, birth_lng,
            day_master, day_master_strength, yongshen, bazi_pillars, gender
     FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [profileId, orgId]
  );
  if (!row) return null;

  const pillars = row.bazi_pillars?.pillars;
  if (!pillars?.year || !pillars?.month || !pillars?.day) return null;
  const birthTimeKnown = row.birth_time_known !== false;

  // ── TST + RECOMPUTE pillars (use shared helper · single source of truth) ──
  const { applyTST } = await import("@/lib/tyme-tst");
  const tymeEarly = await import("tyme4ts");
  const earlyBd = new Date(row.birth_datetime);
  const bdSrc = earlyBd;
  const earlyYy = earlyBd.getFullYear();
  const earlyMm = earlyBd.getMonth() + 1;
  const earlyDd = earlyBd.getDate();
  const earlyHh = earlyBd.getHours();
  const earlyMn = earlyBd.getMinutes();
  const earlyLng = parseFloat(row.birth_lng || "100.5018");
  const tstResult = applyTST({
    year: earlyYy, month: earlyMm, day: earlyDd,
    hour: earlyHh, minute: earlyMn,
    longitude: earlyLng, gmtOffsetHours: 7,
  });
  const earlyTstHh = tstResult.appliedHour;
  const earlyTstMn = tstResult.appliedMinute;
  // Keep these for backwards-compat downstream
  const earlyShift = tstResult.totalShiftMin;
  const earlyEot = tstResult.eotMin;
  const earlyTzMer = tstResult.meta.standardMeridian;
  // recompute year/month/day at TST. In 3p mode, never fabricate an hour pillar.
  const ecEarly = tymeEarly.SolarTime.fromYmdHms(earlyYy, earlyMm, earlyDd, earlyTstHh, earlyTstMn, 0).getLunarHour().getEightChar();
  pillars.year  = { stem: ecEarly.getYear().getName()[0],  branch: ecEarly.getYear().getName()[1]  };
  pillars.month = { stem: ecEarly.getMonth().getName()[0], branch: ecEarly.getMonth().getName()[1] };
  pillars.day   = { stem: ecEarly.getDay().getName()[0],   branch: ecEarly.getDay().getName()[1]   };
  pillars.hour  = birthTimeKnown
    ? { stem: ecEarly.getHour().getName()[0], branch: ecEarly.getHour().getName()[1] }
    : null;

  const dmStem = pillars.day.stem;
  const dmEl = STEM_ELEMENT[dmStem];
  const ACTIVE_POSITIONS = (["year","month","day","hour"] as const).filter(pos => !!pillars[pos]);
  const DISPLAY_POSITIONS = (birthTimeKnown && pillars.hour)
    ? (["hour","day","month","year"] as const)
    : (["day","month","year"] as const);

  // Pillars formatted. 3p charts intentionally omit hour.
  const PILLARS = DISPLAY_POSITIONS.map(pos => {
    const p = pillars[pos];
    if (!p) return null;
    return {
      label: pos[0].toUpperCase() + pos.slice(1),
      labelZh: { hour:"時", day:"日", month:"月", year:"年" }[pos],
      stem: p.stem,
      branch: p.branch,
      element: STEM_ELEMENT[p.stem],
      godStem: pos === "day" ? "DAY MASTER" : "—",
      hidden: HIDDEN[p.branch] || [],
      pinyin: STEM_PINYIN[p.stem] + " " + BRANCH_PINYIN[p.branch],
      isDM: pos === "day",
    };
  }).filter((p): p is NonNullable<typeof p> => !!p);

  // Element distribution from natal
  // F-VOYTEK-CSS (reverse-engineered from Voytek HTML pixel widths · Aeaw 9/10 god ตรงเป๊ะ)
  // - skip day stem (DM)
  // - branch visible disabled (Voytek doesn't use; main qi double-counts via hidden)
  // - stem weight 6 · hidden weight by hidden-count: 1=[10] 2=[7,3] 3=[6,2,2] (Voytek CSS-decoded)
  // - position weight: hour 0.9 · day 1.0 · month 1.6 · year 0.8
  // ENV: USE_DEEPTUNE_FORMULA=false → revert to F1 legacy
  const USE_DEEPTUNE = process.env.USE_DEEPTUNE_FORMULA !== 'false';
  const POS_W: Record<string, number> = { hour: 0.9, day: 1.0, month: 1.6, year: 0.8 };
  const VOYTEK_HIDDEN: Record<number, number[]> = { 1: [10], 2: [7, 3], 3: [6, 2, 2] };

  const dist: Record<ElementCode, number> = { Wood:0, Fire:0, Earth:0, Metal:0, Water:0 };
  if (USE_DEEPTUNE) {
    for (const pos of ACTIVE_POSITIONS) {
      const p = pillars[pos];
      if (!p) continue;
      const pw = POS_W[pos];
      if (pos !== "day") {
        dist[STEM_ELEMENT[p.stem]] += 6 * pw;
      }
      // branch visible: DISABLED
      const hh = HIDDEN[p.branch] || [];
      const wTab = VOYTEK_HIDDEN[hh.length] || [];
      for (let i = 0; i < hh.length; i++) {
        const w = wTab[i] || 0;
        if (w > 0) dist[STEM_ELEMENT[hh[i]]] += w * pw;
      }
    }
  } else {
    // F1 legacy fallback
    for (const pos of ACTIVE_POSITIONS) {
      const p = pillars[pos];
      if (!p) continue;
      dist[STEM_ELEMENT[p.stem]] += 12;
      dist[BRANCH_ELEMENT[p.branch]] += 12;
      for (const h of HIDDEN[p.branch] || []) {
        dist[STEM_ELEMENT[h]] += 4;
      }
    }
  }
  const total = Object.values(dist).reduce((a,b) => a+b, 0) || 1;
  const ELEMENTS_DIST: Record<ElementCode, number> = {
    Wood:  Math.round((dist.Wood / total) * 100),
    Fire:  Math.round((dist.Fire / total) * 100),
    Earth: Math.round((dist.Earth / total) * 100),
    Metal: Math.round((dist.Metal / total) * 100),
    Water: Math.round((dist.Water / total) * 100),
  };

  // Yongshen + Ji
  const top3 = row.yongshen?.top3 || [];
  const YONGSHEN: ElementCode[] = [...new Set(top3.slice(0, 2).map(y => {
    const e = y.element;
    return (e[0].toUpperCase() + e.slice(1)) as ElementCode;
  }))];
  const allEl: ElementCode[] = ["Wood","Fire","Earth","Metal","Water"];
  const JI: ElementCode[] = allEl.filter(e => !YONGSHEN.includes(e) && e !== dmEl).slice(0, 2);

  const STEM_POL: Record<string,"Yang"|"Yin"> = {甲:"Yang",乙:"Yin",丙:"Yang",丁:"Yin",戊:"Yang",己:"Yin",庚:"Yang",辛:"Yin",壬:"Yang",癸:"Yin"};
  const polarity = STEM_POL[dmStem];
  const DM = {
    zh: dmStem,
    pinyin: STEM_PINYIN[dmStem],
    en: `${polarity} ${dmEl}`,
    th: STEM_TH[dmStem],
    strengthPercent: pickPercent(row.day_master_strength),
    status: STRENGTH_LABEL[row.day_master_strength || "balanced"] || "Balanced",
  };

  // Stars top — placeholder จนกว่าจะ wire wrapper ดาว
  const STARS_TOP = top3.slice(0, 3).map(y => ({
    zh: y.stem + "·" + y.element,
    th: y.element,
    en: y.element,
    pillar: "day" as const,
    polarity: "good" as const,
  }));

  // Birth date format
  const bd = bdSrc;
  const SUBJECT = {
    nameTh: row.name,
    nameEn: row.name,
    nameZh: row.name,
    birthDate: bd.toISOString().slice(0, 10),
    birthTime: birthTimeKnown ? bd.toTimeString().slice(0, 5) : "ไม่ทราบเวลา",
    birthCity: row.birth_location_name || "Bangkok",
  };

  // 10-Year Luck (大運) · ใช้ tyme + TST ที่คำนวณไว้แล้ว
  const tyme = tymeEarly;
  const w1 = await import("../../../data/library/wrappers/1-stem-branch-matrix.js");
  const w4 = await import("../../../data/library/wrappers/4-useful-god.js");
  const TST_INFO = {
    longitude: earlyLng,
    longitudeShift: Math.round((earlyLng - earlyTzMer) * 4 * 10) / 10,
    eot: Math.round(earlyEot * 10) / 10,
    totalShift: Math.round(earlyShift * 10) / 10,
    appliedTime: `${String(earlyTstHh).padStart(2,'0')}:${String(earlyTstMn).padStart(2,'0')}`,
  };
  const st = tyme.SolarTime.fromYmdHms(earlyYy, earlyMm, earlyDd, earlyTstHh, earlyTstMn, 0);
  const isMale = (row.gender || "M").toUpperCase() === "M";
  const cl = tyme.ChildLimit.fromSolarTime(st, isMale ? tyme.Gender.MAN : tyme.Gender.WOMAN);
  const startAge = cl.getYearCount();
  const startMonth = cl.getMonthCount();
  // current age (rough: 2026 - birth year)
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - earlyYy;

  let f = cl.getStartDecadeFortune();
  const LUCK_PILLARS = [];
  for (let i = 0; i < 8; i++) {
    const sa = f.getStartAge();
    const ea = f.getEndAge();
    const pillarStr = f.getSixtyCycle().getName();
    const stem = pillarStr[0];
    const branch = pillarStr[1];
    const stemEl = STEM_ELEMENT[stem];
    LUCK_PILLARS.push({
      age: `${sa}-${ea}`,
      pillar: pillarStr,
      element: stemEl,
      current: currentAge >= sa && currentAge <= ea,
    });
    f = f.next(1);
  }
  const currentLP = LUCK_PILLARS.find(l => l.current);

  // ── TODAY VERDICT (วันนี้ดวงเปิดประตูไหม) ──
  const today = new Date();
  const tdEc = tyme.SolarTime.fromYmdHms(today.getFullYear(), today.getMonth()+1, today.getDate(), 12, 0, 0).getLunarHour().getEightChar();
  const tdLh = tyme.SolarTime.fromYmdHms(today.getFullYear(), today.getMonth()+1, today.getDate(), 12, 0, 0).getLunarHour();
  const tdLd = tdLh.getLunarDay();
  const tdDayPillar = tdEc.getDay().getName();
  const tdDayStem = tdDayPillar[0];
  const tdDayBranch = tdDayPillar[1];
  const tdDayElement = STEM_ELEMENT[tdDayStem];

  // อ่าน yongshen ของ user · ดูว่า day element ตรงกับยงเฉินไหม
  const yongshenLowerEls = (row.yongshen?.top3 || []).slice(0,2).map(y => y.element.toLowerCase());
  const tdElLower = tdDayElement.toLowerCase();
  const aligned = yongshenLowerEls.includes(tdElLower);
  // คำนวณ score ตามการตรง yongshen + crisis
  let tdScore = 50;
  if (aligned) tdScore += 25;
  // ถ้า day stem = ยงเฉินตรงสุด (rank 1) → boost
  const ugRanks = w4.getUsefulGod(dmStem).ranks.map((r: { stem: string }) => r.stem);
  const ugIdx = ugRanks.indexOf(tdDayStem);
  if (ugIdx === 0) tdScore += 15;
  else if (ugIdx === 1) tdScore += 10;
  else if (ugIdx === 2) tdScore += 5;
  tdScore = Math.max(20, Math.min(95, tdScore));
  const tdLabel = tdScore >= 80 ? "EXCELLENT" : tdScore >= 65 ? "GOOD" : tdScore >= 50 ? "OK" : tdScore >= 35 ? "CAUTION" : "AVOID";
  const tdLabelTh = tdScore >= 80 ? "ดีเยี่ยม" : tdScore >= 65 ? "ดี" : tdScore >= 50 ? "พอใช้" : tdScore >= 35 ? "ระวัง" : "หลีกเลี่ยง";
  const tdActionMode = tdScore >= 80 ? "L1 Execute" : tdScore >= 65 ? "L2 Conditional" : tdScore >= 50 ? "L3 Observe" : tdScore >= 35 ? "L4 Reduce" : "L5 Avoid";
  const tdActionTh = tdScore >= 80 ? "ลุยเต็มที่" : tdScore >= 65 ? "ทำได้แต่ระวัง" : tdScore >= 50 ? "เฝ้าดู" : tdScore >= 35 ? "ลดขนาด" : "ยับยั้ง";

  // ── TONGSHU วันนี้ (จาก tyme4ts) ──
  const TONGSHU_TODAY = {
    lunar: tdLd.toString(),
    dayOfficer: { zh: tdLd.getDuty().getName(), th: dutyTh(tdLd.getDuty().getName()) },
    twelveStar: { zh: tdLd.getTwelveStar().getName(), th: twelveStarTh(tdLd.getTwelveStar().getName()) },
    nineStar: tdLd.getNineStar().getName(),
    constellation: { zh: tdLd.getTwentyEightStar().getName(), th: "" },
    yi: tdLd.getRecommends().slice(0, 8).map((r: { getName(): string }) => r.getName()),
    ji: tdLd.getAvoids().slice(0, 8).map((r: { getName(): string }) => r.getName()),
    gods: tdLd.getGods().slice(0, 12).map((g: { getName(): string }) => g.getName()),
  };

  const TODAY_DATA = {
    date: today.toISOString().slice(0, 10),
    dayPillar: tdDayPillar,
    score: tdScore,
    verdict: tdLabel,
    verdictTh: tdLabelTh,
    actionMode: tdActionMode,
    actionModeTh: tdActionTh,
    aligned,
    yongshenAlign: aligned ? `Day element ${tdDayElement} ตรงยงเฉิน ✓` : `Day element ${tdDayElement} ไม่ตรงยงเฉิน`,
    brief: aligned
      ? `วันนี้ ${tdDayPillar} ธาตุ${ELEMENT_TH(tdDayElement)} ตรงยงเฉินคุณ · ${tdActionTh}`
      : `วันนี้ ${tdDayPillar} ธาตุ${ELEMENT_TH(tdDayElement)} ไม่ตรงยงเฉิน · ${tdActionTh}`,
  };

  // ── 10 GODS distribution (จากธาตุของ stem ทั้ง 4 + hidden) ──
  const godCounts: Record<string, number> = {
    '比肩':0,'劫財':0,'食神':0,'傷官':0,'偏財':0,'正財':0,'七殺':0,'正官':0,'偏印':0,'正印':0
  };
  function godOf(stem: string): string | null {
    // import the tenGod logic inline using STEM_ELEMENT
    const dmEl = STEM_ELEMENT[dmStem].toLowerCase();
    const tEl = STEM_ELEMENT[stem]?.toLowerCase();
    if (!tEl) return null;
    const dmPol = STEM_POL[dmStem];
    const tPol = STEM_POL[stem];
    const samePol = dmPol === tPol;
    const PRODUCES: Record<string,string> = {wood:'fire',fire:'earth',earth:'metal',metal:'water',water:'wood'};
    const CONTROLS: Record<string,string> = {wood:'earth',earth:'water',water:'fire',fire:'metal',metal:'wood'};
    if (dmEl === tEl) return samePol ? '比肩' : '劫財';
    if (PRODUCES[dmEl] === tEl) return samePol ? '食神' : '傷官';
    if (CONTROLS[dmEl] === tEl) return samePol ? '偏財' : '正財';
    if (CONTROLS[tEl] === dmEl) return samePol ? '七殺' : '正官';
    if (PRODUCES[tEl] === dmEl) return samePol ? '偏印' : '正印';
    return null;
  }
  // F-VOYTEK-CSS for 10 Gods (same toggle USE_DEEPTUNE_FORMULA)
  if (USE_DEEPTUNE) {
    for (const pos of ACTIVE_POSITIONS) {
      const p = pillars[pos];
      if (!p) continue;
      const pw = POS_W[pos];
      if (pos !== 'day') {
        const g = godOf(p.stem);
        if (g) godCounts[g] += 6 * pw;
      }
      const hh = HIDDEN[p.branch] || [];
      const wTab = VOYTEK_HIDDEN[hh.length] || [];
      for (let i = 0; i < hh.length; i++) {
        const w = wTab[i] || 0;
        if (w === 0) continue;
        const gh = godOf(hh[i]);
        if (gh) godCounts[gh] += w * pw;
      }
    }
  } else {
    for (const pos of ACTIVE_POSITIONS) {
      const p = pillars[pos];
      if (!p) continue;
      const stem = p.stem;
      const g = godOf(stem);
      if (g) godCounts[g] += 12;
      for (let i = 0; i < (HIDDEN[p.branch] || []).length; i++) {
        const h = HIDDEN[p.branch][i];
        const w = i === 0 ? 5 : i === 1 ? 3 : 2;
        const gh = godOf(h);
        if (gh) godCounts[gh] += w;
      }
    }
  }
  const totalGods = Object.values(godCounts).reduce((a,b) => a+b, 0) || 1;
  const TEN_GODS_REAL = Object.entries(godCounts)
    .map(([code, n]) => ({ code, th: TENGOD_TH(code), pct: Math.round((n/totalGods)*100) }))
    .sort((a,b) => b.pct - a.pct);

  // ── 12 HOURS · score ตามการตรง yongshen + Day Officer ──
  const HOURS_REAL: { zh: string; h: string; tone: 'good'|'ok'|'bad'|'neutral' }[] = [];
  const branchOrder = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
  const hourRanges = ["23-01","01-03","03-05","05-07","07-09","09-11","11-13","13-15","15-17","17-19","19-21","21-23"];
  for (let i = 0; i < 12; i++) {
    const branch = branchOrder[i];
    const branchEl = BRANCH_ELEMENT[branch];
    let tone: 'good'|'ok'|'bad'|'neutral' = 'neutral';
    if (yongshenLowerEls.includes(branchEl.toLowerCase())) tone = 'good';
    else if (JI.map(j => j.toLowerCase()).includes(branchEl.toLowerCase())) tone = 'bad';
    else if (branchEl === dmEl) tone = 'ok';
    HOURS_REAL.push({ zh: branch, h: hourRanges[i], tone });
  }

  // ── Compass · best/avoid direction (จาก yongshen) ──
  const elementToBranch: Record<string,{zh:string,deg:number}> = {
    Wood: { zh: "東", deg: 90 }, Fire: { zh: "南", deg: 180 },
    Earth: { zh: "中", deg: 0 }, Metal: { zh: "西", deg: 270 },
    Water: { zh: "北", deg: 0 },
  };
  const bestEl = YONGSHEN[0] || "Earth";
  const avoidEl = JI[0] || "Metal";
  const COMPASS_REAL = {
    best:  { zh: elementToBranch[bestEl].zh,  th: dirTh(elementToBranch[bestEl].zh),  deg: elementToBranch[bestEl].deg },
    avoid: { zh: elementToBranch[avoidEl].zh, th: dirTh(elementToBranch[avoidEl].zh), deg: elementToBranch[avoidEl].deg },
  };

  // ── Heaven Void · Six Destructions · Archetype · Structure ──
  const w3 = await import("../../../data/library/wrappers/3-ge-ju.js");
  const ge = w3.inferGeJu({
    year: pillars.year, month: pillars.month, day: pillars.day, hour: pillars.hour,
  });

  // Kong Wang ของ day pillar
  const STEMS_ALL = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const BRANCHES_ALL = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  function kongWangOf(stem: string, branch: string): string[] {
    const si = STEMS_ALL.indexOf(stem);
    const bi = BRANCHES_ALL.indexOf(branch);
    const offset = ((bi - si) % 12 + 12) % 12;
    const v1 = BRANCHES_ALL[(offset + 10) % 12];
    const v2 = BRANCHES_ALL[(offset + 11) % 12];
    return [v1, v2];
  }
  const KONG_WANG = kongWangOf(pillars.day.stem, pillars.day.branch);
  const KONG_WANG_YP = kongWangOf(pillars.year.stem, pillars.year.branch);

  // Six Destructions detection
  const SIX_DESTROY: Record<string,string> = {
    子:'酉',酉:'子', 丑:'辰',辰:'丑', 寅:'亥',亥:'寅',
    卯:'午',午:'卯', 巳:'申',申:'巳', 未:'戌',戌:'未',
  };
  const natalBranches = ACTIVE_POSITIONS.map(pos => pillars[pos]?.branch).filter((b): b is string => !!b);
  const SIX_DEST_FOUND: { pair: string[]; pillars: string[] }[] = [];
  for (let i = 0; i < natalBranches.length; i++) {
    for (let j = i + 1; j < natalBranches.length; j++) {
      if (SIX_DESTROY[natalBranches[i]] === natalBranches[j]) {
        const positions = ACTIVE_POSITIONS;
        SIX_DEST_FOUND.push({
          pair: [natalBranches[i], natalBranches[j]],
          pillars: [positions[i], positions[j]],
        });
      }
    }
  }

  // Archetype × Element (5 base × 5 element = 25)
  const ARCH_BY_DM_ELEMENT: Record<string, string> = {
    Wood: "Connector", Fire: "Connector", Earth: "Achiever",
    Metal: "Thinker", Water: "Creator",
  };
  // Map by ge_ju structure
  const STRUCT_TO_ARCH: Record<string, string> = {
    '正官格':'Influence','七殺格':'Influence','劫財格':'Influence',
    '正印格':'Thinker','偏印格':'Thinker',
    '正財格':'Achiever','偏財格':'Achiever',
    '食神格':'Creator','傷官格':'Creator',
    '比肩格':'Connector',
  };
  const archBase = STRUCT_TO_ARCH[ge.structure || ''] || ARCH_BY_DM_ELEMENT[dmEl] || 'Connector';
  const ARCHETYPE = {
    name: `${archBase} × ${dmEl}`,
    base: archBase,
    element: dmEl,
    elementZh: ELEMENT_ZH_MAP[dmEl],
    description: ARCH_DESC[`${archBase}_${dmEl}`] || ARCH_DESC[archBase] || `${archBase} archetype with ${dmEl} flavor`,
    descriptionTh: ARCH_DESC_TH[`${archBase}_${dmEl}`] || ARCH_DESC_TH[archBase] || `บุคลิก ${archBase} ผ่านธาตุ${ELEMENT_TH(dmEl)}`,
  };

  // Structure (Ge Ju)
  const STRUCTURE = {
    code: ge.structure,
    nameTh: ge.narrative?.th || ge.structure,
    nameEn: ge.narrative?.en || ge.structure,
    confidence: ge.confidence,
    basis: ge.basis,
    descriptionTh: STRUCT_DESC_TH[ge.structure || ''] || ge.basis,
  };

  // ── Stem matrix · 10 stems × birth chart ──
  const matrix = w1.buildMatrix({
    year: pillars.year, month: pillars.month, day: pillars.day, hour: pillars.hour,
  });
  const STEM_MATRIX = STEMS_ALL.map((s) => ({
    stem: s,
    events: ((matrix.stemMatrix as Record<string, { events: { type:string }[]; pillar:string; tenGod?:string }[]>)[s] || []).map(p => ({
      pillar: p.pillar,
      tenGod: p.tenGod || '—',
      events: p.events.map(e => e.type).join(', ') || '—',
    })),
  }));

  // ── Branch matrix · 12 branches × birth chart ──
  const BRANCH_MATRIX = BRANCHES_ALL.map((b) => {
    const data = (matrix.branchMatrix as Record<string, { perPillar: { pillar:string; events:{type:string}[] }[]; chartLevel: { type:string; element:string }[] }>)[b];
    return {
      branch: b,
      perPillar: (data?.perPillar || []).map(p => ({
        pillar: p.pillar,
        events: p.events.map(e => e.type).join(', '),
      })),
      chartLevel: data?.chartLevel || [],
    };
  });
  // ── 4 sections เพิ่ม: Na Yin · 12 Qi Phases · Liu transits · Shen Sha full ──
  const NA_YIN: Record<string, { zh: string; en: string; element: string; symbol: string } | null> = {};
  const QI_PHASES: Record<string, string | null> = {};
  for (const pos of ['year','month','day','hour'] as const) {
    const p = pillars[pos];
    NA_YIN[pos] = p ? naYinOf(p.stem + p.branch) : null;
    QI_PHASES[pos] = p ? twelvePhaseOf(dmStem, p.branch) : null;
  }
  const _now = new Date();
  const _ny = _now.getFullYear(), _nm = _now.getMonth()+1, _nd = _now.getDate(), _nh = _now.getHours(), _nmin = _now.getMinutes();
  const LIU_TRANSITS = {
    nian: { pillar: tymeEarly.SolarTime.fromYmdHms(_ny, 7, 15, 12, 0, 0).getLunarHour().getEightChar().getYear().getName(),  label: `ปี ${_ny}` },
    yue:  { pillar: tymeEarly.SolarTime.fromYmdHms(_ny, _nm, 15, 12, 0, 0).getLunarHour().getEightChar().getMonth().getName(), label: `เดือน ${_nm}` },
    ri:   { pillar: tymeEarly.SolarTime.fromYmdHms(_ny, _nm, _nd, 12, 0, 0).getLunarHour().getEightChar().getDay().getName(),   label: `วันที่ ${_nd}` },
    shi:  { pillar: tymeEarly.SolarTime.fromYmdHms(_ny, _nm, _nd, _nh, _nmin, 0).getLunarHour().getEightChar().getHour().getName(), label: `${String(_nh).padStart(2,'0')}:${String(_nmin).padStart(2,'0')}` },
  };
  const SHEN_SHA_FULL = detectShenShaStars({
    year: pillars.year, month: pillars.month, day: pillars.day, hour: pillars.hour,
  });

  const INTERACTIONS_REAL: { type: string; pattern: string; involved: string[]; polarity: 'good'|'warn'|'neutral' }[] = [];
  // ── Natal branch occurrence count (สำหรับกรอง natal Fu Yin จริง) ──
  // Fu Yin (伏吟) = ซ้ำจริงในดวงกำเนิด · branch ที่ปรากฏ ≥ 2 ครั้ง
  // ไม่ใช่ matrix incoming (ที่ flag ทุก branch ตรงกับ natal เดียว)
  const natalBranchCount: Record<string, number> = {};
  for (const pos of ACTIVE_POSITIONS) {
    const b = pillars[pos]?.branch;
    if (!b) continue;
    natalBranchCount[b] = (natalBranchCount[b] || 0) + 1;
  }
  // pull top events from branch matrix (sanHe/sanHui จากดวงเอง)
  for (const [branch, data] of Object.entries(matrix.branchMatrix as Record<string, { perPillar: { events: { type:string; verdict:string; with?:string }[]; pillar:string }[]; chartLevel: { type:string; element:string; verdict:string; with?:string[] }[] }>)) {
    if ((data.perPillar?.length || 0) === 0 && (data.chartLevel?.length || 0) === 0) continue;
    // perPillar (Fu Yin etc)
    for (const pp of data.perPillar || []) {
      for (const ev of pp.events) {
        if (INTERACTIONS_REAL.length >= 8) break;
        // ── Fu Yin filter ──
        // ถือว่า natal Fu Yin จริง ก็ต่อเมื่อ branch ปรากฏใน natal ≥ 2 ครั้ง
        // ถ้าปรากฏ 1 ครั้ง · matrix flag แค่ "incoming = same as natal" — skip ใน natal interactions
        if (ev.type === '伏吟' && (natalBranchCount[branch] || 0) < 2) {
          continue;
        }
        INTERACTIONS_REAL.push({
          type: ev.type,
          pattern: `${branch} ${ev.type === '伏吟' ? '伏吟' : ''} ${pp.pillar}${pp.events[0]?.with ? '/' + pp.events[0].with : ''}`,
          involved: [pp.pillar],
          polarity: ev.verdict === 'positive' ? 'good' : ev.verdict === 'negative' ? 'warn' : 'neutral',
        });
      }
    }
  }

  // ── R · Root / Tou Gan ──
  // ดูว่าแต่ละ stem ใน HS มี root (ธาตุเดียวกันใน hidden ของ branch ใดๆ) หรือไม่
  // strength: 1.0 (peak/lu), 0.6 (storage), 0.3 (residual), 0.0 (none)
  const ROOT_PEAK_BRANCH: Record<string, string[]> = {
    甲: ['寅','卯'], 乙: ['寅','卯'],
    丙: ['巳','午'], 丁: ['巳','午'],
    戊: ['辰','戌','丑','未','巳','午'], 己: ['辰','戌','丑','未','巳','午'],
    庚: ['申','酉'], 辛: ['申','酉'],
    壬: ['亥','子'], 癸: ['亥','子'],
  };
  const ROOTS_DATA = ACTIVE_POSITIONS.map(pos => {
    const p = pillars[pos];
    if (!p) return null;
    const stem = p.stem;
    const stemEl = STEM_ELEMENT[stem];
    const peakSet = ROOT_PEAK_BRANCH[stem] || [];
    let strength = 0;
    let label = 'no_root';
    let labelTh = 'ไม่มีราก';
    const rootedIn: string[] = [];
    for (const p2 of ACTIVE_POSITIONS) {
      const b = pillars[p2]?.branch;
      if (!b) continue;
      if (peakSet.includes(b)) {
        strength = Math.max(strength, 1.0);
        label = 'strong_root';
        labelTh = 'รากแข็งแกร่ง';
        rootedIn.push(b);
        continue;
      }
      const hh = HIDDEN[b] || [];
      for (let i = 0; i < hh.length; i++) {
        const hEl = STEM_ELEMENT[hh[i]];
        if (hEl !== stemEl) continue;
        if (i === 0 && strength < 0.6) { strength = 0.6; label = 'medium_root'; labelTh = 'รากกลาง'; rootedIn.push(b); }
        else if (i >= 1 && strength < 0.3) { strength = 0.3; label = 'weak_root'; labelTh = 'รากอ่อน'; rootedIn.push(b); }
      }
    }
    return { pillar: pos, stem, element: stemEl, strength, label, labelTh, rootedIn: [...new Set(rootedIn)] };
  }).filter((r): r is NonNullable<typeof r> => !!r);

  // Tou Gan: hidden stem ใดที่ "ปรากฏใน HS" บนยอด
  const stemsOnTop = ACTIVE_POSITIONS.map(pos => pillars[pos]?.stem).filter((s): s is string => !!s);
  const TOU_GAN_DATA: { branch: string; pillar: string; tou: { hidden: string; pos: 'main'|'middle'|'residual' }[] }[] = [];
  for (const pos of ACTIVE_POSITIONS) {
    const b = pillars[pos]?.branch;
    if (!b) continue;
    const hh = HIDDEN[b] || [];
    const tou: { hidden: string; pos: 'main'|'middle'|'residual' }[] = [];
    for (let i = 0; i < hh.length; i++) {
      if (stemsOnTop.includes(hh[i])) {
        tou.push({ hidden: hh[i], pos: i === 0 ? 'main' : i === 1 ? 'middle' : 'residual' });
      }
    }
    if (tou.length > 0) TOU_GAN_DATA.push({ branch: b, pillar: pos, tou });
  }

  // ── S · Storage / Tomb · 4 storage branches (辰戌丑未) ──
  const STORAGE_INFO: Record<string, { mainEl: string; primaryStored: string; secondary: string[]; sanHe: string; thNote: string }> = {
    辰: { mainEl: 'earth', primaryStored: 'water 癸', secondary: ['wood 乙'], sanHe: '申子辰 → water', thNote: 'คลังน้ำ · ปลดปล่อยเมื่อครบ 申子辰' },
    戌: { mainEl: 'earth', primaryStored: 'fire 丁', secondary: ['metal 辛'], sanHe: '寅午戌 → fire', thNote: 'คลังไฟ · ปลดปล่อยเมื่อครบ 寅午戌' },
    丑: { mainEl: 'earth', primaryStored: 'metal 辛', secondary: ['water 癸'], sanHe: '巳酉丑 → metal', thNote: 'คลังโลหะ · ปลดปล่อยเมื่อครบ 巳酉丑' },
    未: { mainEl: 'earth', primaryStored: 'wood 乙', secondary: ['fire 丁'], sanHe: '亥卯未 → wood', thNote: 'คลังไม้ · ปลดปล่อยเมื่อครบ 亥卯未' },
  };
  const STORAGE_DATA = ACTIVE_POSITIONS.flatMap(pos => {
    const b = pillars[pos]?.branch;
    if (!b) return [];
    const info = STORAGE_INFO[b];
    if (!info) return [];
    return [{ pillar: pos, branch: b, ...info }];
  });

  // ── T · Palace Reading · 4 พระราชวัง ──
  const PALACE_DATA = [
    { pillar: 'year' as const,  zh: '祖宫',     th: 'เสาปี · บรรพบุรุษ/วัยเด็ก/ผู้ใหญ่', age: '0-16',  domains: ['elders','ancestry','social_standing','early_environment'], stemMeaning: 'ผู้ใหญ่ฝ่ายชาย', branchMeaning: 'ผู้ใหญ่ฝ่ายหญิง · รากบรรพบุรุษ' },
    { pillar: 'month' as const, zh: '父母兄弟宫', th: 'เสาเดือน · พ่อแม่/อาชีพ',          age: '17-32', domains: ['parents','career','structure','siblings','education'], stemMeaning: 'พ่อ/หัวหน้า', branchMeaning: 'แม่/รากอาชีพ · ⭐ holds Ge Ju seed' },
    { pillar: 'day' as const,   zh: '夫妻宫',   th: 'เสาวัน · ตนเอง/คู่ครอง',           age: '33-48', domains: ['self','spouse','marriage','core_health','identity'],  stemMeaning: 'ตนเอง (Day Master)', branchMeaning: 'คู่ครอง · เก้าอี้คู่' },
    { pillar: 'hour' as const,  zh: '子女宫',   th: 'เสาชั่วโมง · ลูก/บั้นปลาย',        age: '49+',   domains: ['children','team','subordinates','creative_output','old_age'], stemMeaning: 'ลูกชาย/ลูกน้อง', branchMeaning: 'ลูกหญิง/บั้นปลาย' },
  ].filter(p => !!pillars[p.pillar]).map(p => ({
    ...p,
    stem: pillars[p.pillar]!.stem,
    branch: pillars[p.pillar]!.branch,
    stemEl: STEM_ELEMENT[pillars[p.pillar]!.stem],
    branchEl: BRANCH_ELEMENT[pillars[p.pillar]!.branch],
  }));

  // ── P0-B · Follow / 從格 detector (read-only · ไม่ override Yongshen) ──
  const followDetector = await import("../../../data/library/wrappers/follow-detector.js");
  const FOLLOW_ANALYSIS = followDetector.detectFollow({
    year: pillars.year, month: pillars.month, day: pillars.day, hour: pillars.hour,
  });

  return {
    SUBJECT,
    PILLARS,
    DM,
    ELEMENTS_DIST,
    YONGSHEN,
    JI,
    STARS_TOP,
    STARS_TOTAL: top3.length || 3,
    GE_JU: row.bazi_pillars?.ge_ju || null,
    CLIMATE: row.yongshen?.climate || null,
    LUCK_PILLARS,
    CURRENT_AGE: currentAge,
    CURRENT_LP: currentLP?.pillar || null,
    LUCK_START: { years: startAge, months: startMonth },
    TODAY: TODAY_DATA,
    TONGSHU_TODAY,
    TEN_GODS_REAL,
    HOURS_REAL,
    COMPASS_REAL,
    INTERACTIONS_REAL,
    KONG_WANG,
    KONG_WANG_YP,
    SIX_DEST_FOUND,
    ARCHETYPE,
    STRUCTURE,
    STEM_MATRIX,
    BRANCH_MATRIX,
    NA_YIN,
    QI_PHASES,
    LIU_TRANSITS,
    SHEN_SHA_FULL,
    ROOTS_DATA,
    TOU_GAN_DATA,
    STORAGE_DATA,
    PALACE_DATA,
    FOLLOW_ANALYSIS,
  };
}

// ── Helper data loaders for 4 new sections ──
import naYinData from "../../../data/sesheta-v3/sesheta-na-yin-60.json";

type StarHit = { code: string; zh: string; th: string; polarity: 'good'|'bad'|'neutral'; pillars: string[] };

function detectShenShaStars(pillars: { year: Pillar; month: Pillar; day: Pillar; hour?: Pillar | null }): StarHit[] {
  const ds = pillars.day.stem, db = pillars.day.branch, ys = pillars.year.stem, yb = pillars.year.branch, mb = pillars.month.branch;
  const TBL: Array<{ code: string; zh: string; th: string; polarity: 'good'|'bad'|'neutral'; targets: string[]; targetField: 'stem'|'branch' }> = [];
  const T_DS: Record<string, Record<string, string[]>> = {
    tianYi:    {'甲':['丑','未'],'戊':['丑','未'],'庚':['丑','未'],'乙':['申','子'],'己':['申','子'],'丙':['酉','亥'],'丁':['酉','亥'],'辛':['寅','午'],'壬':['卯','巳'],'癸':['卯','巳']},
    wenChang:  {'甲':['巳'],'乙':['午'],'丙':['申'],'丁':['酉'],'戊':['申'],'己':['酉'],'庚':['亥'],'辛':['子'],'壬':['寅'],'癸':['卯']},
    luShen:    {'甲':['寅'],'乙':['卯'],'丙':['巳'],'丁':['午'],'戊':['巳'],'己':['午'],'庚':['申'],'辛':['酉'],'壬':['亥'],'癸':['子']},
    yangRen:   {'甲':['卯'],'乙':['寅'],'丙':['午'],'丁':['巳'],'戊':['午'],'己':['巳'],'庚':['酉'],'辛':['申'],'壬':['子'],'癸':['亥']},
    hongYan:   {'甲':['午'],'乙':['午'],'丙':['寅'],'丁':['未'],'戊':['辰'],'己':['辰'],'庚':['戌'],'辛':['酉'],'壬':['子'],'癸':['申']},
    jinYu:     {'甲':['辰'],'乙':['巳'],'丙':['未'],'丁':['申'],'戊':['未'],'己':['申'],'庚':['戌'],'辛':['亥'],'壬':['丑'],'癸':['寅']},
    xueRen:    {'甲':['酉'],'乙':['戌'],'丙':['子'],'丁':['丑'],'戊':['卯'],'己':['辰'],'庚':['午'],'辛':['未'],'壬':['酉'],'癸':['戌']},
  };
  const T_DB: Record<string, Record<string, string[]>> = {
    taoHua:    {'寅':['卯'],'午':['卯'],'戌':['卯'],'巳':['午'],'酉':['午'],'丑':['午'],'申':['酉'],'子':['酉'],'辰':['酉'],'亥':['子'],'卯':['子'],'未':['子']},
    yiMa:      {'寅':['申'],'午':['申'],'戌':['申'],'申':['寅'],'子':['寅'],'辰':['寅'],'巳':['亥'],'酉':['亥'],'丑':['亥'],'亥':['巳'],'卯':['巳'],'未':['巳']},
    huaGai:    {'寅':['戌'],'午':['戌'],'戌':['戌'],'申':['辰'],'子':['辰'],'辰':['辰'],'巳':['丑'],'酉':['丑'],'丑':['丑'],'亥':['未'],'卯':['未'],'未':['未']},
    jiangXing: {'寅':['午'],'午':['午'],'戌':['午'],'申':['子'],'子':['子'],'辰':['子'],'巳':['酉'],'酉':['酉'],'丑':['酉'],'亥':['卯'],'卯':['卯'],'未':['卯']},
    jieSha:    {'寅':['亥'],'午':['亥'],'戌':['亥'],'申':['巳'],'子':['巳'],'辰':['巳'],'巳':['寅'],'酉':['寅'],'丑':['寅'],'亥':['申'],'卯':['申'],'未':['申']},
    wangShen:  {'寅':['巳'],'午':['巳'],'戌':['巳'],'申':['亥'],'子':['亥'],'辰':['亥'],'巳':['申'],'酉':['申'],'丑':['申'],'亥':['寅'],'卯':['寅'],'未':['寅']},
  };
  const T_YB: Record<string, Record<string, string[]>> = {
    hongLuan:  {'子':['卯'],'丑':['寅'],'寅':['丑'],'卯':['子'],'辰':['亥'],'巳':['戌'],'午':['酉'],'未':['申'],'申':['未'],'酉':['午'],'戌':['巳'],'亥':['辰']},
    tianXi:    {'子':['酉'],'丑':['申'],'寅':['未'],'卯':['午'],'辰':['巳'],'巳':['辰'],'午':['卯'],'未':['寅'],'申':['丑'],'酉':['子'],'戌':['亥'],'亥':['戌']},
    guChen:    {'寅':['巳'],'卯':['巳'],'辰':['巳'],'巳':['申'],'午':['申'],'未':['申'],'申':['亥'],'酉':['亥'],'戌':['亥'],'亥':['寅'],'子':['寅'],'丑':['寅']},
    guaSu:     {'寅':['丑'],'卯':['丑'],'辰':['丑'],'巳':['辰'],'午':['辰'],'未':['辰'],'申':['未'],'酉':['未'],'戌':['未'],'亥':['戌'],'子':['戌'],'丑':['戌']},
    sangMen:   {'子':['寅'],'丑':['卯'],'寅':['辰'],'卯':['巳'],'辰':['午'],'巳':['未'],'午':['申'],'未':['酉'],'申':['戌'],'酉':['亥'],'戌':['子'],'亥':['丑']},
    diaoKe:    {'子':['戌'],'丑':['亥'],'寅':['子'],'卯':['丑'],'辰':['寅'],'巳':['卯'],'午':['辰'],'未':['巳'],'申':['午'],'酉':['未'],'戌':['申'],'亥':['酉']},
  };
  const T_MB_STEM: Record<string, Record<string, string[]>> = {
    tianDe:    {'寅':['丁'],'卯':['申'],'辰':['壬'],'巳':['辛'],'午':['亥'],'未':['甲'],'申':['癸'],'酉':['寅'],'戌':['丙'],'亥':['乙'],'子':['巳'],'丑':['庚']},
    yueDe:     {'寅':['丙'],'午':['丙'],'戌':['丙'],'申':['壬'],'子':['壬'],'辰':['壬'],'巳':['庚'],'酉':['庚'],'丑':['庚'],'亥':['甲'],'卯':['甲'],'未':['甲']},
  };
  const META: Record<string, { zh: string; th: string; polarity: 'good'|'bad'|'neutral' }> = {
    tianYi:{zh:'天乙貴人',th:'ขุนนาง',polarity:'good'},
    wenChang:{zh:'文昌',th:'อักษร',polarity:'good'},
    luShen:{zh:'祿神',th:'ทรัพย์',polarity:'good'},
    yangRen:{zh:'羊刃',th:'ดาบแกะ',polarity:'bad'},
    hongYan:{zh:'紅艷煞',th:'เสน่ห์รัก',polarity:'neutral'},
    jinYu:{zh:'金輿',th:'ราชรถ',polarity:'good'},
    xueRen:{zh:'血刃',th:'ดาบเลือด',polarity:'bad'},
    taoHua:{zh:'桃花',th:'เสน่ห์',polarity:'neutral'},
    yiMa:{zh:'驛馬',th:'ม้าเดินทาง',polarity:'neutral'},
    huaGai:{zh:'華蓋',th:'หลังคาฟ้า',polarity:'neutral'},
    jiangXing:{zh:'將星',th:'แม่ทัพ',polarity:'good'},
    jieSha:{zh:'劫煞',th:'โจรปล้น',polarity:'bad'},
    wangShen:{zh:'亡神',th:'อสูรหาย',polarity:'bad'},
    hongLuan:{zh:'紅鸞',th:'หงส์แดง',polarity:'good'},
    tianXi:{zh:'天喜',th:'ฟ้ายินดี',polarity:'good'},
    guChen:{zh:'孤辰',th:'อ้างว้าง',polarity:'bad'},
    guaSu:{zh:'寡宿',th:'หม้ายเหงา',polarity:'bad'},
    sangMen:{zh:'喪門',th:'ประตูศพ',polarity:'bad'},
    diaoKe:{zh:'弔客',th:'แขกอาลัย',polarity:'bad'},
    tianDe:{zh:'天德貴人',th:'คุณฟ้า',polarity:'good'},
    yueDe:{zh:'月德貴人',th:'คุณเดือน',polarity:'good'},
  };
  const positions = (['year','month','day','hour'] as const).filter(p => !!pillars[p]);
  const pp = (p: typeof positions[number]) => pillars[p]!;
  const found: StarHit[] = [];
  const checkBranch = (code: string, targets: string[]) => {
    const hits = positions.filter(p => targets.includes(pp(p).branch));
    if (hits.length) found.push({ code, ...META[code], pillars: [...hits] });
  };
  const checkStem = (code: string, targets: string[]) => {
    const hits = positions.filter(p => targets.includes(pp(p).stem));
    if (hits.length) found.push({ code, ...META[code], pillars: [...hits] });
  };
  for (const [code, t] of Object.entries(T_DS)) checkBranch(code, t[ds] || []);
  for (const [code, t] of Object.entries(T_DB)) checkBranch(code, t[db] || []);
  for (const [code, t] of Object.entries(T_YB)) checkBranch(code, t[yb] || []);
  for (const [code, t] of Object.entries(T_MB_STEM)) checkStem(code, t[mb] || []);
  void ys; void TBL;
  return found;
}

const STEM_ANCHOR_MAP: Record<string, { start: string; dir: number }> = {
  甲:{start:'亥',dir:1}, 丙:{start:'寅',dir:1}, 戊:{start:'寅',dir:1},
  庚:{start:'巳',dir:1}, 壬:{start:'申',dir:1},
  乙:{start:'午',dir:-1}, 丁:{start:'酉',dir:-1}, 己:{start:'酉',dir:-1},
  辛:{start:'子',dir:-1}, 癸:{start:'卯',dir:-1},
};
const PHASE_ORDER_12 = ['長生','沐浴','冠帶','臨官','帝旺','衰','病','死','墓','絕','胎','養'];
const BRANCH_ORDER = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

export function naYinOf(pillar: string): { zh: string; en: string; element: string; symbol: string } | null {
  const d = (naYinData as Record<string, { na_yin: string; en: string; element: string; symbol: string }>)[pillar];
  if (!d) return null;
  return { zh: d.na_yin, en: d.en, element: d.element, symbol: d.symbol };
}

export function twelvePhaseOf(stem: string, branch: string): string | null {
  const a = STEM_ANCHOR_MAP[stem]; if (!a) return null;
  const startIdx = BRANCH_ORDER.indexOf(a.start);
  const branchIdx = BRANCH_ORDER.indexOf(branch);
  let offset = (branchIdx - startIdx) * a.dir;
  offset = ((offset % 12) + 12) % 12;
  return PHASE_ORDER_12[offset];
}

const ELEMENT_ZH_MAP: Record<string,string> = {Wood:'木',Fire:'火',Earth:'土',Metal:'金',Water:'水'};

const ARCH_DESC: Record<string,string> = {
  Connector: 'Brings people together · empathic · shapes networks',
  Influence: 'Leads through structure · authority · responsibility',
  Thinker:   'Crystallizes wisdom · deep insight · long-arc',
  Creator:   'Manifests · refined output · creative flow',
  Achiever:  'Builds wealth · steady · mastery of resources',
};

const ARCH_DESC_TH: Record<string,string> = {
  Connector: 'ผู้เชื่อมคน · เห็นใจ · สร้างเครือข่ายธรรมชาติ',
  Influence: 'ผู้นำผ่านโครงสร้าง · มีอำนาจ · รับผิดชอบ',
  Thinker:   'ผู้ตกผลึกปัญญา · เข้าใจลึก · มอง long-arc',
  Creator:   'ผู้สร้าง · ผลงานเรียบเรียง · ปลดปล่อยศิลปะ',
  Achiever:  'ผู้สั่งสมทรัพย์ · มั่นคง · ครองทรัพยากร',
};

const STRUCT_DESC_TH: Record<string,string> = {
  '正官格':'ระเบียบ · มีกรอบ · เหมาะข้าราชการ/บริษัท',
  '七殺格':'เด็ดขาด · ผ่านศึก · ผู้นำกล้าเสี่ยง',
  '正財格':'สะสม · มั่นคง · สร้างผ่านวินัย',
  '偏財格':'แสวงหา · จับโอกาส · ทรัพย์ลื่นไหล',
  '食神格':'เรียบเรียง · สร้างนุ่ม · ศิลปิน',
  '傷官格':'ปลดปล่อย · ฉีกกฎ · ครีเอทีฟกล้า',
  '正印格':'บ่มเพาะ · สะสมปัญญา · นักวิชาการ',
  '偏印格':'ตกผลึก · เข้าใจคม · นักยุทธศาสตร์',
  '比肩格':'เสมอ · ร่วมมือ · ทีม',
  '劫財格':'แข่งขัน · พลวัต · สู้',
  '化木格':'แปรเป็นไม้ · เกิดใหม่',
  '化火格':'แปรเป็นไฟ · เกิดใหม่',
  '化土格':'แปรเป็นดิน · เกิดใหม่',
  '化金格':'แปรเป็นทอง · เกิดใหม่',
  '化水格':'แปรเป็นน้ำ · เกิดใหม่',
  '從兒格':'ตามพรสวรรค์ · ทำสิ่งที่สร้าง',
  '從財格':'ตามทรัพย์ · ตามกระแส',
  '從殺格':'ตามอำนาจ · ตามผู้คุม',
};

const STEM_POL: Record<string,"Yang"|"Yin"> = {甲:"Yang",乙:"Yin",丙:"Yang",丁:"Yin",戊:"Yang",己:"Yin",庚:"Yang",辛:"Yin",壬:"Yang",癸:"Yin"};

const TENGOD_TH_MAP: Record<string,string> = {
  '比肩':'เพื่อน','劫財':'ขัดทรัพย์','食神':'พรสวรรค์อ่อน','傷官':'พรสวรรค์แรง',
  '偏財':'ทรัพย์รอง','正財':'ทรัพย์ตรง','七殺':'ผู้คุมเข้ม','正官':'ผู้คุมปกติ',
  '偏印':'ครูสายลับ','正印':'ครูสายตรง'
};
function TENGOD_TH(code: string) { return TENGOD_TH_MAP[code] || code; }

function ELEMENT_TH(el: string) {
  return ({Wood:'ไม้',Fire:'ไฟ',Earth:'ดิน',Metal:'ทอง',Water:'น้ำ'} as Record<string,string>)[el] || el;
}

function dutyTh(zh: string) {
  return ({建:'สร้าง',除:'กำจัด',滿:'เต็ม',平:'ราบ',定:'มั่น',執:'ยึด',破:'ทำลาย',危:'เสี่ยง',成:'สำเร็จ',收:'เก็บ',開:'เปิด',閉:'ปิด'} as Record<string,string>)[zh] || zh;
}
function twelveStarTh(zh: string) {
  return ({青龍:'มังกรเขียว',明堂:'หอสว่าง',天刑:'โทษฟ้า',朱雀:'หงส์แดง',金匱:'ทองเก็บ',天德:'คุณฟ้า',白虎:'เสือขาว',玉堂:'หยกหอ',天牢:'คุกฟ้า',玄武:'เต่าดำ',司命:'ผู้บัญชาชะตา',勾陳:'มังกรค่อม'} as Record<string,string>)[zh] || zh;
}
function dirTh(zh: string) {
  return ({北:'เหนือ',ใต้:'ใต้',南:'ใต้',ตะวันออก:'ตะวันออก',東:'ตะวันออก',西:'ตะวันตก',中:'กลาง'} as Record<string,string>)[zh] || zh;
}

function pickPercent(level?: string): number {
  return ({
    extremely_weak:10,very_weak:25,weak:38,slightly_weak:48,
    balanced:52,slightly_strong:58,strong:70,very_strong:84,extremely_strong:95,transformed:50,
  } as Record<string,number>)[level || "balanced"] || 50;
}
