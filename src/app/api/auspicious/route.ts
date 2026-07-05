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
import type { ModuleKey, ActivityType, CandidateSlot, ModuleResult, VetoReason, FunnelStats, SearchResponse, PersonProfile } from "@/lib/luck-engine/types";
import { combineScores, scoreToTier, tierToAction, TIER_LABELS } from "@/lib/luck-engine/combineScores";
import { computeTianXing } from "@/lib/luck-engine/modules/tian-xing";
import { computeDongGong, DONGGONG_ACTIVITY_ALIASES } from "@/lib/luck-engine/modules/dong-gong";
import { computeMoonVoid } from "@/lib/luck-engine/modules/moon-void";
import { computeRetroWindow } from "@/lib/luck-engine/modules/retro-window";
import { computeEclipseZone } from "@/lib/luck-engine/modules/eclipse-zone";
import { computeRahuKalam } from "@/lib/luck-engine/modules/rahu-kalam";
import { computeMoonSign } from "@/lib/luck-engine/modules/moon-sign";
import { computePanchanga } from "@/lib/luck-engine/modules/panchanga";
import { computeTaraBala } from "@/lib/luck-engine/modules/tara-bala";
import { computeAgreement } from "@/lib/luck-engine/agreement";
import { normalizeEventLocation, buildTstBoundaryWarning } from "@/lib/luck-engine/event-location";
import type { EventLocation } from "@/lib/luck-engine/event-location";
import { huangDaoHour } from "@/lib/huangdao";
import { riChongDay } from "@/lib/richong";
import { dongGong } from "@/lib/donggong";
import { getActivityProfile, mergeProfileHardModules, resolveActivityType } from "@/lib/luck-engine/activity-profiles";
import { computeTongshuLiveForRow, buildTongshuModuleResults } from "@/lib/luck-engine/tongshu-live";
import type { ActivityProfile } from "@/lib/luck-engine/activity-profiles";
import { getSession } from "@/lib/auth";
import { SolarDay } from "tyme4ts";
import { KING_WEN } from "@/lib/heluo-astrology";
import { evaluateMonthDaySha } from "@/lib/luopan/month-day-sha";
import type { Dir8 } from "@/lib/luopan/mountains";

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
const DATEPICK_HARD_MODULES = new Set<ModuleKey>(["ze_ri", "tai_sui", "ba_zi", "qi_men"]);
const DONGGONG_SCORING_POLICY = "v1_overlay";
const DONGGONG_MODULE_POLICY = "v2_module_r367";
/* r372 · หมวด ② ท้องฟ้าจริง (opt-in ทั้งชุด · ไม่อยู่ใน UNIVERSAL/DATEPICK_HARD_MODULES —
   aj_ephemeris_cache ไม่มีคอลัมน์พวกนี้ · ตัดฤกษ์ผ่าน caps ใน combineScores เท่านั้น) */
const SKY_MODULE_KEYS: ModuleKey[] = ["moon_void", "retro_window", "eclipse_zone", "rahu_kalam", "moon_sign"];
const SKY_MODULE_SET = new Set<ModuleKey>(SKY_MODULE_KEYS);
const SKY_MODULE_POLICY = "v1_sky_r372";
/* r374 phase-3 · ปัญจางค์ + ตาราพละ (opt-in ทั้งคู่ · ไม่อยู่ใน UNIVERSAL/HARD/PERSONAL_MODULES —
   aj_ephemeris_cache/aj_personal_cache ไม่มีคอลัมน์พวกนี้ · ตัดฤกษ์ผ่าน caps เท่านั้น)
   panchanga = universal (ไม่ต้องมีโปรไฟล์) · tara_bala = personal (ไม่มีโปรไฟล์ → missing · ข้ามเงียบ ๆ) */
const PT_MODULE_KEYS: ModuleKey[] = ["panchanga", "tara_bala"];
const PT_MODULE_SET = new Set<ModuleKey>(PT_MODULE_KEYS);
const PT_MODULE_POLICY = "v1_panchanga_r374";
/* r417 · ยกเครื่องชั้นตัดสิน "ห้าม vs เลี่ยง" (เจ้านายเคาะ 5-6 ก.ค. 2569)
   ทงซู 通書 (破日/黑道) + ตงกง 董公 (คำนวณใน dong-gong.ts) + ฉีเหมิน avoidDoors ราย
   กิจกรรม = "ห้าม" (veto) — วันเสีย/ตำราห้ามเป็นสากลกับทุกคน → ตัดออกจากผลแนะนำจริง
   ดวงบุคคล (ba_zi/yong_shen ชง/刑/害) = "เลี่ยง" เท่านั้น (cap/warning) ห้าม veto — ไม่แตะ
   AUSPICIOUS_ACTIVITIES = กิจกรรมที่เลือกวันได้อิสระ (ทุกกิจกรรมยกเว้น 出行/求醫 ซึ่งเป็นงาน
   จำเป็นที่มักถูกบังคับเวลาจากภายนอก จึงลดจาก veto → warning ให้ยังพอมีตัวเลือก) */
const AUSPICIOUS_ACTIVITIES = new Set<ActivityType>(["立約", "動土", "搬家", "開市", "婚姻", "求財", "祭祀"]);
/** 12神煞 黑道六神 (凶) · ตรงกับ SPIRIT_NATURE คะแนนต่ำใน tongshu-live.ts/build-ephemeris.cjs
 *  ใช้ชื่อเทพตัดสิน (ไม่ใช้ threshold คะแนน) ให้ตรงตำรา — 勾陳 คะแนน 40 (ขอบ) ก็ยังเป็น黑道 */
const HEIDAO_SPIRITS = new Set(["天刑", "朱雀", "白虎", "天牢", "玄武", "勾陳"]);

/** r417 · เติม veto ลง ModuleResult (สำเนาใหม่ ห้าม mutate ของเดิม — อาจ share reference จาก cache) */
function withVeto(mr: ModuleResult, v: Omit<VetoReason, "source">): ModuleResult {
  return { ...mr, veto: [...(mr.veto || []), v] };
}

/** r417 · ทงซู 通書 ระดับ "ห้าม": วัน破 (建除) + ยาม黑道 (12神煞) กับกิจกรรมมงคล → veto
 *  出行/求醫 (ไม่อยู่ใน AUSPICIOUS_ACTIVITIES) ไม่ veto (คงเป็น warning เดิมจาก OFFICER_BAD/SPIRIT_BAD)
 *  อ่านค่าที่ module คำนวณไว้แล้วเท่านั้น (raw.officer/raw.spirit) — ไม่คำนวณใหม่ ไม่แตะ tyme4ts/cache
 *  ทำงานเหมือนกันทั้ง path cache เดิม และ path TONGSHU_LIVE=1 (shape raw ตรงกันเป๊ะ) */
function applyTongshuVeto(c: CandidateSlot, activity: ActivityType, activeModules: ModuleKey[]): CandidateSlot {
  if (!AUSPICIOUS_ACTIVITIES.has(activity)) return c; // 出行/求醫 → warning เดิม ไม่แตะ
  let modules = c.modules as any;
  let changed = false;

  if (activeModules.includes("twelve_officers")) {
    const officer = modules?.twelve_officers as ModuleResult | undefined;
    if (officer?.status === "ready" && officer.raw?.officer === "破") {
      modules = { ...modules, twelve_officers: withVeto(officer, {
        code: "TONGSHU_PO",
        reasonTh: "วันนี้เป็นวัน破ตาม12建除 (通書) — ตำราห้ามใช้งานมงคลในวันนี้",
        reasonEn: "This is a '破' (Po/Destruction) day per the twelve day-officers (Chinese almanac) — the classical text forbids auspicious activities today.",
        reasonZh: "今日值十二建除之「破日」— 通書明文忌用於吉事",
      }) };
      changed = true;
    }
  }

  if (activeModules.includes("twelve_spirits")) {
    const spirit = modules?.twelve_spirits as ModuleResult | undefined;
    const spiritName = spirit?.raw?.spirit as string | undefined;
    if (spirit?.status === "ready" && spiritName && HEIDAO_SPIRITS.has(spiritName)) {
      modules = { ...modules, twelve_spirits: withVeto(spirit, {
        code: "TONGSHU_HEIDAO",
        reasonTh: `ยามนี้ตรงกับ${spiritName} (ยามดำ 黑道) ตาม12神煞 (通書) — ไม่เหมาะกับงานมงคล`,
        reasonEn: `This hour falls under ${spiritName} (a "Black Path"/inauspicious deity among the twelve day-spirits) — unsuitable for auspicious events per the almanac.`,
        reasonZh: `本時值「${spiritName}」黑道凶神 — 通書忌用於吉事`,
      }) };
      changed = true;
    }
  }

  return changed ? { ...c, modules } : c;
}
function cacheKey(body: any): string {
  const options = body.options || {};
  // r367: dong_gong module state + พิกัดงาน (ปัด 2 ตำแหน่ง) เข้า key — additive fields only
  const dgModule = Array.isArray(body.activeModules) && body.activeModules.includes("dong_gong");
  const evLoc = normalizeEventLocation(options);
  // r372: สถานะ 5 sky modules เข้า key (additive field · module ปิดทั้งหมด = "off")
  const skyActive = Array.isArray(body.activeModules)
    ? body.activeModules.filter((m: ModuleKey) => SKY_MODULE_SET.has(m)).slice().sort()
    : [];
  // r374 phase-3: สถานะ panchanga/tara_bala เข้า key (additive field · ปิดทั้งคู่ = "off")
  const ptActive = Array.isArray(body.activeModules)
    ? body.activeModules.filter((m: ModuleKey) => PT_MODULE_SET.has(m)).slice().sort()
    : [];
  return JSON.stringify({
    dg: dgModule ? DONGGONG_MODULE_POLICY : DONGGONG_SCORING_POLICY,
    dgm: dgModule,
    sky: skyActive.length ? `${SKY_MODULE_POLICY}:${skyActive.join("+")}` : "off",
    pt: ptActive.length ? `${PT_MODULE_POLICY}:${ptActive.join("+")}` : "off",
    el: Math.round(evLoc.lat * 100) / 100,
    eg: Math.round(evLoc.lng * 100) / 100,
    a: body.activityType, ap: body.activityProfileKey || "", df: body.dateFrom, dt: body.dateTo,
    p: body.peopleIds || [], m: (body.activeModules || []).slice().sort(),
    o: options,
    td: options.targetDirection || options.target_direction || body.targetDirection || body.target_direction || "",
  });
}

