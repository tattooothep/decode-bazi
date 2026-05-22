/**
 * POST /api/auspicious  · อาเจ๊กฮ้ง architecture · 16 พ.ค. 2026
 *
 * Body: SearchRequest {
 *   activityType: '立約'|'出行'|'動土'|'搬家'|'開市'|'婚姻'|'求財'|'祭祀',
 *   dateFrom: 'YYYY-MM-DD', dateTo: 'YYYY-MM-DD',
 *   peopleIds?: string[],
 *   activeModules: ModuleKey[],
 *   options?: { limit?: number, minScore?: number }
 * }
 *
 * Pipeline (Fail-Fast):
 *   1. SQL filter aj_ephemeris_cache (date + zodiac + module pass) → top 360
 *   2. Late hydrate personal modules (top 50) จาก aj_personal_cache
 *   3. combineScores · enrich · sort · slice
 *   4. Audit log → aj_search_audit
 *
 * Fallback: ถ้า aj_ephemeris_cache ว่าง → compute on-the-fly ด้วย ze_ri module
 */
import { NextRequest, NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { ALL_MODULES, UNIVERSAL_MODULES, PERSONAL_MODULES } from "@/lib/luck-engine/types";
import type { ModuleKey, ActivityType, CandidateSlot, ModuleResult, FunnelStats, SearchResponse, PersonProfile } from "@/lib/luck-engine/types";
import { combineScores, scoreToTier, tierToAction, TIER_LABELS } from "@/lib/luck-engine/combineScores";

const ZODIAC_CLASH_MAP: Record<string, string> = {
  "子":"午","丑":"未","寅":"申","卯":"酉","辰":"戌","巳":"亥",
  "午":"子","未":"丑","申":"寅","酉":"卯","戌":"辰","亥":"巳",
};

/* Rate limiting · sliding-window per-IP · 60 req/min · ป้องกัน abuse */
const _rateLimits = new Map<string, number[]>();
const RL_WINDOW = 60_000;
const RL_MAX = 60;
function checkRateLimit(ip: string): { ok: boolean; remaining: number; resetSec: number } {
  const now = Date.now();
  const cutoff = now - RL_WINDOW;
  const arr = (_rateLimits.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= RL_MAX) {
    return { ok: false, remaining: 0, resetSec: Math.ceil((arr[0] + RL_WINDOW - now) / 1000) };
  }
  arr.push(now);
  _rateLimits.set(ip, arr);
  if (_rateLimits.size > 10000) {
    // evict old entries
    for (const [k, v] of _rateLimits.entries()) if (v[v.length-1] < cutoff) _rateLimits.delete(k);
  }
  return { ok: true, remaining: RL_MAX - arr.length, resetSec: 60 };
}

/* In-memory query cache · TTL 60s · ลด DB load จาก 100+ concurrent users
   Key = JSON.stringify(request body essentials) · ephemeris ไม่เปลี่ยนใน 60s · safe */
const _ausCache = new Map<string, { data: any; expires: number }>();
const AUS_TTL = 60_000;
function cacheKey(body: any): string {
  return JSON.stringify({
    a: body.activityType, df: body.dateFrom, dt: body.dateTo,
    p: body.peopleIds || [], m: (body.activeModules || []).slice().sort(),
    o: body.options || {},
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    // Rate limit · sliding window 60 req/min/IP
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Rate limit exceeded · ลองใหม่ใน ${rl.resetSec} วินาที`, retryAfter: rl.resetSec },
        { status: 429, headers: { 'Retry-After': String(rl.resetSec), 'X-RateLimit-Remaining': '0' } }
      );
    }

    const body = await req.json();
    const { activityType, dateFrom, dateTo, peopleIds = [], activeModules, options = {} } = body;

    if (!activityType || !dateFrom || !dateTo || !Array.isArray(activeModules)) {
      return NextResponse.json({ error: "Missing required: activityType, dateFrom, dateTo, activeModules[]" }, { status: 400 });
    }

    // CACHE: ตรวจ in-memory cache (TTL 60s) · ลด DB load จาก concurrent traffic
    const ck = cacheKey(body);
    const cached = _ausCache.get(ck);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ ...cached.data, meta: { ...cached.data.meta, cache: 'hit', durationMs: Date.now() - startTime } });
    }

    // STEP 1: Load people profiles (best-effort · ไม่ fail ถ้าไม่มี)
    const profiles = await loadPersonProfiles(peopleIds);
    const customer = profiles[0] || null;
    const avoidZodiacs = collectClashZodiacs(profiles);

    // STEP 2: ดึง candidates จาก aj_ephemeris_cache
    // options.hardModules ใช้สำหรับ layer ที่ต้องตัดจริงเท่านั้น; activeModules ใช้จัดคะแนนทั้งหมด
    const universalActive = activeModules.filter((m: ModuleKey) => UNIVERSAL_MODULES.includes(m));
    const hardModules = Array.isArray(options.hardModules)
      ? options.hardModules.filter((m: ModuleKey) => UNIVERSAL_MODULES.includes(m))
      : universalActive;
    const applyPersonHard = Array.isArray(options.hardModules) && options.hardModules.includes("ba_zi");
    const baseTotal = await countEphemerisBase(dateFrom, dateTo);
    const personalAvoidZodiacs = applyPersonHard ? avoidZodiacs : [];
    const candidates = await queryEphemerisCandidates(dateFrom, dateTo, personalAvoidZodiacs, hardModules, options.scanLimit ?? 360);

    // STEP 3: Funnel stats
    const funnelStats = await buildFunnelStats(dateFrom, dateTo, personalAvoidZodiacs);
    funnelStats.finalCount = candidates.length;
    (funnelStats as any).baseTotal = baseTotal || funnelStats.total;
    (funnelStats as any).personCut = Math.max(0, (baseTotal || funnelStats.total) - funnelStats.total);
    (funnelStats as any).personHard = applyPersonHard;

    // STEP 4: Late hydration · personal modules (top 50)
    const personalActive = activeModules.filter((m: ModuleKey) => PERSONAL_MODULES.includes(m));
    let cacheHits = 0, cacheMisses = 0;
    if (customer && personalActive.length > 0) {
      const top = candidates.slice(0, 50);
      for (const cand of top) {
        const cached = await getPersonalCache(customer.personId, cand.id);
        if (cached) {
          cacheHits++;
          for (const m of personalActive) (cand.modules as any)[m] = (cached as any)[m];
        } else {
          cacheMisses++;
          // Lazy compute 3 personal modules
          const personal = computePersonalModules(cand, customer);
          for (const m of personalActive) (cand.modules as any)[m] = (personal as any)[m];
          // savePersonalCache (best-effort · async fire-and-forget)
          savePersonalCache(customer, cand, personal).catch(() => {});
        }
      }
    }

    // STEP 5: Enrich · sort
    const enriched = candidates
      .map(c => enrichCandidate(c, activeModules, activityType as ActivityType))
      .filter(c => !options.minScore || (c.scoring?.finalScore ?? 0) >= options.minScore)
      .sort((a, b) => (b.scoring?.finalScore ?? 0) - (a.scoring?.finalScore ?? 0))
      .slice(0, options.limit ?? 50);

    // STEP 6: Audit log
    const durationMs = Date.now() - startTime;
    try {
      await q(
        `INSERT INTO aj_search_audit (person_id, activity_type, date_from, date_to, people_ids, active_modules, funnel_stats, results_count, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [customer?.personId || null, activityType, dateFrom, dateTo, peopleIds, activeModules, JSON.stringify(funnelStats), enriched.length, durationMs]
      );
    } catch { /* audit table อาจจะยังไม่มี · ignore */ }

    const response: SearchResponse = {
      candidates: enriched,
      funnelStats,
      meta: { durationMs, cacheHits, cacheMisses, cache: 'miss' } as any,
    };
    // Save cache + evict ถ้าเกิน 1000 entries
    _ausCache.set(ck, { data: response, expires: Date.now() + AUS_TTL });
    if (_ausCache.size > 1000) {
      const oldest = [..._ausCache.entries()].sort((a,b) => a[1].expires - b[1].expires).slice(0, 100);
      for (const [k] of oldest) _ausCache.delete(k);
    }
    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/auspicious]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

async function countEphemerisBase(dateFrom: string, dateTo: string): Promise<number> {
  try {
    const r = await q1<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM aj_ephemeris_cache WHERE date BETWEEN $1 AND $2`,
      [dateFrom, dateTo]
    );
    return r?.total || 0;
  } catch { return 0; }
}

async function loadPersonProfiles(personIds: string[]): Promise<PersonProfile[]> {
  if (!personIds.length) return [];
  try {
    const rows = await q<{ person_id: string; birth_datetime: string;
      year_pillar: string; month_pillar: string; day_pillar: string; hour_pillar: string | null;
      day_master: string; zodiac: string; yong_shen: string[] | null; ji_shen: string[] | null }>(
      `SELECT person_id, birth_datetime::text, year_pillar, month_pillar, day_pillar, hour_pillar,
              day_master, zodiac, yong_shen, ji_shen FROM aj_user_profiles WHERE person_id = ANY($1)`,
      [personIds]
    );
    // ⚠️ char(N) ใน Postgres pad space ท้าย · ต้อง trim ทุก field
    const T = (s: any) => (typeof s === 'string' ? s.trim() : s);
    return rows.map(r => ({
      personId: r.person_id,
      name: r.person_id,
      birthDatetime: r.birth_datetime,
      birthTimezone: "Asia/Bangkok",
      pillars: {
        year:  { stem: T(r.year_pillar)?.[0],  branch: T(r.year_pillar)?.[1]  } as any,
        month: { stem: T(r.month_pillar)?.[0], branch: T(r.month_pillar)?.[1] } as any,
        day:   { stem: T(r.day_pillar)?.[0],   branch: T(r.day_pillar)?.[1]   } as any,
        hour: T(r.hour_pillar) ? { stem: T(r.hour_pillar)?.[0], branch: T(r.hour_pillar)?.[1] } as any : null as any,
      },
      dayMaster: T(r.day_master) as any,
      zodiac: T(r.zodiac) as any,
      yongShen: (r.yong_shen || []).map(T) as any,
      jiShen: (r.ji_shen || []).map(T) as any,
    }));
  } catch (e) { console.warn('[loadPersonProfiles]', (e as Error).message); return []; }
}

function collectClashZodiacs(profiles: PersonProfile[]): string[] {
  const set = new Set<string>();
  for (const p of profiles) {
    const z = p.zodiac;
    if (z && ZODIAC_CLASH_MAP[z]) set.add(ZODIAC_CLASH_MAP[z]);
  }
  return Array.from(set);
}

async function queryEphemerisCandidates(
  dateFrom: string, dateTo: string, avoidZodiacs: string[],
  universalActive: ModuleKey[], limit: number
): Promise<CandidateSlot[]> {
  // ถ้า aj_ephemeris_cache ว่าง → คืน [] (frontend จะแสดง funnel stats เท่านั้น)
  // จะมีข้อมูลหลังจากรัน /api/cron/build-ephemeris (Phase C)
  const moduleFilters = universalActive
    .filter(m => UNIVERSAL_MODULES.includes(m))
    .map(m => `(${m} ->> 'pass')::boolean IS NOT FALSE`)
    .join(" AND ");

  const params: any[] = [dateFrom, dateTo];
  let zodiacClause = "";
  if (avoidZodiacs.length > 0) {
    // pad ทุกตัวให้เป็น char(2) ก่อนเทียบ (DB เก็บ char(2) array · pad space ท้าย)
    params.push(avoidZodiacs.map(z => z.length < 2 ? z + ' ' : z));
    zodiacClause = `AND NOT (zodiac_clash && $${params.length}::char(2)[])`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const sql = `
    SELECT id, date::text AS date, shichen, datetime_start::text AS datetime_start,
           datetime_end::text AS datetime_end,
           year_pillar, month_pillar, day_pillar, hour_pillar, hour_branch,
           solar_term, zodiac_clash, universal_score,
           ze_ri, twelve_officers, twenty_eight, twelve_spirits,
           nine_stars, tai_sui, qi_men, he_luo
    FROM aj_ephemeris_cache
    WHERE date BETWEEN $1 AND $2
      ${zodiacClause}
      ${moduleFilters ? `AND ${moduleFilters}` : ""}
    ORDER BY universal_score DESC NULLS LAST, datetime_start
    LIMIT ${limitParam}
  `;
  try { return (await q<any>(sql, params)).map(rowToCandidate); }
  catch (e) { console.warn("[auspicious] cache empty or error:", (e as Error).message); return []; }
}

function rowToCandidate(r: any): CandidateSlot {
  const [yS, yB] = [r.year_pillar?.[0], r.year_pillar?.[1]];
  const [mS, mB] = [r.month_pillar?.[0], r.month_pillar?.[1]];
  const [dS, dB] = [r.day_pillar?.[0], r.day_pillar?.[1]];
  const [hS, hB] = [r.hour_pillar?.[0], r.hour_pillar?.[1]];
  return {
    id: String(r.id),
    datetime: { start: r.datetime_start, end: r.datetime_end, timezone: "Asia/Bangkok" },
    calendar: {
      gregorianDate: r.date, solarTerm: r.solar_term || undefined,
      shichen: r.shichen, shichenBranch: hB as any,
    },
    pillars: {
      year:  { stem: yS, branch: yB } as any,
      month: { stem: mS, branch: mB } as any,
      day:   { stem: dS, branch: dB } as any,
      hour:  { stem: hS, branch: hB } as any,
    },
    zodiacClash: (r.zodiac_clash || []) as any,
    people: [],
    modules: {
      ze_ri: r.ze_ri, twelve_officers: r.twelve_officers, twenty_eight: r.twenty_eight,
      twelve_spirits: r.twelve_spirits, nine_stars: r.nine_stars, tai_sui: r.tai_sui,
      qi_men: r.qi_men, he_luo: r.he_luo,
    } as any,
    scoring: undefined as any,
    display: undefined as any,
  };
}

async function buildFunnelStats(dateFrom: string, dateTo: string, avoidZodiacs: string[]): Promise<FunnelStats> {
  const params: any[] = [dateFrom, dateTo];
  let zodiacClause = "";
  if (avoidZodiacs.length > 0) {
    params.push(avoidZodiacs.map(z => z.length < 2 ? z + ' ' : z));
    zodiacClause = `AND NOT (zodiac_clash && $${params.length}::char(2)[])`;
  }

  const sql = `
    WITH base AS (SELECT * FROM aj_ephemeris_cache WHERE date BETWEEN $1 AND $2 ${zodiacClause})
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE (ze_ri->>'pass')::boolean IS NOT FALSE)::int AS ze_ri_pass,
      COUNT(*) FILTER (WHERE (twelve_officers->>'pass')::boolean IS NOT FALSE)::int AS officers_pass,
      COUNT(*) FILTER (WHERE (twenty_eight->>'pass')::boolean IS NOT FALSE)::int AS const_pass,
      COUNT(*) FILTER (WHERE (twelve_spirits->>'pass')::boolean IS NOT FALSE)::int AS spirits_pass,
      COUNT(*) FILTER (WHERE (nine_stars->>'pass')::boolean IS NOT FALSE)::int AS stars_pass,
      COUNT(*) FILTER (WHERE (tai_sui->>'pass')::boolean IS NOT FALSE)::int AS taisui_pass,
      COUNT(*) FILTER (WHERE (qi_men->>'pass')::boolean IS NOT FALSE)::int AS qimen_pass,
      COUNT(*) FILTER (WHERE (he_luo->>'pass')::boolean IS NOT FALSE)::int AS heluo_pass
    FROM base
  `;
  try {
    const r = await q1<any>(sql, params);
    if (!r) return { total: 0, finalCount: 0, perModule: {} as any };
    const t = r.total || 0;
    return {
      total: t, finalCount: 0,
      perModule: {
        ze_ri: { passed: r.ze_ri_pass, failed: t - r.ze_ri_pass },
        twelve_officers: { passed: r.officers_pass, failed: t - r.officers_pass },
        twenty_eight: { passed: r.const_pass, failed: t - r.const_pass },
        twelve_spirits: { passed: r.spirits_pass, failed: t - r.spirits_pass },
        nine_stars: { passed: r.stars_pass, failed: t - r.stars_pass },
        tai_sui: { passed: r.taisui_pass, failed: t - r.taisui_pass },
        qi_men: { passed: r.qimen_pass, failed: t - r.qimen_pass },
        he_luo: { passed: r.heluo_pass, failed: t - r.heluo_pass },
      } as any,
    };
  } catch { return { total: 0, finalCount: 0, perModule: {} as any }; }
}

async function getPersonalCache(personId: string, ephemerisId: string): Promise<Record<string, ModuleResult> | null> {
  try {
    const r = await q1<{ ba_zi: ModuleResult; yong_shen: ModuleResult; hex64: ModuleResult }>(
      `SELECT ba_zi, yong_shen, hex64 FROM aj_personal_cache WHERE person_id=$1 AND ephemeris_id=$2 AND expires_at > NOW()`,
      [personId, ephemerisId]
    );
    return r ? { ba_zi: r.ba_zi, yong_shen: r.yong_shen, hex64: r.hex64 } : null;
  } catch { return null; }
}

function enrichCandidate(c: CandidateSlot, activeModules: ModuleKey[], activity: ActivityType): CandidateSlot {
  const scoring = combineScores(c.modules as any, activeModules, activity);
  const qm = (c.modules as any)?.qi_men;
  if (activeModules.includes("qi_men") && (qm?.pass === false || qm?.raw?.bad_door === true)) {
    scoring.finalScore = Math.min(scoring.finalScore, 49);
    scoring.tier = scoreToTier(scoring.finalScore);
    scoring.action = tierToAction(scoring.tier, scoring.warnings.length);
    scoring.reasonsDown.unshift({
      code: "QM_BAD_DOOR_CAP",
      thai: "ประตูฉีเหมินไม่เหมาะ · จำกัดคะแนนสูงสุด",
      delta: -30,
      source: "qi_men",
      severity: "warning",
    } as any);
  }
  c.scoring = scoring;
  const tierMeta = TIER_LABELS[scoring.tier];
  c.display = {
    badges: [{ label: tierMeta?.thai || scoring.tier, color: tierMeta?.color || "#999", emoji: tierMeta?.emoji || "" } as any],
    summary: (scoring as any).summary || "",
    guardrails: [],
  };
  return c;
}

// ─── Personal Modules · ba_zi · yong_shen · hex64 ────────────────
const _CLASH: Record<string, string> = {子:'午',丑:'未',寅:'申',卯:'酉',辰:'戌',巳:'亥',午:'子',未:'丑',申:'寅',酉:'卯',戌:'辰',亥:'巳'};
const _STEM_EL: Record<string, string> = {甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'};
const _BR_EL: Record<string, string> = {寅:'wood',卯:'wood',巳:'fire',午:'fire',辰:'earth',戌:'earth',丑:'earth',未:'earth',申:'metal',酉:'metal',亥:'water',子:'water'};

function _result(key: string, score: number, tags: string[], up: any[], down: any[], conf=0.85, raw={}): ModuleResult {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return { module: key as any, status: 'ready', score: { raw: s, normalized: s, weight: 1.0 },
    pass: s >= 40, tags, reasons: { up, down, warning: [] }, confidence: conf, raw } as any;
}

function computePersonalModules(slot: CandidateSlot, customer: PersonProfile) {
  const sP = slot.pillars; const cZ = (customer as any).zodiac as string;
  const cDM = (customer as any).dayMaster as string;
  const cYS: string[] = (customer as any).yongShen || [];

  // ── ba_zi · ปะทะระหว่าง slot pillars vs customer ───────
  let baziScore = 75; const bTags: string[] = []; const bUp: any[] = []; const bDown: any[] = [];
  let baziStatus = 'neutral';
  if (_CLASH[sP.day.branch] === cZ) { baziScore -= 25; bTags.push('clash_zodiac'); bDown.push({code:'CLASH_Z', thai:`⚠ ${sP.day.branch}沖${cZ}日`, delta:-25}); baziStatus='clash'; }
  if (_CLASH[sP.hour.branch] === cZ) { baziScore -= 15; bTags.push('clash_z_hour'); bDown.push({code:'CLASH_ZH', thai:`⚠ ${sP.hour.branch}沖${cZ}時`, delta:-15}); baziStatus='clash'; }
  if (sP.day.branch === cZ) { baziScore += 10; bTags.push('same_zodiac'); bUp.push({code:'SAME_Z', thai:`✨ ${cZ}日同`, delta:10}); baziStatus='same'; }
  const SANHE = [['申','子','辰'],['寅','午','戌'],['巳','酉','丑'],['亥','卯','未']];
  for (const grp of SANHE) {
    if (grp.includes(cZ) && grp.includes(sP.day.branch) && cZ !== sP.day.branch) {
      baziScore += 12; bTags.push('sanhe_z'); bUp.push({code:'SANHE_Z', thai:`🤝 三合${grp.join('')}`, delta:12}); baziStatus='sanhe'; break;
    }
  }
  // 16 พ.ค.: ใส่ info tag ทุกครั้ง · ให้เจ้านายเห็นแม้ neutral
  if (baziStatus === 'neutral') bUp.push({code:'BAZI_NEUTRAL', thai:`八字 ${sP.day.branch}日 · ไม่ปะทะ`, delta:0});
  const ba_zi = _result('ba_zi', baziScore, bTags, bUp, bDown, 0.85, { customer_zodiac: cZ, slot_day: sP.day.branch, status: baziStatus });

  // ── yong_shen · slot day stem element ตรงกับ customer yongshen หรือไม่ ───
  let ysScore = 60; const yTags: string[] = []; const yUp: any[] = []; const yDown: any[] = [];
  const slotDayEl = _STEM_EL[sP.day.stem];
  const slotHourEl = _STEM_EL[sP.hour.stem];
  const EL_TH: Record<string,string> = { wood:'ไม้', fire:'ไฟ', earth:'ดิน', metal:'ทอง', water:'น้ำ' };
  if (cYS.length === 0) {
    yTags.push('no_yongshen'); ysScore = 60;
    yUp.push({code:'YS_NA', thai:'用神·ไม่มีข้อมูล', delta:0});
  } else {
    const cYSel = cYS.map(b => _BR_EL[b] || b).filter(Boolean);
    if (cYSel.includes(slotDayEl)) { ysScore += 25; yTags.push('day_match_ys'); yUp.push({code:'YS_DAY', thai:`⭐ 用神 日${EL_TH[slotDayEl]||slotDayEl} ตรง`, delta:25}); }
    if (cYSel.includes(slotHourEl)) { ysScore += 15; yTags.push('hour_match_ys'); yUp.push({code:'YS_HOUR', thai:`⭐ 用神 時${EL_TH[slotHourEl]||slotHourEl} ตรง`, delta:15}); }
    if (!cYSel.includes(slotDayEl) && !cYSel.includes(slotHourEl)) {
      ysScore -= 10; yTags.push('no_match');
      yDown.push({code:'NO_YS', thai:`用神·ไม่ตรง (用神 ${cYSel.map(e=>EL_TH[e]||e).join('/')}, สล็อต ${EL_TH[slotDayEl]||slotDayEl})`, delta:-10});
    }
  }
  const yong_shen = _result('yong_shen', ysScore, yTags, yUp, yDown, 0.8, { customer_ys: cYS, slot_day_el: slotDayEl, slot_hour_el: slotHourEl });

  // ── hex64 · derive from slot day + HOUR branch + customer zodiac · slot ต่างกัน hex ต่างกัน
  const hexNum = ((BRANCHES_ORDER_PERSONAL.indexOf(sP.day.branch) * 12 + BRANCHES_ORDER_PERSONAL.indexOf(sP.hour.branch) * 7 + BRANCHES_ORDER_PERSONAL.indexOf(cZ)) % 64) + 1;
  const yaoLine = ((BRANCHES_ORDER_PERSONAL.indexOf(sP.hour.branch) + BRANCHES_ORDER_PERSONAL.indexOf(sP.day.branch)) % 6) + 1;
  const HEX_NAMES: Record<number, string> = { 1:'乾',2:'坤',3:'屯',4:'蒙',5:'需',6:'訟',7:'師',8:'比',9:'小畜',10:'履',11:'泰',12:'否',13:'同人',14:'大有',15:'謙',16:'豫',17:'隨',18:'蠱',19:'臨',20:'觀',21:'噬嗑',22:'賁',23:'剝',24:'復',25:'無妄',26:'大畜',27:'頤',28:'大過',29:'坎',30:'離',31:'咸',32:'恆',33:'遯',34:'大壯',35:'晉',36:'明夷',37:'家人',38:'睽',39:'蹇',40:'解',41:'損',42:'益',43:'夬',44:'姤',45:'萃',46:'升',47:'困',48:'井',49:'革',50:'鼎',51:'震',52:'艮',53:'漸',54:'歸妹',55:'豐',56:'旅',57:'巽',58:'兌',59:'渙',60:'節',61:'中孚',62:'小過',63:'既濟',64:'未濟' };
  const HEX_GOOD = new Set([1,11,14,19,24,25,34,41,42,46,53,55,57,58,61]);
  const HEX_BAD = new Set([12,23,29,36,39,44,47,49,56]);
  let hexScore = 60; let hexLabel = '中';
  if (HEX_GOOD.has(hexNum)) { hexScore = 80 + (hexNum % 10); hexLabel = '吉'; }
  else if (HEX_BAD.has(hexNum)) { hexScore = 30 + (hexNum % 10); hexLabel = '凶'; }
  const hexName = HEX_NAMES[hexNum] || '?';
  const hTags = [`hex_${hexNum}`, `yao_line_${yaoLine}`];
  // 16 พ.ค.: ใส่ tag เสมอ · ดี/กลาง/เสีย เห็นในการ์ด
  const hUp = hexScore >= 70 ? [{code:'HEX_GOOD', thai:`📜 卦${hexNum} ${hexName} 爻${yaoLine}`, delta: hexScore-50}]
            : hexScore >= 50 ? [{code:'HEX_NEUTRAL', thai:`📜 卦${hexNum} ${hexName} 爻${yaoLine}`, delta: 0}]
            : [];
  const hDown = hexScore < 50 ? [{code:'HEX_BAD', thai:`⚠ 卦${hexNum} ${hexName} 爻${yaoLine}`, delta: hexScore-50}] : [];
  const hex64 = _result('hex64', hexScore, hTags, hUp, hDown, 0.7, { hex_num: hexNum, hex_name: hexName, changing_line: yaoLine, label: hexLabel });

  return { ba_zi, yong_shen, hex64 };
}
const BRANCHES_ORDER_PERSONAL = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

async function savePersonalCache(customer: PersonProfile, slot: CandidateSlot, personal: any): Promise<void> {
  try {
    const personalScore = Math.round((personal.ba_zi.score.normalized + personal.yong_shen.score.normalized + personal.hex64.score.normalized) / 3);
    await q(`
      INSERT INTO aj_personal_cache
        (person_id, ephemeris_id, day_master, yong_shen, ji_shen, ba_zi, yong_shen_match, hex64_personal, personal_score, expires_at)
      VALUES ($1, $2, $3, $4::char(2)[], $5::char(2)[], $6::jsonb, $7::jsonb, $8::jsonb, $9, NOW() + INTERVAL '24 hours')
      ON CONFLICT (person_id, ephemeris_id) DO UPDATE SET
        ba_zi=EXCLUDED.ba_zi, yong_shen_match=EXCLUDED.yong_shen_match, hex64_personal=EXCLUDED.hex64_personal,
        personal_score=EXCLUDED.personal_score, computed_at=NOW(), expires_at=NOW() + INTERVAL '24 hours'
    `, [
      customer.personId, parseInt(slot.id, 10), (customer as any).dayMaster,
      (customer as any).yongShen || [], (customer as any).jiShen || [],
      JSON.stringify(personal.ba_zi), JSON.stringify(personal.yong_shen), JSON.stringify(personal.hex64),
      personalScore,
    ]);
  } catch { /* best-effort · ignore */ }
}