function normalizeTargetDirection(v: unknown): Dir8 | null {
  const raw = String(v || "").trim().toUpperCase();
  return (["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(raw) ? raw : null) as Dir8 | null;
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
    const profileKeyInput = typeof body.activityProfileKey === "string" ? body.activityProfileKey.trim() : "";
    const activityProfile = getActivityProfile(profileKeyInput);
    if (profileKeyInput && !activityProfile) {
      return NextResponse.json({ error: "Unknown activityProfileKey" }, { status: 400 });
    }
    const resolvedActivityType = resolveActivityType(activityType, activityProfile);
    if (!resolvedActivityType) {
      return NextResponse.json({ error: "Unknown activityType" }, { status: 400 });
    }
    const targetDirection = normalizeTargetDirection(options.targetDirection ?? options.target_direction ?? body.targetDirection ?? body.target_direction);
    /* r367: สถานที่จัดงาน · validate ฝั่ง server · invalid → fallback กรุงเทพ + note ใน meta (ไม่ 400) */
    const eventLocation = normalizeEventLocation(options);
    /* r417: ผ่อนเกณฑ์ประตูฉีเหมิน avoidDoors จาก veto → กลับไปเป็น cap/warning เดิม (default false = veto ตามมาตรฐานใหม่) */
    const relaxDoors = options.relaxDoors === true;

    /* 1 มิ.ย. ปิด IDOR: ถ้าผูกดวงส่วนตัว (peopleIds) ต้อง login + กรองเหลือเฉพาะดวงใน org ตัวเอง (กันดึง/อ่าน cache ดวงคนอื่น) · ค้นฤกษ์ universal (ไม่มี peopleIds) ยังเปิด guest */
    let ownedPeopleIds: string[] = peopleIds;
    if (peopleIds.length > 0) {
      const s = await getSession();
      if (!s?.orgId) return NextResponse.json({ error: "not logged in" }, { status: 401 });
      const uuids = peopleIds.map((i: string) => String(i).replace(/^hk_/, "")).filter((u: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u));
      const rows = await q<{ id: string }>("SELECT id FROM profiles WHERE id = ANY($1::uuid[]) AND org_id=$2 AND is_archived=false", [uuids, s.orgId]).catch(() => []);
      const ok = new Set(rows.map(r => "hk_" + r.id));
      ownedPeopleIds = peopleIds.filter((i: string) => ok.has(i));
    }

    // CACHE: ตรวจ in-memory cache (TTL 60s) · ลด DB load จาก concurrent traffic
    const ck = cacheKey(body);
    const cached = _ausCache.get(ck);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ ...cached.data, meta: { ...cached.data.meta, cache: 'hit', durationMs: Date.now() - startTime } });
    }

    // STEP 1: Load people profiles (best-effort · ไม่ fail ถ้าไม่มี)
    const profiles = await loadPersonProfiles(ownedPeopleIds);
    const customer = profiles[0] || null;
    const avoidZodiacs = collectClashZodiacs(profiles);

    // STEP 2: ดึง candidates จาก aj_ephemeris_cache
    // options.hardModules ใช้สำหรับ layer ที่ต้องตัดจริงเท่านั้น; activeModules ใช้จัดคะแนนทั้งหมด
    const activeModuleKeys = activeModules.filter((m: ModuleKey) => ALL_MODULES.includes(m));
    const requestedHardModulesRaw = Array.isArray(options.hardModules)
      ? options.hardModules.filter((m: ModuleKey) =>
        ALL_MODULES.includes(m)
        && DATEPICK_HARD_MODULES.has(m)
        && (m !== "ba_zi" || ownedPeopleIds.length > 0)
      )
      : [];
    const requestedHardModules = qimenHardFilterModulesForDatepick(requestedHardModulesRaw);
    const mergedHardModules = mergeProfileHardModules({
      requestedHardModules,
      activeModules: activeModuleKeys,
      profile: activityProfile,
      hasPeople: ownedPeopleIds.length > 0,
    }).filter((m: ModuleKey) => DATEPICK_HARD_MODULES.has(m));
    const hardModules = qimenHardFilterModulesForDatepick(mergedHardModules);
    const sqlHardModules = hardModules.filter((m: ModuleKey) => UNIVERSAL_MODULES.includes(m));
    const applyPersonHard = hardModules.includes("ba_zi");
    const baseTotal = await countEphemerisBase(dateFrom, dateTo);
    const personalAvoidZodiacs = applyPersonHard ? avoidZodiacs : [];
    let candidates = await queryEphemerisCandidates(dateFrom, dateTo, personalAvoidZodiacs, sqlHardModules, options.scanLimit ?? 360);

    /* r413 · TONGSHU_LIVE=1 (kill switch): override 4 module 通書 (建除/黃黑道/28宿/紫白)
       ด้วยค่าคำนวณสดจาก tyme4ts แทนค่า cache ที่ผิด (audit 2 รอบ: 黃黑道ผิด 83% · 建除ขาด疊建 ·
       28宿 anchor ผิด · 紫白 day_branch%9 ผิด) · additive จุดเดียว หลังดึง candidates ·
       shape/สเกลคะแนน = เดิมเป๊ะ (tongshu-live.ts) · flag ปิด = พฤติกรรมเดิม 100% */
    if (process.env.TONGSHU_LIVE === "1") {
      candidates = candidates.map(c => applyTongshuLiveOverride(c));
    }

    // STEP 3: Funnel stats
    const funnelStats = await buildFunnelStats(dateFrom, dateTo, personalAvoidZodiacs);
    funnelStats.finalCount = candidates.length;
    (funnelStats as any).baseTotal = baseTotal || funnelStats.total;
    (funnelStats as any).personCut = Math.max(0, (baseTotal || funnelStats.total) - funnelStats.total);
    (funnelStats as any).personHard = applyPersonHard;

    // STEP 4: Late hydration · personal modules (top 50)
    const personalActive = activeModuleKeys.filter((m: ModuleKey) => PERSONAL_MODULES.includes(m));
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
    const baseScoreModules = qimenBaseScoreModulesForActivity(activeModuleKeys);
    /* r367: dong_gong module active → caps/reasons ไหลผ่าน combineScores (ทางเดียวกับ module อื่น)
       + boost บวก (+8/+6) หลัง guard · และ "ข้าม" applyDongGongOverlay กันนับซ้ำ
       module ปิด → เส้นทางเดิม (overlay) เหมือนเดิมทุกประการ */
    const dongGongModuleActive = activeModuleKeys.includes("dong_gong");
    /* r372: หมวด ② ท้องฟ้าจริง — แนบ ModuleResult ก่อน combineScores (จุดเดียวกับ dong_gong/tian_xing)
       caps ไหลผ่าน combineScores · enforceSkyCaps กดเพดานกลับหลัง profile/qimen/donggong shift
       module ปิดทุกตัว = ไม่แนบ = zero-effect (พฤติกรรมเดิมไม่เปลี่ยนแม้แต่ byte) */
    const skyModulesActive = activeModuleKeys.filter((m: ModuleKey) => SKY_MODULE_SET.has(m));
    /* r374 phase-3: ปัญจางค์+ตาราพละ — แนบจุดเดียวกับ sky · caps ไหลผ่าน combineScores + enforceSkyCaps
       module ปิดทั้งคู่ = ไม่แนบ = zero-effect (candidates byte-identical เดิม · regression r372 ต้องผ่าน) */
    const ptModulesActive = activeModuleKeys.filter((m: ModuleKey) => PT_MODULE_SET.has(m));
    const scoredAll = candidates
      .map(c => applyMonthDayShaRuntime(c, resolvedActivityType, targetDirection))
      .map(c => applyTianXing(c, activeModuleKeys, eventLocation))
      .map(c => applyDongGongModule(c, dongGongModuleActive, resolvedActivityType))
      .map(c => applySkyModules(c, skyModulesActive, resolvedActivityType, eventLocation))
      .map(c => applyPanchangaModules(c, ptModulesActive, resolvedActivityType, customer))
      /* r417: ทงซู破日/黑道 = "ห้าม" กับกิจกรรมมงคล → veto ก่อน combineScores (activeModules
         gate เดียวกับ module อื่น ๆ · 出行/求醫 ข้ามฟังก์ชันนี้ทั้งหมด ไม่มีผล) */
      .map(c => applyTongshuVeto(c, resolvedActivityType, activeModuleKeys))
      .map(c => enrichCandidate(c, baseScoreModules, resolvedActivityType))
      .map(c => applyActivityProfileRules(c, activityProfile, activeModuleKeys, targetDirection, relaxDoors))
      .map(c => applyQimenGenericGuard(c, activityProfile, activeModuleKeys))
      .map(c => dongGongModuleActive
        ? applyDongGongBoost(c)
        : applyDongGongOverlay(c, activeModuleKeys, resolvedActivityType))
      .map(c => enforceSkyCaps(c, skyModulesActive))
      /* r374: re-enforce เพดานของ phase-3 อีกชั้น (กลไกเดียวกับ sky · ปิด = zero-effect) */
      .map(c => enforceSkyCaps(c, ptModulesActive))
      .map(c => hideDongGongWhenInactive(c, activeModuleKeys))
      .map(c => ptModulesActive.length ? attachAgreement(c) : c)
      .map(refreshCandidateDisplay);

    /* r417: ระดับ "ห้าม" (veto) แยกออกจาก candidates แนะนำจริง → cutSlots (ยังส่งกลับให้อธิบายได้)
       ระดับ "เลี่ยง" (caps/warnings ทั่วไป · ดวงบุคคล) ยังอยู่ใน candidates ตามคะแนนปกติ (ไม่ตัด) */
    const vetoedAll = scoredAll.filter(c => ((c.scoring as any)?.vetoes?.length ?? 0) > 0);
    const passableAll = scoredAll.filter(c => ((c.scoring as any)?.vetoes?.length ?? 0) === 0);

    const enriched = passableAll
      .filter(c => !options.minScore || (c.scoring?.finalScore ?? 0) >= options.minScore)
      .sort((a, b) => (b.scoring?.finalScore ?? 0) - (a.scoring?.finalScore ?? 0))
      .slice(0, options.limit ?? 50);

    const cutSlots = vetoedAll
      .sort((a, b) => (b.scoring?.finalScore ?? 0) - (a.scoring?.finalScore ?? 0))
      .slice(0, options.limit ?? 50)
      .map(c => ({ ...c, vetoes: (c.scoring as any)?.vetoes || [] } as any));

    const allCut = enriched.length === 0 && cutSlots.length > 0;

    (funnelStats as any).vetoCut = vetoedAll.length;

    /* r367: ยามคาบเส้น ณ สถานที่งาน · เฉพาะ top results (perf) · แจ้งเตือนอย่างเดียว ห้ามแตะคะแนน */
    attachTstBoundaryWarnings(enriched, eventLocation);

    // STEP 6: Audit log
    const durationMs = Date.now() - startTime;
    try {
      await q(
        `INSERT INTO aj_search_audit (person_id, activity_type, date_from, date_to, people_ids, active_modules, funnel_stats, results_count, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [customer?.personId || null, activityProfile ? `${resolvedActivityType}:${activityProfile.key}` : resolvedActivityType, dateFrom, dateTo, ownedPeopleIds, activeModuleKeys, JSON.stringify(funnelStats), enriched.length, durationMs]
      );
    } catch { /* audit table อาจจะยังไม่มี · ignore */ }

    const response: SearchResponse = {
      candidates: enriched,
      /* r417: slot ที่โดน veto (ทงซู破日/黑道·ตงกง大凶/忌·ฉีเหมิน avoidDoors) — ไม่เข้า list แนะนำ */
      cutSlots,
      allCut,
      funnelStats,
      meta: {
        durationMs, cacheHits, cacheMisses, cache: 'miss',
        activityType: resolvedActivityType,
        activityProfile: activityProfile ? {
          key: activityProfile.key,
          labelTh: activityProfile.labelTh,
          labelZh: activityProfile.labelZh,
          category: activityProfile.category,
          qimenPurpose: activityProfile.qimenPurpose,
          safety: activityProfile.safety,
          profileMode: activityProfile.profileMode,
        } : null,
        qimenScoringPolicy: buildQimenDatepickPolicy(activityProfile, activeModuleKeys, targetDirection),
        donggongScoringPolicy: dongGongModuleActive ? DONGGONG_MODULE_POLICY : DONGGONG_SCORING_POLICY,
        /* r372: additive · บอก client ว่า sky modules ตัวไหนทำงาน */
        skyModules: skyModulesActive,
        skyScoringPolicy: skyModulesActive.length ? SKY_MODULE_POLICY : "off",
        /* r374 phase-3: additive "เฉพาะเมื่อเปิด" — ปิด = meta identical เดิม (regression r372 เทียบ meta byte ต่อ baseline) */
        ...(ptModulesActive.length ? { ptModules: ptModulesActive, ptScoringPolicy: PT_MODULE_POLICY } : {}),
        /* r367: บอก client ว่าใช้พิกัดไหนจริง + note ถ้า fallback (invalid coords → BKK · ไม่ 400) */
        eventLocation,
        hardModules,
        sqlHardModules,
        mergedHardModules,
        /* r417: ผ่อนเกณฑ์ประตูฉีเหมิน avoidDoors หรือไม่ (default false = veto ตามมาตรฐานใหม่) */
        relaxDoors,
      } as any,
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

/** เฟส B · 天星 opt-in: คำนวณ+แนบ "เฉพาะเมื่อ user ติ๊ก" (tian_xing ∈ active) · ไม่ติ๊ก = คืน c เดิม ไม่แตะ (zero-effect)
 *  r367: ส่งพิกัดสถานที่จัดงานจริงเข้า computeTianXing (ascendant เปลี่ยนตามพิกัด) */
function applyTianXing(c: CandidateSlot, activeModules: ModuleKey[], loc: EventLocation): CandidateSlot {
  if (!activeModules.includes("tian_xing")) return c;
  try {
    const tx = computeTianXing(c, loc.lat, loc.lng);
    return { ...c, modules: { ...(c.modules as any), tian_xing: tx } };
  } catch { return c; }
}

/** r367 · 董公 opt-in module: แนบ ModuleResult ก่อน combineScores (caps/reasons ไหลทาง combineScores)
 *  module ปิด = ไม่แนบ = zero-effect (เส้นทาง overlay เดิมทำงานเหมือนเดิม) */
function applyDongGongModule(c: CandidateSlot, active: boolean, activity: ActivityType): CandidateSlot {
  if (!active) return c;
  try {
    const dgResult = computeDongGong(c, activity);
    return { ...c, modules: { ...(c.modules as any), dong_gong: dgResult } };
  } catch { return c; }
}

/** r372 · หมวด ② ท้องฟ้าจริง opt-in: แนบ ModuleResult ก่อน combineScores (ทางเดียวกับ dong_gong/tian_xing)
 *  แนบ "เฉพาะตัวที่ user ติ๊ก" (skyActive = activeModules ∩ SKY_MODULE_KEYS) · ไม่ติ๊ก = ไม่แนบ = zero-effect
 *  eventLocation → rahu_kalam (sunrise/sunset จริง ณ สถานที่งาน) + moon_void (บันทึก raw · VoC เป็น geocentric)
 *  module เดียวพัง (throw) = ข้ามตัวนั้น ห้ามล้มทั้ง response */
function applySkyModules(c: CandidateSlot, skyActive: ModuleKey[], activity: ActivityType, loc: EventLocation): CandidateSlot {
  if (!skyActive.length) return c;
  const out: CandidateSlot = { ...c, modules: { ...(c.modules as any) } };
  const attach = (key: ModuleKey, fn: () => ModuleResult) => {
    if (!skyActive.includes(key)) return;
    try { (out.modules as any)[key] = fn(); } catch { /* best-effort */ }
  };
  attach("moon_void", () => computeMoonVoid(out, activity, loc));
  attach("retro_window", () => computeRetroWindow(out, activity));
  attach("eclipse_zone", () => computeEclipseZone(out, activity));
  attach("rahu_kalam", () => computeRahuKalam(out, activity, loc));
  attach("moon_sign", () => computeMoonSign(out, activity));
  return out;
}

/** r374 phase-3 · ปัญจางค์+ตาราพละ opt-in: แนบ ModuleResult ก่อน combineScores (จุดเดียวกับ sky r372)
 *  panchanga = universal (geocentric · ไม่ต้องมีโปรไฟล์/พิกัด)
 *  tara_bala = personal · ไม่มีโปรไฟล์หรือ parse วันเกิดไม่ได้ → computeTaraBala คืน "missing"
 *              (combineScores ข้าม missing = zero-effect · skip gracefully)
 *  module ปิดทั้งคู่ = ไม่แนบ = คืน c เดิม (พฤติกรรมเดิมไม่เปลี่ยนแม้แต่ byte)
 *  ตัวเดียวพัง (throw) = ข้ามตัวนั้น ห้ามล้มทั้ง response */
function applyPanchangaModules(c: CandidateSlot, ptActive: ModuleKey[], activity: ActivityType, customer: PersonProfile | null): CandidateSlot {
  if (!ptActive.length) return c;
  const out: CandidateSlot = { ...c, modules: { ...(c.modules as any) } };
  if (ptActive.includes("panchanga")) {
    try { (out.modules as any).panchanga = computePanchanga(out, activity); } catch { /* best-effort */ }
  }
  if (ptActive.includes("tara_bala")) {
    try { (out.modules as any).tara_bala = computeTaraBala(out, activity, customer); } catch { /* best-effort */ }
  }
  return out;
}

/** r374 phase-3 · ป้ายเห็นพ้องข้ามศาสตร์ (deterministic · ไม่มี AI · นับจาก ModuleResult 4 สาย)
 *  additive field `agreement` ต่อ candidate — route แนบ "เฉพาะเมื่อ module phase-3 เปิด"
 *  (ปิด = candidates byte-identical เดิม · regression test-datepick-sky-r372 เทียบ byte ต้องผ่านต่อ) */
function attachAgreement(c: CandidateSlot): CandidateSlot {
  if (!c.scoring) return c;
  try { (c as any).agreement = computeAgreement(c); } catch { /* best-effort · ห้ามล้มทั้ง response */ }
  return c;
}

/** r372 · re-enforce เพดานของ sky modules (ตำแหน่งท้าย pipeline = คำสุดท้ายของชั้นท้องฟ้า
 *  แบบเดียวกับ applyDongGongBoost ที่กด cap ตงกงกลับ)
 *  combineScores apply caps รอบแรกแล้ว แต่ profile/qimen rules + dong_gong boost ที่รันทีหลัง
 *  อาจ shift คะแนนทะลุเพดาน → กดกลับ (dedupe ด้วย cap code · ฝั่งลบไม่หัก delta ซ้ำ)
 *  module ปิด = ไม่มี ModuleResult แนบ = คืน c เดิม (zero-effect) */
function enforceSkyCaps(c: CandidateSlot, skyActive: ModuleKey[]): CandidateSlot {
  if (!skyActive.length || !c.scoring) return c;
  let minCap: number | null = null;
  let capRule: any = null;
  for (const key of skyActive) {
    const mr = (c.modules as any)?.[key] as ModuleResult | undefined;
    if (!mr || mr.status !== "ready") continue;
    for (const cap of mr.caps || []) {
      const v = Number((cap as any)?.value);
      if ((cap as any)?.type === "max" && Number.isFinite(v) && (minCap == null || v < minCap)) {
        minCap = v;
        capRule = cap;
      }
    }
  }
  if (minCap == null) return c;
  const scoring = c.scoring as any;
  if (Number(scoring.finalScore) <= minCap) return c;
  scoring.reasonsDown = scoring.reasonsDown || [];
  const capCode = String(capRule?.code || "SKY_CAP");
  if (!scoring.reasonsDown.some((r: any) => r.code === capCode)) {
    scoring.reasonsDown.unshift({
      code: capCode,
      thai: String(capRule?.reason || `ชั้นท้องฟ้าจำกัดเพดานคะแนน ${minCap}`),
      delta: minCap - Number(scoring.finalScore),
      source: capRule?.source || "moon_void",
      severity: "warning",
    });
  }
  scoring.finalScore = Math.max(0, Math.min(100, Math.round(minCap)));
  scoring.tier = scoreToTier(scoring.finalScore);
  scoring.action = tierToAction(scoring.tier, scoring.warnings?.length || 0);
  return c;
}

/** r367 · 董公 boost + re-enforce caps (ตำแหน่งเดียวกับ overlay เดิม = คำสุดท้ายของชั้นตงกง)
 *  1) บวกคะแนนวันดี (+8 verdict / +6 yi-match): weight ของ dong_gong ใน weights matrix = 0
 *     → weighted average ไม่ขยับเอง จึงบวก delta ตรงนี้ · เคารพ ceiling เดิม
 *     (caps type max/absolute + guard-cap) แบบเดียวกับ overlay · ห้ามดันทะลุ cap
 *  2) re-enforce caps ของ module (大凶≤30 · 凶/忌≤45): combineScores apply แล้วรอบแรก
 *     แต่ profile/qimen rules ที่รันหลังจากนั้นอาจ shift ขึ้น → กดกลับตรงนี้ (กันนับซ้ำด้วย code dedupe)
 *  ฝั่งลบไม่หัก delta ซ้ำ — 大凶/凶/忌 ตัดผ่าน caps เท่านั้น */
function applyDongGongBoost(c: CandidateSlot): CandidateSlot {
  const dgResult = (c.modules as any)?.dong_gong as ModuleResult | undefined;
  if (!c.scoring || !dgResult || dgResult.status !== "ready") return c;
  const scoring = c.scoring as any;
  scoring.moduleScores = { ...(scoring.moduleScores || {}), dong_gong: dgResult.score.normalized };

  const dgCaps = (dgResult.caps || []).filter((cap: any) => cap?.type === "max" && Number.isFinite(Number(cap?.value)));
  const dgCapValue = dgCaps.length ? Math.min(...dgCaps.map((cap: any) => Number(cap.value))) : null;

  const positiveDelta = (dgResult.reasons?.up || []).reduce((s, r) => s + Math.max(0, r.delta || 0), 0);
  if (positiveDelta > 0 && dgCapValue == null) {
    const startScore = Number(scoring.finalScore) || 0;
    const hasExistingGuardCap = (scoring.reasonsDown || []).some((r: any) => String(r.code || "").includes("CAP"));
    let positiveCeiling = hasExistingGuardCap ? startScore : 100;
    for (const cap of scoring.caps || []) {
      const value = Number(cap?.value);
      if ((cap?.type === "max" || cap?.type === "absolute") && Number.isFinite(value)) {
        positiveCeiling = Math.min(positiveCeiling, value);
      }
    }
    const nextScore = Math.min(startScore + positiveDelta, positiveCeiling);
    if (nextScore > startScore) scoring.finalScore = nextScore;
  }

  if (dgCapValue != null && Number(scoring.finalScore) > dgCapValue) {
    // profile/qimen rules อาจดันคะแนนทะลุเพดานตงกงหลัง combineScores → กดกลับ
    scoring.reasonsDown = scoring.reasonsDown || [];
    const capRule: any = dgCaps.find((cap: any) => Number(cap.value) === dgCapValue) || dgCaps[0];
    const capCode = String(capRule?.code || "DONGGONG_CAP");
    if (!scoring.reasonsDown.some((r: any) => r.code === capCode)) {
      scoring.reasonsDown.unshift({
        code: capCode,
        thai: String(capRule?.reason || `ตงกงจำกัดเพดานคะแนน ${dgCapValue}`),
        delta: dgCapValue - Number(scoring.finalScore),
        source: "dong_gong",
        severity: "warning",
      });
    }
    scoring.finalScore = dgCapValue;
  }

  scoring.finalScore = Math.max(0, Math.min(100, Math.round(Number(scoring.finalScore) || 0)));
  scoring.tier = scoreToTier(scoring.finalScore);
  scoring.action = tierToAction(scoring.tier, scoring.warnings?.length || 0);
  return c;
}

/** r367 · ยามคาบเส้น ณ สถานที่งาน (top results เท่านั้น · mutate warnings อย่างเดียว · คะแนนคงเดิม) */
function attachTstBoundaryWarnings(cands: CandidateSlot[], loc: EventLocation): void {
  for (const c of cands) {
    try {
      if (!c.scoring) continue;
      const warn = buildTstBoundaryWarning({
        startUtc: c.datetime?.start || "",
        endUtc: c.datetime?.end || null,
        cacheShichen: c.calendar?.shichen ?? NaN,
        loc,
      });
      if (!warn) continue;
      const scoring = c.scoring as any;
      scoring.warnings = scoring.warnings || [];
      if (!scoring.warnings.some((r: any) => r.code === "TST_HOUR_BOUNDARY")) {
        scoring.warnings.push(warn);
      }
    } catch { /* best-effort · ห้ามล้มทั้ง response */ }
  }
}

function applyMonthDayShaRuntime(c: CandidateSlot, activity: ActivityType, targetDirection: Dir8 | null): CandidateSlot {
  const zeRi = (c.modules as any)?.ze_ri as ModuleResult | undefined;
  if (!zeRi || !c.pillars?.month?.branch || !c.pillars?.day?.branch) return c;

  const patch = evaluateMonthDaySha({
    monthBranch: c.pillars.month.branch as any,
    dayBranch: c.pillars.day.branch as any,
    activityType: activity,
    targetDirection,
  });
  if (!patch.tags.length && !patch.reasons.warning.length) return c;

  const existingTags = new Set(zeRi.tags || []);
  const existingCodes = new Set([
    ...(zeRi.reasons?.up || []),
    ...(zeRi.reasons?.down || []),
    ...(zeRi.reasons?.warning || []),
  ].map((r) => r.code));
  const next: ModuleResult = {
    ...zeRi,
    tags: [...(zeRi.tags || [])],
    reasons: {
      up: [...(zeRi.reasons?.up || [])],
      down: [...(zeRi.reasons?.down || [])],
      warning: [...(zeRi.reasons?.warning || [])],
      neutral: zeRi.reasons?.neutral ? [...zeRi.reasons.neutral] : undefined,
    },
    caps: [...(zeRi.caps || [])],
    raw: { ...(zeRi.raw || {}) },
    score: { ...(zeRi.score || { raw: 50, normalized: 50, weight: 1 }) },
  };

  let delta = 0;
  let addedFail = false;
  for (const tag of patch.tags) {
    if (!existingTags.has(tag)) {
      next.tags.push(tag);
      existingTags.add(tag);
    }
  }
  const addReasons = (bucket: "up" | "down" | "warning") => {
    for (const reason of patch.reasons[bucket] || []) {
      if (existingCodes.has(reason.code)) continue;
      next.reasons[bucket].push(reason);
      existingCodes.add(reason.code);
      delta += reason.delta || 0;
      if (reason.severity === "critical" && (reason.delta || 0) < 0) addedFail = true;
    }
  };
  addReasons("up");
  addReasons("down");
  addReasons("warning");
  for (const cap of patch.caps || []) {
    if (next.caps?.some((x) => x.reason === cap.reason && x.value === cap.value)) continue;
    next.caps?.push(cap);
    addedFail = true;
  }
  next.score.raw = (Number(next.score.raw) || Number(next.score.normalized) || 50) + delta;
  next.score.normalized = Math.max(0, Math.min(100, next.score.raw));
  if (addedFail) next.pass = false;
  next.raw.monthDaySha = { ...patch.raw, targetDirection, appliedRuntime: true };
  return { ...c, modules: { ...(c.modules as any), ze_ri: next } };
}

// ─── Helpers ───────────────────────────────────────────────────────

/** r413 · override 4 module 通書 ต่อ candidate ด้วยค่าสด tyme4ts (memoized ต่อวัน)
 *  - เทียบ 干支 วันของแถว (day_pillar) กันแถว shichen=0 (晚子時) ที่ cache ผูกกับวันถัดไป
 *  - พังตัวไหน (throw) = คืน candidate เดิมทั้งใบ ห้ามล้ม response (best-effort เหมือน module อื่น) */
function applyTongshuLiveOverride(c: CandidateSlot): CandidateSlot {
  try {
    const rowGz = `${c.pillars?.day?.stem || ""}${c.pillars?.day?.branch || ""}`.trim();
    const day = computeTongshuLiveForRow(c.calendar.gregorianDate, rowGz || null);
    const mods = buildTongshuModuleResults(day);
    return { ...c, modules: { ...(c.modules as any), ...mods } };
  } catch (e) {
    console.warn("[auspicious] tongshu-live override failed:", (e as Error).message);
    return c;
  }
}

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
    huangdao: (dB && hB) ? huangDaoHour(dB, hB) : null,
    richong: dB ? riChongDay(dB, parseInt(String(r.date).slice(0, 4), 10) || 2026) : null,
    donggong: (mB && dB) ? dongGong(mB, dB, (dS || "") + (dB || "")) : null,
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
  c.scoring = scoring;
  const tierMeta = TIER_LABELS[scoring.tier];
  c.display = {
    badges: [{ label: tierMeta?.thai || scoring.tier, color: tierMeta?.color || "#999", emoji: tierMeta?.emoji || "" } as any],
    summary: (scoring as any).summary || "",
    guardrails: [],
  };
  return c;
}

function refreshCandidateDisplay(c: CandidateSlot): CandidateSlot {
  if (!c.scoring) return c;
  const scoring = c.scoring;
  const tierMeta = TIER_LABELS[scoring.tier];
  const summary = `${tierMeta?.emoji || ""} ${tierMeta?.thai || scoring.tier} · คะแนน ${scoring.finalScore}`.trim();
  c.display = {
    badges: [{ label: tierMeta?.thai || scoring.tier, color: tierMeta?.color || "#999", emoji: tierMeta?.emoji || "" } as any],
    summary,
    guardrails: [
      ...(scoring.warnings?.length ? [`มีคำเตือน ${scoring.warnings.length} ข้อ · ตรวจสอบก่อนใช้`] : []),
      ...(scoring.caps?.length ? [`Score ถูกจำกัด: ${scoring.caps.map((cap: any) => cap.reason).join(", ")}`] : []),
    ],
  };
  return c;
}

/* r367: DONGGONG_ACTIVITY_ALIASES ย้ายไป @/lib/luck-engine/modules/dong-gong (ค่าเดิมทุกตัว · import ใช้ร่วมกับ module) */
const DONGGONG_IRREVERSIBLE = new Set<ActivityType>(["婚姻", "動土", "搬家", "開市"]);
const DONGGONG_VERDICT_DELTA: Record<string, number> = {
  上吉: 2,
  全吉: 2,
  大吉: 2,
  吉: 1,
  次吉: 1,
  凶: -1,
  大凶: -2,
  不利: -2,
};

function applyDongGongOverlay(c: CandidateSlot, activeModules: ModuleKey[], activity: ActivityType): CandidateSlot {
  if (!activeModules.includes("ze_ri") || !c.scoring || !c.donggong || c.donggong.missing || c.donggong.verdict === "—") {
    return c;
  }
  const scoring = c.scoring as any;
  const dg = c.donggong;
  const aliases = DONGGONG_ACTIVITY_ALIASES[activity] || [];
  const yiMatches = (dg.yi || []).filter((x) => aliases.includes(x));
  const jiMatches = (dg.ji || []).filter((x) => aliases.includes(x));
  const addReason = (bucket: "reasonsUp" | "reasonsDown", code: string, thai: string, delta: number, severity: "info" | "warning") => {
    scoring[bucket] = scoring[bucket] || [];
    if (scoring[bucket].some((r: any) => r.code === code)) return;
    scoring[bucket].unshift({ code, thai, delta, source: "ze_ri", severity });
  };

  const startScore = Number(scoring.finalScore) || 0;
  const hasExistingGuardCap = (scoring.reasonsDown || []).some((r: any) => String(r.code || "").includes("CAP"));
  let positiveCeiling = hasExistingGuardCap ? startScore : 100;
  for (const cap of scoring.caps || []) {
    const value = Number(cap?.value);
    if ((cap?.type === "max" || cap?.type === "absolute") && Number.isFinite(value)) {
      positiveCeiling = Math.min(positiveCeiling, value);
    }
  }

  const genericDelta = DONGGONG_VERDICT_DELTA[dg.verdict] || 0;
  let positiveDelta = 0;
  let negativeDelta = 0;

  if (genericDelta > 0) {
    positiveDelta += genericDelta;
    addReason("reasonsUp", "DONGGONG_VERDICT_UP", `ตงกงหนุนภาพรวม · ${dg.verdictTh} ${dg.jianchuTh}`, genericDelta, "info");
  } else if (genericDelta < 0) {
    negativeDelta += genericDelta;
    addReason("reasonsDown", "DONGGONG_VERDICT_DOWN", `ตงกงลดแรงภาพรวม · ${dg.verdictTh} ${dg.jianchuTh}`, genericDelta, "warning");
  }
  if (yiMatches.length) {
    positiveDelta += 4;
    addReason("reasonsUp", "DONGGONG_YI_MATCH", `ตงกงระบุว่าเหมาะกับกิจกรรมนี้ · ${yiMatches.join("、")}`, 4, "info");
  }
  if (jiMatches.length) {
    negativeDelta -= 6;
    addReason("reasonsDown", "DONGGONG_JI_MATCH", `ตงกงระบุว่าควรเลี่ยงกิจกรรมนี้ · ${jiMatches.join("、")}`, -6, "warning");
  }

  positiveDelta = Math.min(6, positiveDelta);
  let nextScore = startScore + negativeDelta;
  if (positiveDelta > 0) nextScore = Math.min(nextScore + positiveDelta, positiveCeiling);
  if (jiMatches.length) {
    const jiCap = DONGGONG_IRREVERSIBLE.has(activity) ? 55 : 58;
    if (nextScore > jiCap) {
      addReason("reasonsDown", "DONGGONG_JI_CAP", `ตงกงมีข้อห้ามตรงกิจกรรมนี้ · ไม่ดันเป็นฤกษ์แรง`, jiCap - nextScore, "warning");
      nextScore = jiCap;
    }
  }

  scoring.finalScore = Math.max(0, Math.min(100, Math.round(nextScore)));
  scoring.tier = scoreToTier(scoring.finalScore);
  scoring.action = tierToAction(scoring.tier, scoring.warnings?.length || 0);
  return c;
}

function hideDongGongWhenInactive(c: CandidateSlot, activeModules: ModuleKey[]): CandidateSlot {
  /* r367: dong_gong module active ก็ต้องเห็นข้อมูลตงกงเช่นกัน (additive) */
  if (activeModules.includes("ze_ri") || activeModules.includes("dong_gong") || !c.donggong) return c;
  return { ...c, donggong: null };
}

type QimenPurpose = ActivityProfile["qimenPurpose"];

type QimenActivityPreference = {
  goodDoors: string[];
  avoidDoors: string[];
  goodDeities?: string[];
  avoidDeities?: string[];
  goodStars?: string[];
  avoidStars?: string[];
  goodFlags?: string[];
  goodFormations?: string[];
  maxPositiveDelta: number;
  maxNegativeDelta: number;
  avoidDoorCap: number;
};

const QIMEN_TERM_ZH: Record<string, string> = {
  KAI_MEN: "開門",
  XIU_MEN: "休門",
  SHENG_MEN: "生門",
  JING_VIEW_MEN: "景門",
  DU_MEN: "杜門",
  SHANG_MEN: "傷門",
  JING_FEAR_MEN: "驚門",
  SI_MEN: "死門",
  ZHI_FU: "值符",
  TENG_SHE: "螣蛇",
  TAI_YIN: "太陰",
  LIU_HE: "六合",
  BAI_HU: "白虎",
  XUAN_WU: "玄武",
  JIU_DI: "九地",
  JIU_TIAN: "九天",
  ZHU_QUE: "朱雀",
  TIAN_PENG: "天蓬",
  TIAN_REN: "天任",
  TIAN_CHONG: "天沖",
  TIAN_FU: "天輔",
  TIAN_YING: "天英",
  TIAN_RUI: "天芮",
  TIAN_ZHU: "天柱",
  TIAN_XIN: "天心",
  TIAN_QIN: "天禽",
  YI_MA: "驛馬",
  MEN_PO: "門迫",
  RU_MU: "入墓",
  JI_XING: "擊刑",
  FU_YIN: "伏吟",
  FAN_YIN: "反吟",
  WU_BU_YU_TIME: "五不遇時",
  QING_LONG_FAN_SHOU: "青龍返首",
  FEI_NIAO_DIE_XUE: "飛鳥跌穴",
  SAN_ZHA_ZHEN: "真詐",
  SAN_ZHA_XIU: "休詐",
  SAN_ZHA_CHONG: "重詐",
  TIAN_DUN: "天遁",
  DI_DUN: "地遁",
  REN_DUN: "人遁",
};

const QIMEN_TERM_CODE_BY_ZH = Object.fromEntries(
  Object.entries(QIMEN_TERM_ZH).map(([code, zh]) => [zh, code]),
) as Record<string, string>;
QIMEN_TERM_CODE_BY_ZH["直符"] = "ZHI_FU";
QIMEN_TERM_CODE_BY_ZH["六儀擊刑"] = "JI_XING";
QIMEN_TERM_CODE_BY_ZH["六仪击刑"] = "JI_XING";

const QIMEN_TERM_TH: Record<string, string> = {
  KAI_MEN: "ประตูเปิด",
  XIU_MEN: "ประตูพัก",
  SHENG_MEN: "ประตูเกิด",
  JING_VIEW_MEN: "ประตูภาพลักษณ์",
  DU_MEN: "ประตูปิด",
  SHANG_MEN: "ประตูบาดเจ็บ",
  JING_FEAR_MEN: "ประตูตื่นตกใจ",
  SI_MEN: "ประตูตาย",
  ZHI_FU: "เทพจื๋อฟู",
  TENG_SHE: "เทพเถิงเสอ",
  TAI_YIN: "เทพไท่อิน",
  LIU_HE: "เทพลิ่วเหอ",
  BAI_HU: "เทพไป๋หู่",
  XUAN_WU: "เทพเสวียนอู่",
  JIU_DI: "เทพจิ่วตี้",
  JIU_TIAN: "เทพจิ่วเทียน",
  ZHU_QUE: "เทพจูเชวี่ย",
  TIAN_PENG: "ดาวเทียนเผิง",
  TIAN_REN: "ดาวเทียนเริ่น",
  TIAN_CHONG: "ดาวเทียนชง",
  TIAN_FU: "ดาวเทียนฝู่",
  TIAN_YING: "ดาวเทียนอิง",
  TIAN_RUI: "ดาวเทียนรุ่ย",
  TIAN_ZHU: "ดาวเทียนจู้",
  TIAN_XIN: "ดาวเทียนซิน",
  TIAN_QIN: "ดาวเทียนฉิน",
  YI_MA: "ม้าเดินทาง",
  MEN_PO: "ประตูข่มวัง",
  RU_MU: "เข้าคลัง",
  JI_XING: "ก้านถูกลงโทษ",
  FU_YIN: "พลังนิ่งซ้ำ",
  FAN_YIN: "พลังพลิกกลับ",
  WU_BU_YU_TIME: "ยามไม่พบกัน",
  QING_LONG_FAN_SHOU: "มังกรเขียวหันกลับ",
  FEI_NIAO_DIE_XUE: "นกบินตกถ้ำ",
  SAN_ZHA_ZHEN: "ซานจ่าจริง",
  SAN_ZHA_XIU: "ซานจ่าพัก",
  SAN_ZHA_CHONG: "ซานจ่าหนัก",
  TIAN_DUN: "เทียนตุ้น",
  DI_DUN: "ตี้ตุ้น",
  REN_DUN: "เหรินตุ้น",
};

const QIMEN_ACTIVITY_PREFERENCES: Record<QimenPurpose, QimenActivityPreference> = {
  wealth: {
    goodDoors: ["SHENG_MEN", "KAI_MEN"],
    avoidDoors: ["SI_MEN", "SHANG_MEN", "JING_FEAR_MEN"],
    goodDeities: ["ZHI_FU", "LIU_HE", "JIU_TIAN"],
    avoidDeities: ["XUAN_WU", "BAI_HU"],
    goodStars: ["TIAN_REN", "TIAN_FU", "TIAN_XIN"],
    goodFormations: ["QING_LONG_FAN_SHOU", "FEI_NIAO_DIE_XUE", "SAN_ZHA_ZHEN", "SAN_ZHA_XIU", "TIAN_DUN", "REN_DUN"],
    maxPositiveDelta: 6,
    maxNegativeDelta: -8,
    avoidDoorCap: 49,
  },
  work: {
    goodDoors: ["KAI_MEN", "SHENG_MEN", "JING_VIEW_MEN"],
    avoidDoors: ["SI_MEN", "JING_FEAR_MEN", "SHANG_MEN"],
    goodDeities: ["ZHI_FU", "JIU_TIAN", "LIU_HE"],
    avoidDeities: ["BAI_HU", "TENG_SHE"],
    goodStars: ["TIAN_FU", "TIAN_XIN"],
    goodFormations: ["QING_LONG_FAN_SHOU", "FEI_NIAO_DIE_XUE", "TIAN_DUN", "REN_DUN"],
    maxPositiveDelta: 5,
    maxNegativeDelta: -7,
    avoidDoorCap: 52,
  },
  business: {
    goodDoors: ["SHENG_MEN", "KAI_MEN"],
    avoidDoors: ["SI_MEN", "DU_MEN", "JING_FEAR_MEN", "SHANG_MEN"],
    goodDeities: ["JIU_TIAN", "JIU_DI", "LIU_HE", "ZHI_FU"],
    avoidDeities: ["BAI_HU", "TENG_SHE", "XUAN_WU"],
    goodStars: ["TIAN_REN", "TIAN_FU", "TIAN_XIN"],
    goodFormations: ["QING_LONG_FAN_SHOU", "FEI_NIAO_DIE_XUE", "SAN_ZHA_ZHEN", "SAN_ZHA_XIU", "SAN_ZHA_CHONG", "TIAN_DUN", "DI_DUN", "REN_DUN"],
    maxPositiveDelta: 6,
    maxNegativeDelta: -8,
    avoidDoorCap: 49,
  },
  negotiation: {
    goodDoors: ["XIU_MEN", "KAI_MEN"],
    avoidDoors: ["JING_FEAR_MEN", "SHANG_MEN", "SI_MEN"],
    goodDeities: ["LIU_HE", "TAI_YIN", "ZHI_FU"],
    avoidDeities: ["BAI_HU", "TENG_SHE", "XUAN_WU"],
    goodStars: ["TIAN_FU", "TIAN_XIN"],
    goodFormations: ["SAN_ZHA_ZHEN", "SAN_ZHA_XIU", "SAN_ZHA_CHONG", "QING_LONG_FAN_SHOU", "FEI_NIAO_DIE_XUE", "REN_DUN"],
    maxPositiveDelta: 6,
    maxNegativeDelta: -8,
    avoidDoorCap: 49,
  },
  travel: {
    goodDoors: ["KAI_MEN", "XIU_MEN", "SHENG_MEN"],
    avoidDoors: ["SI_MEN", "DU_MEN", "JING_FEAR_MEN", "SHANG_MEN"],
    goodDeities: ["JIU_TIAN", "LIU_HE", "ZHI_FU"],
    avoidDeities: ["BAI_HU", "TENG_SHE"],
    goodStars: ["TIAN_CHONG", "TIAN_FU"],
    goodFlags: ["is_traveling_horse", "traveling_horse", "horse", "驛馬"],
    goodFormations: ["QING_LONG_FAN_SHOU", "FEI_NIAO_DIE_XUE", "TIAN_DUN", "REN_DUN"],
    maxPositiveDelta: 6,
    maxNegativeDelta: -8,
    avoidDoorCap: 48,
  },
  love: {
    goodDoors: ["XIU_MEN", "SHENG_MEN", "KAI_MEN"],
    avoidDoors: ["SI_MEN", "SHANG_MEN", "JING_FEAR_MEN"],
    goodDeities: ["LIU_HE", "TAI_YIN", "ZHI_FU"],
    avoidDeities: ["BAI_HU", "TENG_SHE"],
    goodStars: ["TIAN_FU"],
    goodFormations: ["SAN_ZHA_XIU", "REN_DUN"],
    maxPositiveDelta: 5,
    maxNegativeDelta: -7,
    avoidDoorCap: 52,
  },
  marriage: {
    goodDoors: ["XIU_MEN", "SHENG_MEN", "KAI_MEN"],
    avoidDoors: ["SI_MEN", "SHANG_MEN", "JING_FEAR_MEN"],
    goodDeities: ["LIU_HE", "TAI_YIN", "ZHI_FU"],
    avoidDeities: ["BAI_HU", "TENG_SHE"],
    goodStars: ["TIAN_FU", "TIAN_REN"],
    goodFormations: ["SAN_ZHA_XIU", "REN_DUN"],
    maxPositiveDelta: 5,
    maxNegativeDelta: -8,
    avoidDoorCap: 49,
  },
  health: {
    goodDoors: ["XIU_MEN", "SHENG_MEN"],
    avoidDoors: ["SI_MEN", "SHANG_MEN", "JING_FEAR_MEN"],
    goodDeities: ["JIU_DI", "TAI_YIN", "ZHI_FU"],
    avoidDeities: ["BAI_HU", "TENG_SHE"],
    goodStars: ["TIAN_XIN"],
    avoidStars: ["TIAN_RUI"],
    maxPositiveDelta: 4,
    maxNegativeDelta: -9,
    avoidDoorCap: 39,
  },
  exam: {
    goodDoors: ["JING_VIEW_MEN", "KAI_MEN", "XIU_MEN"],
    avoidDoors: ["SI_MEN", "JING_FEAR_MEN", "DU_MEN"],
    goodDeities: ["ZHI_FU", "TAI_YIN", "JIU_TIAN"],
    avoidDeities: ["BAI_HU", "TENG_SHE"],
    goodStars: ["TIAN_FU", "TIAN_XIN"],
    goodFormations: ["QING_LONG_FAN_SHOU", "FEI_NIAO_DIE_XUE", "TIAN_DUN"],
    maxPositiveDelta: 5,
    maxNegativeDelta: -7,
    avoidDoorCap: 52,
  },
  construction: {
    goodDoors: ["SHENG_MEN", "KAI_MEN"],
    avoidDoors: ["SI_MEN", "SHANG_MEN", "JING_FEAR_MEN"],
    goodDeities: ["JIU_DI", "ZHI_FU"],
    avoidDeities: ["BAI_HU", "TENG_SHE"],
    goodStars: ["TIAN_REN", "TIAN_XIN"],
    goodFormations: ["DI_DUN"],
    maxPositiveDelta: 5,
    maxNegativeDelta: -8,
    avoidDoorCap: 49,
  },
};

const QIMEN_DIRECTION_ALIASES: Record<Dir8, string[]> = {
  N: ["N", "北", "north"],
  NE: ["NE", "東北", "东北", "northeast"],
  E: ["E", "東", "东", "east"],
  SE: ["SE", "東南", "东南", "southeast"],
  S: ["S", "南", "south"],
  SW: ["SW", "西南", "southwest"],
  W: ["W", "西", "west"],
  NW: ["NW", "西北", "northwest"],
};
const QIMEN_TARGET_MISMATCH = Symbol("qimen-target-direction-mismatch");
const QIMEN_ACTIVITY_AVOID_FLAGS = [
  "MEN_PO", "門迫", "RU_MU", "入墓", "JI_XING", "LIU_YI_JI_XING", "六儀擊刑",
  "FU_YIN", "伏吟", "FAN_YIN", "反吟", "WU_BU_YU_TIME", "五不遇時",
];

function qimenBaseScoreModulesForActivity(activeModules: ModuleKey[]): ModuleKey[] {
  return activeModules.filter((m) => m !== "qi_men");
}

function qimenHardFilterModulesForDatepick(modules: ModuleKey[]): ModuleKey[] {
  return modules.filter((m) => m !== "qi_men");
}

function buildQimenDatepickPolicy(
  profile: ActivityProfile | null,
  activeModules: ModuleKey[],
  targetDirection: Dir8 | null,
) {
  const qimenActive = activeModules.includes("qi_men");
  const pref = profile ? QIMEN_ACTIVITY_PREFERENCES[profile.qimenPurpose] : null;
  return {
    version: "datepick-qimen-policy-20260606",
    enabled: qimenActive,
    mode: profile ? "activity_profile" : "guard_only",
    baseScoreExcludesQiMen: true,
    noGenericAveraging: true,
    chartScopeTh: "ใช้เฉพาะผังยาม 時家 ที่ระบบอนุญาตให้ตัดสินได้; ผังวัน/เดือน/ปีใช้เป็นบริบท ไม่เอามาคิดคะแนนฤกษ์ยาม",
    useTh: qimenActive
      ? (profile
        ? `${profile.labelTh}: ฉีเหมินใช้เลือกวัง/ประตู/ดาว/เทพ/ก้านและสัญญาณที่ตรงกิจกรรม ไม่ใช่คะแนนกลาง`
        : "ไม่มีภารกิจย่อยเฉพาะ: ฉีเหมินใช้เป็นตัวจำกัดเมื่อผังไม่รับ ไม่ใช่คะแนนบวกกลาง")
      : "ไม่ได้เปิดโมดูลฉีเหมินในคำขอนี้",
    caveatTh: "คะแนนหลักตัดจากศาสตร์อื่นก่อน แล้วฉีเหมินค่อยปรับแบบมีเหตุผลเฉพาะกิจกรรมและมีเพดานกันฟันธงเกินข้อมูล",
    evidenceTh: "ใช้เฉพาะประตู ดาว เทพ ก้าน และสัญญาณจากผังจริงที่อนุญาตให้ให้คะแนน; ป้ายแสดงผลหรือข้อมูลอ่านประกอบไม่เอามาคิดคะแนน",
    targetDirection: targetDirection || null,
    activityProfile: profile ? {
      key: profile.key,
      labelTh: profile.labelTh,
      labelZh: profile.labelZh,
      qimenPurpose: profile.qimenPurpose,
      safety: profile.safety,
    } : null,
    preference: pref ? {
      goodDoors: pref.goodDoors.map(qimenLabel),
      avoidDoors: pref.avoidDoors.map(qimenLabel),
      goodDeities: (pref.goodDeities || []).map(qimenLabel),
      avoidDeities: (pref.avoidDeities || []).map(qimenLabel),
      goodStars: (pref.goodStars || []).map(qimenLabel),
      avoidStars: (pref.avoidStars || []).map(qimenLabel),
      goodFormations: (pref.goodFormations || []).map(qimenLabel),
      maxPositiveDelta: pref.maxPositiveDelta,
      maxNegativeDelta: pref.maxNegativeDelta,
      avoidDoorCap: profile?.safety === "medical_safe" ? Math.min(pref.avoidDoorCap, 39) : pref.avoidDoorCap,
    } : null,
  };
}

function qimenNormalizeTerm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (QIMEN_TERM_ZH[raw]) return raw;
  if (QIMEN_TERM_CODE_BY_ZH[raw]) return QIMEN_TERM_CODE_BY_ZH[raw];
  const compact = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (QIMEN_TERM_ZH[compact]) return compact;
  return null;
}

function qimenLabel(code: string): string {
  const th = QIMEN_TERM_TH[code] || code;
  const zh = QIMEN_TERM_ZH[code];
  return zh ? `${th} ${zh}` : th;
}

function qimenReadPath(obj: any, path: string): unknown {
  return path.split(".").reduce((acc: any, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return acc[key];
  }, obj);
}

function qimenFirstTerm(...values: unknown[]): string | null {
  for (const value of values) {
    const code = qimenNormalizeTerm(value);
    if (code) return code;
  }
  return null;
}

function qimenFindTargetPalace(raw: any, targetDirection: Dir8 | null): any {
  const palaces = Array.isArray(raw?.palaces)
    ? raw.palaces
    : Array.isArray(raw?.chart?.palaces)
      ? raw.chart.palaces
      : [];
  if (targetDirection && palaces.length) {
    const aliases = new Set(QIMEN_DIRECTION_ALIASES[targetDirection].map((x) => x.toLowerCase()));
    const byDirection = palaces.find((p: any) => {
      const fields = [p?.direction, p?.dir, p?.direction_code, p?.direction_zh, p?.direction_label];
      return fields.some((v) => typeof v === "string" && aliases.has(v.trim().toLowerCase()));
    });
    if (byDirection) return byDirection;
    return QIMEN_TARGET_MISMATCH;
  }
  return raw?.best_palace || raw?.bestPalace || raw?.selected_palace || raw?.target_palace || raw?.palace || null;
}

function qimenHasFlag(qm: any, raw: any, palace: any, names: string[] = []): boolean {
  const tags = Array.isArray(qm?.tags) ? qm.tags.map((t: unknown) => String(t).toLowerCase()) : [];
  return names.some((name) => {
    const low = name.toLowerCase();
    if (tags.includes(low)) return true;
    if (Boolean(raw?.[name] || palace?.[name] || raw?.flags?.[name] || palace?.flags?.[name])) return true;
    const code = qimenNormalizeEvidenceCode(name);
    return code ? qimenEvidenceCodes(raw, palace).has(code) : false;
  });
}

function qimenScoreEvidenceAllowed(item: any): boolean {
  if (!item || typeof item !== "object") return true;
  const quality = String(item.quality || item.effective_quality || item.base_quality || "").toLowerCase();
  const evidence = item.evidence || {};
  const readiness = item.engine_readiness || {};
  return item.verdict_allowed !== false
    && readiness.verdict_allowed !== false
    && item.context_only !== true
    && item.is_context_only !== true
    && item.no_score !== true
    && item.diagnostic !== true
    && evidence.no_score !== true
    && evidence.diagnostic !== true
    && quality !== "context_only";
}

function qimenModuleScoreAllowed(qm: any): boolean {
  if (!qm || qm.status === "missing" || qm.status === "error") return false;
  const raw = qm.raw || {};
  const data = raw.data || {};
  const chart = raw.chart || data.chart || {};
  const calculation = raw.calculation || data.calculation || {};
  const quality = String(raw.quality || raw.effective_quality || raw.base_quality || chart.quality || "").toLowerCase();
  const systemType = String(
    chart.system_type || chart.chart_type || raw.system_type || raw.chart_type || calculation.system_type || "",
  ).toLowerCase();
  if (systemType === "day" || systemType === "month" || systemType === "year") return false;
  const readiness = chart.engine_readiness || raw.engine_readiness || {};
  const temporal = chart.temporal_context_policy || raw.temporal_context_policy || {};
  return raw.verdict_allowed !== false
    && chart.verdict_allowed !== false
    && calculation.verdict_allowed !== false
    && raw.context_only !== true
    && chart.context_only !== true
    && raw.is_context_only !== true
    && chart.is_context_only !== true
    && quality !== "context_only"
    && raw.no_score !== true
    && raw.diagnostic !== true
    && readiness.verdict_allowed !== false
    && temporal.verdict_allowed !== false;
}

function qimenNormalizeEvidenceCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const direct = qimenNormalizeTerm(raw);
  if (direct) return direct;
  const compact = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (compact.includes("MEN_PO") || compact.includes("DOOR_OPPRESSED")) return "MEN_PO";
  if (compact.includes("RU_MU") || compact.includes("TOMB")) return "RU_MU";
  if (compact.includes("LIU_YI_JI_XING") || compact.includes("JI_XING") || compact.includes("PUNISH") || compact.includes("六儀擊刑") || compact.includes("六仪击刑") || compact.includes("擊刑") || compact.includes("击刑")) return "JI_XING";
  if (compact.includes("FU_YIN")) return "FU_YIN";
  if (compact.includes("FAN_YIN")) return "FAN_YIN";
  if (compact.includes("WU_BU_YU") || compact.includes("FIVE_NO_MEET") || compact.includes("FIVE_NOT_MEET")) return "WU_BU_YU_TIME";
  if (compact.includes("QING_LONG")) return "QING_LONG_FAN_SHOU";
  if (compact.includes("FEI_NIAO")) return "FEI_NIAO_DIE_XUE";
  if (compact.includes("SAN_ZHA_ZHEN")) return "SAN_ZHA_ZHEN";
  if (compact.includes("SAN_ZHA_XIU")) return "SAN_ZHA_XIU";
  if (compact.includes("SAN_ZHA_CHONG")) return "SAN_ZHA_CHONG";
  if (compact.includes("TIAN_DUN")) return "TIAN_DUN";
  if (compact.includes("DI_DUN")) return "DI_DUN";
  if (compact.includes("REN_DUN")) return "REN_DUN";
  return null;
}

function qimenEvidenceItems(raw: any, palace: any): any[] {
  const out: any[] = [];
  const add = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (typeof value === "object") {
      if (qimenScoreEvidenceAllowed(value)) out.push(value);
      return;
    }
    out.push({ code: String(value) });
  };
  add(raw?.stored_formations);
  add(raw?.source_formations);
  add(raw?.compound_formations);
  add(raw?.formations);
  add(raw?.chart?.stored_formations);
  add(raw?.chart?.source_formations);
  add(raw?.chart?.compound_formations);
  add(palace?.formations);
  add(palace?.classical_flags);
  add(palace?.qimen_trace);
  add(palace?.p0_badges);
  add(palace?.source_trace);
  return out;
}

function qimenEvidenceCodes(raw: any, palace: any): Set<string> {
  const codes = new Set<string>();
  for (const item of qimenEvidenceItems(raw, palace)) {
    for (const value of [
      item.code, item.formation_code, item.rule_id, item.detector, item.flag,
      item.name_zh, item.label_zh, item.badge, item.badge_zh, item.title_zh,
    ]) {
      const code = qimenNormalizeEvidenceCode(value);
      if (code) codes.add(code);
    }
  }
  return codes;
}

function qimenFirstEvidenceCode(raw: any, palace: any, names: string[] = []): string | null {
  const codes = qimenEvidenceCodes(raw, palace);
  for (const name of names) {
    const code = qimenNormalizeEvidenceCode(name);
    if (code && codes.has(code)) return code;
  }
  return null;
}

function applyQimenActivityPreference(input: {
  profile: ActivityProfile;
  qm: ModuleResult;
  targetDirection: Dir8 | null;
  addUp: (code: string, thai: string, delta: number, source: ModuleKey) => boolean;
  addDown: (code: string, thai: string, delta: number, source: ModuleKey) => boolean;
  cap: (value: number, code: string, thai: string, source: ModuleKey) => void;
  shiftScore: (delta: number) => void;
  /* r417: ประตูใน avoidDoors ของกิจกรรมนั้น = "ห้าม" default (veto) · relaxDoors:true = ผ่อนกลับเป็น cap/warning เดิม */
  relaxDoors: boolean;
  addVeto: (v: { code: string; reasonTh: string; reasonEn: string; reasonZh: string; source: ModuleKey }) => void;
}) {
  const pref = QIMEN_ACTIVITY_PREFERENCES[input.profile.qimenPurpose];
  if (!pref || !input.qm || input.qm.status === "missing" || input.qm.status === "error") return;
  if (!qimenModuleScoreAllowed(input.qm)) return;

  const raw = input.qm.raw || {};
  if (input.qm.pass === false || raw.bad_door === true) return;
  const palace = qimenFindTargetPalace(raw, input.targetDirection);
  if (palace === QIMEN_TARGET_MISMATCH) return;
  const door = qimenFirstTerm(
    palace?.door_code, palace?.door_zh, palace?.door,
    raw.door_code, raw.door_zh, raw.door,
    qimenReadPath(raw, "best_palace.door_code"),
    qimenReadPath(raw, "best_palace.door_zh"),
    qimenReadPath(raw, "bestPalace.door_code"),
    qimenReadPath(raw, "bestPalace.door_zh"),
  );
  const deity = qimenFirstTerm(
    palace?.deity_code, palace?.deity_zh, palace?.deity,
    raw.deity_code, raw.deity_zh, raw.deity,
    qimenReadPath(raw, "best_palace.deity_code"),
    qimenReadPath(raw, "best_palace.deity_zh"),
    qimenReadPath(raw, "bestPalace.deity_code"),
    qimenReadPath(raw, "bestPalace.deity_zh"),
  );
  const star = qimenFirstTerm(
    palace?.star_code, palace?.star_zh, palace?.star,
    raw.star_code, raw.star_zh, raw.star,
    qimenReadPath(raw, "best_palace.star_code"),
    qimenReadPath(raw, "best_palace.star_zh"),
    qimenReadPath(raw, "bestPalace.star_code"),
    qimenReadPath(raw, "bestPalace.star_zh"),
  );

  let delta = 0;
  let avoidDoorCap: number | null = null;
  if (door && pref.goodDoors.includes(door)) {
    delta += 3;
    input.addUp(
      "PROFILE_QIMEN_GOOD_DOOR",
      `${input.profile.labelTh}: ประตูฉีเหมินหนุนกิจกรรมนี้ · ${qimenLabel(door)}`,
      3,
      "qi_men",
    );
  }
  if (door && pref.avoidDoors.includes(door)) {
    delta -= 5;
    input.addDown(
      "PROFILE_QIMEN_AVOID_DOOR",
      `${input.profile.labelTh}: ประตูฉีเหมินไม่เหมาะกับกิจกรรมนี้ · ${qimenLabel(door)}`,
      -5,
      "qi_men",
    );
    avoidDoorCap = input.profile.safety === "medical_safe" ? Math.min(pref.avoidDoorCap, 39) : pref.avoidDoorCap;
    /* r417: ประตูร้ายของกิจกรรมนี้ (avoidDoors) = "ห้าม" default → veto (ไม่ต้องติ๊ก qm-strict)
       relaxDoors:true (option ผ่อนเกณฑ์ ไว้ให้ UI ภายหลัง) = กลับไปเป็นแค่ cap/warning เดิม */
    if (!input.relaxDoors) {
      input.addVeto({
        code: "QIMEN_AVOID_DOOR",
        reasonTh: `${input.profile.labelTh}: ประตูฉีเหมิน ${qimenLabel(door)} เป็นประตูต้องห้ามของกิจกรรมนี้ตามตำรา — ตัดออกจากฤกษ์แนะนำ`,
        reasonEn: `${input.profile.labelTh}: the Qi Men door ${qimenLabel(door)} is classically forbidden for this activity — excluded from recommended timings.`,
        reasonZh: `${input.profile.labelZh}：奇門「${qimenLabel(door)}」為本活動之忌門 — 不列入推薦吉時`,
        source: "qi_men",
      });
    }
  }
  if (deity && pref.goodDeities?.includes(deity)) {
    delta += 1;
    input.addUp(
      "PROFILE_QIMEN_GOOD_DEITY",
      `${input.profile.labelTh}: เทพฉีเหมินช่วยบริบทกิจกรรม · ${qimenLabel(deity)}`,
      1,
      "qi_men",
    );
  }
  if (deity && pref.avoidDeities?.includes(deity)) {
    delta -= 2;
    input.addDown(
      "PROFILE_QIMEN_AVOID_DEITY",
      `${input.profile.labelTh}: เทพฉีเหมินทำให้ต้องระวัง · ${qimenLabel(deity)}`,
      -2,
      "qi_men",
    );
  }
  if (star && pref.goodStars?.includes(star)) {
    delta += 1;
    input.addUp(
      "PROFILE_QIMEN_GOOD_STAR",
      `${input.profile.labelTh}: ดาวฉีเหมินเข้ากับงานนี้ · ${qimenLabel(star)}`,
      1,
      "qi_men",
    );
  }
  if (star && pref.avoidStars?.includes(star)) {
    delta -= 2;
    input.addDown(
      "PROFILE_QIMEN_AVOID_STAR",
      `${input.profile.labelTh}: ดาวฉีเหมินเป็นจุดต้องระวัง · ${qimenLabel(star)}`,
      -2,
      "qi_men",
    );
  }
  const avoidFlag = qimenFirstEvidenceCode(raw, palace, QIMEN_ACTIVITY_AVOID_FLAGS);
  if (avoidFlag) {
    delta -= 3;
    input.addDown(
      "PROFILE_QIMEN_AVOID_FLAG",
      `${input.profile.labelTh}: สัญญาณฉีเหมินต้องระวัง · ${qimenLabel(avoidFlag)}`,
      -3,
      "qi_men",
    );
    const flagCap = input.profile.safety === "medical_safe" ? 39 : pref.avoidDoorCap;
    avoidDoorCap = Math.min(avoidDoorCap ?? flagCap, flagCap);
  }
  if (pref.goodFlags?.length && qimenHasFlag(input.qm, raw, palace, pref.goodFlags)) {
    delta += 1;
    input.addUp(
      "PROFILE_QIMEN_GOOD_FLAG",
      `${input.profile.labelTh}: มีสัญญาณเคลื่อนไหวที่เข้ากับงานนี้ · ม้าเดินทาง 驛馬`,
      1,
      "qi_men",
    );
  }
  const goodFormation = qimenFirstEvidenceCode(raw, palace, pref.goodFormations || []);
  if (goodFormation) {
    delta += 1;
    input.addUp(
      "PROFILE_QIMEN_GOOD_FORMATION",
      `${input.profile.labelTh}: รูปแบบฉีเหมินเข้ากับกิจกรรม · ${qimenLabel(goodFormation)}`,
      1,
      "qi_men",
    );
  }

  const bounded = Math.max(pref.maxNegativeDelta, Math.min(pref.maxPositiveDelta, delta));
  if (bounded !== 0) input.shiftScore(bounded);
  if (avoidDoorCap != null) {
    input.cap(
      avoidDoorCap,
      "PROFILE_QIMEN_AVOID_DOOR_CAP",
      `${input.profile.labelTh}: ประตูฉีเหมินเป็นกลุ่มควรเลี่ยง · ไม่ดันเป็นฤกษ์แรง`,
      "qi_men",
    );
  }
}

function applyActivityProfileRules(
  c: CandidateSlot,
  profile: ActivityProfile | null,
  activeModules: ModuleKey[],
  targetDirection: Dir8 | null = null,
  relaxDoors: boolean = false,
): CandidateSlot {
  if (!profile || !c.scoring) return c;

  const active = new Set(activeModules);
  const modules = c.modules as any;
  const scoring = c.scoring as any;
  const addWarning = (code: string, thai: string, delta: number, source: ModuleKey) => {
    scoring.warnings = scoring.warnings || [];
    if (scoring.warnings.some((r: any) => r.code === code)) return false;
    scoring.warnings.push({ code, thai, delta, source, severity: "warning" });
    return true;
  };
  /* r417: ฉีเหมิน avoidDoors veto ต่อกับ scoring.vetoes เดียวกับที่ combineScores รวมจาก module.veto
     (dedupe ด้วย code เหมือน addUp/addDown/addWarning ข้างบน) */
  const addVeto = (v: { code: string; reasonTh: string; reasonEn: string; reasonZh: string; source: ModuleKey }) => {
    scoring.vetoes = scoring.vetoes || [];
    if (scoring.vetoes.some((x: any) => x.code === v.code)) return;
    scoring.vetoes.push(v);
  };
  const addDown = (code: string, thai: string, delta: number, source: ModuleKey) => {
    scoring.reasonsDown = scoring.reasonsDown || [];
    if (scoring.reasonsDown.some((r: any) => r.code === code)) return false;
    scoring.reasonsDown.unshift({ code, thai, delta, source, severity: "warning" });
    return true;
  };
  const addUp = (code: string, thai: string, delta: number, source: ModuleKey) => {
    scoring.reasonsUp = scoring.reasonsUp || [];
    if (scoring.reasonsUp.some((r: any) => r.code === code)) return false;
    scoring.reasonsUp.unshift({ code, thai, delta, source, severity: "info" });
    return true;
  };
  const cap = (value: number, code: string, thai: string, source: ModuleKey) => {
    if (scoring.finalScore > value) {
      addDown(code, thai, value - scoring.finalScore, source);
      scoring.finalScore = value;
    }
  };
  const shiftScore = (delta: number) => {
    scoring.finalScore += delta;
  };

  const qm = modules?.qi_men;
  const zr = modules?.ze_ri;
  const ts = modules?.tai_sui;
  const bz = modules?.ba_zi;
  const ys = modules?.yong_shen;

  if (active.has("qi_men") && qimenModuleScoreAllowed(qm)) {
    applyQimenActivityPreference({ profile, qm, targetDirection, addUp, addDown, cap, shiftScore, relaxDoors, addVeto });
  }
  if (active.has("qi_men") && qimenModuleScoreAllowed(qm) && (qm?.pass === false || qm?.raw?.bad_door === true)) {
    const limit = profile.safety === "medical_safe" ? 39 : 54;
    const reason = `${profile.labelTh}: ฉีเหมินไม่รับภารกิจนี้ · ใช้เป็นตัวจำกัด ไม่ใช่คะแนนบวกกลาง`;
    addDown("PROFILE_QIMEN_CAP", reason, scoring.finalScore > limit ? limit - scoring.finalScore : 0, "qi_men");
    cap(limit, "PROFILE_QIMEN_CAP", reason, "qi_men");
  }
  if (active.has("tai_sui") && ts?.pass === false) {
    cap(profile.safety === "medical_safe" ? 42 : 55, "PROFILE_TAISUI_CAP", `${profile.labelTh}: ชั้นไท้ส่วยไม่ผ่าน · ไม่ดันเป็นฤกษ์แรง`, "tai_sui");
  }
  if (active.has("ze_ri") && zr?.pass === false) {
    cap(profile.safety === "medical_safe" ? 42 : 58, "PROFILE_TONGSHU_CAP", `${profile.labelTh}: ปฏิทินจีนไม่รับกิจกรรมนี้ · ใช้ด้วยความระวัง`, "ze_ri");
  }
  if (active.has("ba_zi") && bz?.pass === false) {
    cap(profile.safety === "medical_safe" ? 39 : 49, "PROFILE_BAZI_CAP", `${profile.labelTh}: ดวงคนที่เกี่ยวข้องมีแรงปะทะ · ลดระดับฤกษ์`, "ba_zi");
  }

  if (profile.safety === "finance_safe") {
    addWarning("FINANCE_SAFE_NOTE", "เรื่องเงินใช้เป็นจังหวะประกอบเท่านั้น · ตรวจตัวเลขและเงื่อนไขจริงก่อนตัดสินใจ", -3, "ze_ri");
    if (active.has("yong_shen") && ys?.pass === false) {
      cap(62, "PROFILE_FINANCE_YONGSHEN_CAP", `${profile.labelTh}: ธาตุช่วยไม่หนุนเรื่องเงินชัด · ไม่ควรเร่งผูกมัด`, "yong_shen");
    }
  }

  if (profile.safety === "medical_safe") {
    addWarning("MEDICAL_SAFE_NOTE", "สุขภาพ/ผ่าตัดใช้กับการวางเวลา elective เท่านั้น · ไม่แทนคำแนะนำแพทย์", -5, "ze_ri");
  }

  if (
    (profile.key === "exam_study" || profile.key === "interview")
    && active.has("qi_men")
    && qimenModuleScoreAllowed(qm)
    && qm?.pass !== false
    && qm?.raw?.bad_door !== true
  ) {
    addUp("PROFILE_EXAM_CONTEXT", `${profile.labelTh}: ใช้กฎเอกสาร+การนำเสนอ และให้ฉีเหมินเป็นตัวคัดยาม`, 3, "qi_men");
  }

  scoring.finalScore = Math.max(0, Math.min(100, Math.round(scoring.finalScore)));
  scoring.tier = scoreToTier(scoring.finalScore);
  scoring.action = tierToAction(scoring.tier, scoring.warnings?.length || 0);
  return c;
}

function applyQimenGenericGuard(
  c: CandidateSlot,
  profile: ActivityProfile | null,
  activeModules: ModuleKey[],
): CandidateSlot {
  if (profile || !c.scoring || !activeModules.includes("qi_men")) return c;
  const qm = (c.modules as any)?.qi_men;
  if (!qimenModuleScoreAllowed(qm)) return c;
  if (!(qm?.pass === false || qm?.raw?.bad_door === true)) return c;
  const scoring = c.scoring as any;
  const limit = 49;
  scoring.reasonsDown = scoring.reasonsDown || [];
  if (!scoring.reasonsDown.some((r: any) => r.code === "QM_BAD_DOOR_CAP")) {
    scoring.reasonsDown.unshift({
      code: "QM_BAD_DOOR_CAP",
      thai: "ประตูฉีเหมินไม่เหมาะ · ใช้เป็นตัวจำกัด ไม่ใช่คะแนนบวกกลาง",
      delta: scoring.finalScore > limit ? limit - scoring.finalScore : 0,
      source: "qi_men",
      severity: "warning",
    } as any);
  }
  if (scoring.finalScore > limit) {
    scoring.finalScore = limit;
    scoring.tier = scoreToTier(scoring.finalScore);
    scoring.action = tierToAction(scoring.tier, scoring.warnings?.length || 0);
  }
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
  // 六合 (คู่สมพล) — ก่อนหน้านี้ขาดไป · ป๊า辰 + 酉日 = 辰酉六合 ควรได้แต้ม
  const LIUHE: Record<string,string> = { 子:'丑', 丑:'子', 寅:'亥', 亥:'寅', 卯:'戌', 戌:'卯', 辰:'酉', 酉:'辰', 巳:'申', 申:'巳', 午:'未', 未:'午' };
  const SANHE = [['申','子','辰'],['寅','午','戌'],['巳','酉','丑'],['亥','卯','未']];
  if (LIUHE[cZ] === sP.day.branch) {
    baziScore += 12; bTags.push('liuhe_z'); bUp.push({code:'LIUHE_Z', thai:`🤝 六合 ${cZ}${sP.day.branch}`, delta:12}); baziStatus='liuhe';
  } else {
    // มีแค่ 2 กิ่งในวง三合 = "半三合/拱" (ครึ่งวง) ไม่ใช่ 三合เต็ม (ต้องครบ 3 กิ่ง)
    for (const grp of SANHE) {
      if (grp.includes(cZ) && grp.includes(sP.day.branch) && cZ !== sP.day.branch) {
        baziScore += 8; bTags.push('banhe_z'); bUp.push({code:'BANHE_Z', thai:`🤝 半三合 (拱${grp.join('')})`, delta:8}); baziStatus='banhe'; break;
      }
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

  // ── hex64 · 梅花易數 起卦ตามเวลา (以時間起卦 · r414) ────────────────
  // เดิม (บั๊ก): hash เลขกิ่ง day*12+hour*7+zodiac — เลข卦ไม่มีที่มาเชิง易 แต่โชว์爻辭ของแท้
  // ใหม่: 年支數+月+日 (จันทรคติ) → 上卦 · +時支數 → 下卦 · 動爻 = ผลรวม%6 (ตำรามาตรฐาน)
  // หมายเหตุ: 起卦ด้วยเวลา → ทุกคนใน slot เดียวกันได้卦เดียวกัน (ถูกตาม梅花 · ไม่ใช้ปีนักษัตรลูกค้า)
  const { hexNum, yaoLine, meihuaRaw } = _meihuaTimeHex(slot);
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
  const hex64 = _result('hex64', hexScore, hTags, hUp, hDown, 0.7, { hex_num: hexNum, hex_name: hexName, changing_line: yaoLine, label: hexLabel, meihua: meihuaRaw });

  return { ba_zi, yong_shen, hex64 };
}
const BRANCHES_ORDER_PERSONAL = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// ── 梅花易數 起卦ตามเวลา (r414) ──────────────────────────────────
// 先天八卦數 乾1兌2離3震4巽5坎6艮7坤8 → binary 3 บิต · encoding เดียวกับ TRIGRAM_BIN
// ใน heluo-astrology.ts:30 (乾=111 兌=110 離=101 震=100 巽=011 坎=010 艮=001 坤=000)
// เพื่อให้ key ตรงกับตาราง KING_WEN (upperBin+lowerBin → เลข King Wen 1-64)
const _XIANTIAN_BIN: Record<number, string> = { 1:'111', 2:'110', 3:'101', 4:'100', 5:'011', 6:'010', 7:'001', 8:'000' };
const _XIANTIAN_ZH: Record<number, string> = { 1:'乾', 2:'兌', 3:'離', 4:'震', 5:'巽', 6:'坎', 7:'艮', 8:'坤' };

/** 梅花易數 以時間起卦 (ตำรามาตรฐาน 邵雍):
 *  上卦 = (年支數+月+日) % 8 (0→8) · 下卦 = (年支數+月+日+時支數) % 8 (0→8) · 動爻 = ผลรวม % 6 (0→6)
 *  ปี/เดือน/วัน = จันทรคติ (tyme4ts) · 年支數/時支數: 子=1..亥=12 · 閏月ใช้เลขเดือนเดิม */
function _meihuaTimeHex(slot: CandidateSlot): { hexNum: number; yaoLine: number; meihuaRaw: any } {
  try {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(slot.calendar?.gregorianDate || slot.datetime?.start || ''));
    if (!m) throw new Error('no_date');
    const ld = SolarDay.fromYmd(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)).getLunarDay();
    const yNum = ld.getLunarMonth().getLunarYear().getSixtyCycle().getEarthBranch().getIndex() + 1; // 年支數 子=1..亥=12
    const mNum = Math.abs(ld.getLunarMonth().getMonth());                                            // เดือนจันทรคติ 1-12
    const dNum = ld.getDay();                                                                        // วันจันทรคติ 1-30
    const hIdx = BRANCHES_ORDER_PERSONAL.indexOf(slot.pillars.hour.branch);
    const hNum = (hIdx >= 0 ? hIdx : 0) + 1;                                                         // 時支數 子=1..亥=12
    const upXT = ((yNum + mNum + dNum) % 8) || 8;          // 上卦 (先天數)
    const loXT = ((yNum + mNum + dNum + hNum) % 8) || 8;   // 下卦 (先天數)
    const yao = ((yNum + mNum + dNum + hNum) % 6) || 6;    // 動爻 1-6
    const hexNum = KING_WEN[_XIANTIAN_BIN[upXT] + _XIANTIAN_BIN[loXT]] ?? 1;
    return {
      hexNum, yaoLine: yao,
      meihuaRaw: { method: 'meihua_time', lunar: { y: yNum, m: mNum, d: dNum, h: hNum }, upper: _XIANTIAN_ZH[upXT], lower: _XIANTIAN_ZH[loXT] },
    };
  } catch {
    // ปกติเกิดไม่ได้ (gregorianDate มาจาก DB date column เสมอ) · กันพังไว้เฉยๆ
    return { hexNum: 1, yaoLine: 1, meihuaRaw: { method: 'fallback' } };
  }
}

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
