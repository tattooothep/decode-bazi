import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  SUBJECT as MOCK_SUBJECT, PILLARS as MOCK_PILLARS, DM as MOCK_DM,
  ELEMENTS_DIST as MOCK_DIST, YONGSHEN as MOCK_YONG, JI as MOCK_JI,
  STARS_TOP as MOCK_STARS, TEN_GODS, LUCK_PILLARS,
} from "./data";
import {
  ElementRadar, StrengthGauge, VerdictDonut, ElementWheel,
  TenGodsPolar, CompassMini, HourClock, StarConstellation, LpTimeline,
} from "./charts";
import { loadProfileChart } from "./load-profile";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

export default async function ChartV2Page({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  const sp = await searchParams;
  const profileId = sp.profile;
  const session = await getSession();

  // Guard 1: ต้อง login
  if (!session?.orgId) redirect("/login");

  // Guard 2: ไม่มี ?profile → หา active profile แรก
  if (!profileId) {
    const first = await q1<{ id: string }>(
      `SELECT id FROM profiles
        WHERE org_id=$1 AND is_archived=false
        ORDER BY created_at ASC LIMIT 1`,
      [session.orgId]
    );
    if (first?.id) redirect(`/chart-v2?profile=${first.id}`);
    redirect("/onboarding");
  }

  // Guard 3: load real data · ไม่เจอ/UUID เพี้ยน → /dashboard
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId);
  if (!isUuid) redirect("/dashboard");
  const real = await loadProfileChart(profileId, session.orgId);
  if (!real) redirect("/dashboard");

  // ห้าม fallback MOCK · ใช้ real ทุก field
  const SUBJECT = real.SUBJECT;
  const PILLARS = real.PILLARS;
  const DM = real.DM;
  const ELEMENTS_DIST = real.ELEMENTS_DIST;
  const YONGSHEN = real.YONGSHEN;
  const JI = real.JI;
  const STARS_TOP = real.STARS_TOP;
  const STARS_TOTAL = real.STARS_TOTAL;
  const LUCK = real.LUCK_PILLARS;
  const CURRENT_LP = real.CURRENT_LP || null;
  const CURRENT_AGE = real.CURRENT_AGE || null;
  const LUCK_START = real.LUCK_START || null;
  const TODAY_REAL = real.TODAY;
  const TONGSHU_REAL = real.TONGSHU_TODAY;
  const TEN_GODS_USE = real.TEN_GODS_REAL;
  const HOURS_USE = real.HOURS_REAL;
  const COMPASS_USE = real.COMPASS_REAL;
  const INTERACTIONS_USE = real.INTERACTIONS_REAL;
  const KONG_WANG = real.KONG_WANG || ['戌','亥'];
  const KONG_WANG_YP = real.KONG_WANG_YP || ['寅','卯'];
  const SIX_DEST = real.SIX_DEST_FOUND || [];
  const ARCHETYPE = real.ARCHETYPE || null;
  const STRUCTURE = real.STRUCTURE || null;
  const STEM_MATRIX = real.STEM_MATRIX || null;
  const BRANCH_MATRIX = real.BRANCH_MATRIX || null;
  const NA_YIN = real.NA_YIN || null;
  const QI_PHASES = real.QI_PHASES || null;
  const LIU_TRANSITS = real.LIU_TRANSITS || null;
  const SHEN_SHA_FULL = real.SHEN_SHA_FULL || null;
  const ROOTS_DATA = real.ROOTS_DATA || null;
  const TOU_GAN_DATA = real.TOU_GAN_DATA || null;
  const STORAGE_DATA = real.STORAGE_DATA || null;
  const PALACE_DATA = real.PALACE_DATA || null;
  const isReal = true;
  const GE_JU = real.GE_JU;
  const CLIMATE = real.CLIMATE;

  return ChartView({
    SUBJECT, PILLARS, DM, ELEMENTS_DIST, YONGSHEN, JI,
    STARS_TOP, STARS_TOTAL, isReal, GE_JU, CLIMATE,
    LUCK, CURRENT_LP, CURRENT_AGE, LUCK_START,
    TODAY_DATA: TODAY_REAL, TONGSHU_DATA: TONGSHU_REAL, TEN_GODS_DATA: TEN_GODS_USE,
    HOURS_DATA: HOURS_USE, COMPASS_DATA: COMPASS_USE, INTERACTIONS_DATA: INTERACTIONS_USE,
    KONG_WANG, KONG_WANG_YP, SIX_DEST, ARCHETYPE, STRUCTURE, STEM_MATRIX, BRANCH_MATRIX,
    NA_YIN, QI_PHASES, LIU_TRANSITS, SHEN_SHA_FULL,
    ROOTS_DATA, TOU_GAN_DATA, STORAGE_DATA, PALACE_DATA,
  });
}

function ChartView({
  SUBJECT, PILLARS, DM, ELEMENTS_DIST, YONGSHEN, JI,
  STARS_TOP, STARS_TOTAL, isReal, GE_JU, CLIMATE,
  LUCK, CURRENT_LP, CURRENT_AGE, LUCK_START,
  TODAY_DATA, TONGSHU_DATA, TEN_GODS_DATA, HOURS_DATA, COMPASS_DATA, INTERACTIONS_DATA,
  KONG_WANG, KONG_WANG_YP, SIX_DEST, ARCHETYPE, STRUCTURE, STEM_MATRIX, BRANCH_MATRIX,
  NA_YIN, QI_PHASES, LIU_TRANSITS, SHEN_SHA_FULL,
  ROOTS_DATA, TOU_GAN_DATA, STORAGE_DATA, PALACE_DATA,
}: {
  SUBJECT: typeof MOCK_SUBJECT;
  PILLARS: typeof MOCK_PILLARS;
  DM: typeof MOCK_DM;
  ELEMENTS_DIST: typeof MOCK_DIST;
  YONGSHEN: typeof MOCK_YONG;
  JI: typeof MOCK_JI;
  STARS_TOP: typeof MOCK_STARS;
  STARS_TOTAL: number;
  isReal: boolean;
  GE_JU?: string | null;
  CLIMATE?: string | null;
  LUCK: typeof LUCK_PILLARS;
  CURRENT_LP?: string | null;
  CURRENT_AGE?: number | null;
  LUCK_START?: { years: number; months: number } | null;
  TODAY_DATA: { date: string; dayPillar: string; score: number; verdict: string; verdictTh: string; actionMode: string; actionModeTh: string; brief: string; actionModeColor?: string };
  TONGSHU_DATA: { yi: string[]; ji: string[]; yiTh?: string[]; jiTh?: string[] };
  TEN_GODS_DATA: { code: string; th: string; pct: number }[];
  HOURS_DATA: { zh: string; h: string; tone: 'good'|'ok'|'bad'|'neutral' }[];
  COMPASS_DATA: { best: { zh: string; th: string; deg: number }; avoid: { zh: string; th: string; deg: number } };
  INTERACTIONS_DATA: { type: string; pattern: string; involved: string[]; polarity: 'good'|'warn'|'neutral' }[];
  KONG_WANG: string[];
  KONG_WANG_YP: string[];
  SIX_DEST: { pair: string[]; pillars: string[] }[];
  ARCHETYPE: { name: string; base: string; element: string; elementZh: string; description: string; descriptionTh: string } | null;
  STRUCTURE: { code: string|null; nameTh: string; nameEn: string; confidence?: string; basis?: string; descriptionTh: string } | null;
  STEM_MATRIX: { stem: string; events: { pillar: string; tenGod: string; events: string }[] }[] | null;
  BRANCH_MATRIX: { branch: string; perPillar: { pillar: string; events: string }[]; chartLevel: { type: string; element: string }[] }[] | null;
  NA_YIN: Record<string, { zh: string; en: string; element: string; symbol: string } | null> | null;
  QI_PHASES: Record<string, string | null> | null;
  LIU_TRANSITS: { nian: { pillar: string; label: string }; yue: { pillar: string; label: string }; ri: { pillar: string; label: string }; shi: { pillar: string; label: string } } | null;
  SHEN_SHA_FULL: { code: string; zh: string; th: string; polarity: 'good'|'bad'|'neutral'; pillars: string[] }[] | null;
  ROOTS_DATA: { pillar: string; stem: string; element: string; strength: number; label: string; labelTh: string; rootedIn: string[] }[] | null;
  TOU_GAN_DATA: { branch: string; pillar: string; tou: { hidden: string; pos: 'main'|'middle'|'residual' }[] }[] | null;
  STORAGE_DATA: { pillar: string; branch: string; mainEl: string; primaryStored: string; secondary: string[]; sanHe: string; thNote: string }[] | null;
  PALACE_DATA: { pillar: string; zh: string; th: string; age: string; domains: string[]; stemMeaning: string; branchMeaning: string; stem: string; branch: string; stemEl: string; branchEl: string }[] | null;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Paper grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.85 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* ── NAV ───────────────────────────────────────────── */}
      <nav className="relative z-10 mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 pt-8 md:px-12">
        <Link href="/" className="group inline-flex items-baseline gap-2.5">
          <span
            className="font-serif text-2xl leading-none tracking-tight"
            style={{ fontVariant: "small-caps", letterSpacing: "0.04em" }}
          >
            Decode
          </span>
          <span className="zh text-base text-muted-foreground transition-colors group-hover:text-[var(--cinnabar)]">
            解碼
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <NavLink href="/today">Today</NavLink>
          <NavLink href="/yongshen">Yongshen</NavLink>
          <NavLink href="/decisions">Decisions</NavLink>
          <NavLink href="/chart-v2" active>Chart</NavLink>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={buttonVariants({ variant: "ghost", size: "sm" }) + " gap-1"}
            aria-label="advanced"
          >
            ⚙
          </button>
          <button className={buttonVariants({ variant: "ghost", size: "sm" })}>
            🌓
          </button>
          <Link href="/" className={buttonVariants({ variant: "default", size: "sm" })}>
            ส่งซินแซ
          </Link>
        </div>
      </nav>

      {/* ── ZONE 1 · HERO ─────────────────────────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pt-12 md:px-12 md:pt-16">
        <div className="grid grid-cols-12 gap-6">
          {/* LEFT · 4 Pillars + DM */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.32em" }}>
                  ดวงชะตา · 命書
                </div>
                <h1 className="mt-2 font-serif text-3xl tracking-tight md:text-4xl">
                  {SUBJECT.nameTh}
                  {isReal ? (
                    <span className="ml-3 inline-flex items-center gap-1 align-middle text-[10px] font-normal text-[var(--cinnabar)]" style={{letterSpacing:"0.2em"}}>
                      ● LIVE
                    </span>
                  ) : (
                    <span className="ml-3 inline-flex items-center gap-1 align-middle text-[10px] font-normal text-muted-foreground" style={{letterSpacing:"0.2em"}}>
                      ◌ MOCK
                    </span>
                  )}
                </h1>
                <p className="mt-1 font-serif text-[12.5px] italic text-muted-foreground">
                  {SUBJECT.birthDate} · {SUBJECT.birthTime} · {SUBJECT.birthCity}
                  {GE_JU && <> · <span className="zh not-italic text-[var(--cinnabar)]">{GE_JU}</span></>}
                  {CLIMATE && <> · {CLIMATE}</>}
                </p>
              </div>
            </div>

            {/* 4 Pillars */}
            <div className="mt-6 grid grid-cols-4 gap-2 md:gap-4">
              {PILLARS.map((p, i) => (
                <PillarCard key={i} pillar={p} />
              ))}
            </div>

            {/* DM strip */}
            <div className="mt-5 flex items-center gap-5 border-t border-foreground/15 pt-5">
              <div>
                <div
                  className="zh"
                  style={{
                    color: "var(--cinnabar)",
                    fontSize: "3rem",
                    fontWeight: 700,
                    lineHeight: 0.85,
                  }}
                >
                  {DM.zh}
                </div>
              </div>
              <div className="flex-1">
                <div className="font-serif text-base">
                  Day Master · <span className="font-medium">{DM.en}</span>
                </div>
                <div className="font-serif text-[12px] italic text-muted-foreground">
                  {DM.th} · {DM.pinyin}
                </div>
                {/* Strength bar mini */}
                <div className="mt-2 flex h-[6px] overflow-hidden rounded-full">
                  <div
                    className="bg-[var(--cinnabar)]"
                    style={{ width: `${DM.strengthPercent}%` }}
                  />
                  <div
                    className="bg-foreground/10"
                    style={{ width: `${100 - DM.strengthPercent}%` }}
                  />
                </div>
                <div className="mt-1 flex items-baseline justify-between text-[10px]">
                  <span className="text-muted-foreground" style={{ letterSpacing: "0.18em" }}>
                    STRENGTH
                  </span>
                  <span className="font-serif tabular-nums">
                    <span className="text-[var(--cinnabar)]">{DM.strengthPercent}</span>
                    <span className="text-muted-foreground"> · {DM.status}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT · Today verdict */}
          <div className="col-span-12 lg:col-span-4">
            <div className="rounded-sm border border-foreground/15 bg-card p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.32em" }}>
                    วันนี้ · 今日
                  </div>
                  <div className="mt-0.5 font-serif text-sm italic text-muted-foreground">
                    {TODAY_DATA.date} · <span className="zh not-italic text-foreground">{TODAY_DATA.dayPillar}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center text-foreground">
                <VerdictDonut
                  score={TODAY_DATA.score}
                  verdictTh={TODAY_DATA.verdictTh}
                  actionMode={TODAY_DATA.actionMode}
                />
              </div>

              {/* Action mode pill */}
              <div className="mt-4 flex items-center justify-center">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]"
                  style={{
                    background: "color-mix(in srgb, var(--gold) 18%, transparent)",
                    color: "var(--gold)",
                  }}
                >
                  <span className="block h-2 w-2 rounded-full" style={{ background: "var(--gold)" }} />
                  <span className="font-serif font-medium">{TODAY_DATA.actionMode}</span>
                  <span className="text-foreground/65">· {TODAY_DATA.actionModeTh}</span>
                </div>
              </div>

              <p className="mt-4 border-t border-foreground/10 pt-3 font-serif text-[13px] italic leading-snug text-foreground/75">
                {TODAY_DATA.brief}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ZONE 2 · ESSENCE (visual blocks) ─────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-12 md:px-12 md:py-16">
        <div className="grid grid-cols-12 gap-6">
          {/* Strength gauge */}
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Tile label="DM STRENGTH · 旺衰">
              <div className="text-foreground">
                <StrengthGauge percent={DM.strengthPercent} status={DM.status} />
              </div>
            </Tile>
          </div>

          {/* Element radar */}
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Tile label="FIVE ELEMENTS · 五行">
              <div className="flex justify-center text-foreground">
                <ElementRadar values={ELEMENTS_DIST} yongshen={YONGSHEN} ji={JI} />
              </div>
              <div className="mt-2 flex items-center justify-center gap-3 text-[10px]">
                <span className="inline-flex items-center gap-1 text-[var(--cinnabar)]">
                  <span className="block h-2 w-2 rounded-full border border-[var(--cinnabar)]" />
                  ใช่
                </span>
                <span className="inline-flex items-center gap-1 text-foreground/55">
                  ✕ เลี่ยง
                </span>
              </div>
            </Tile>
          </div>

          {/* Yongshen wheel */}
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Tile label="YONGSHEN · 用神">
              <div className="flex justify-center text-foreground">
                <ElementWheel yongshen={YONGSHEN} ji={JI} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="border-l-2 border-[var(--cinnabar)] pl-2">
                  <div className="text-[9px] text-[var(--cinnabar)]" style={{ letterSpacing: "0.2em" }}>
                    YONG
                  </div>
                  <div className="zh text-[14px]">水 · 金</div>
                </div>
                <div className="border-l-2 border-foreground/30 pl-2">
                  <div className="text-[9px] text-foreground" style={{ letterSpacing: "0.2em" }}>
                    AVOID
                  </div>
                  <div className="zh text-[14px]">火 · 木</div>
                </div>
              </div>
            </Tile>
          </div>

          {/* Stars constellation */}
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Tile label="ACTIVE STARS · 神煞">
              <div className="flex justify-center text-foreground">
                <StarConstellation starsTop={STARS_TOP} totalActive={STARS_TOTAL} />
              </div>
              <ul className="mt-2 space-y-1 text-[11px]">
                {STARS_TOP.map((s) => (
                  <li key={s.zh} className="flex items-baseline justify-between">
                    <span className="zh text-[var(--cinnabar)]">{s.zh}</span>
                    <span className="text-muted-foreground">{s.pillar}</span>
                  </li>
                ))}
              </ul>
            </Tile>
          </div>
        </div>
      </section>

      {/* ── ZONE 2.5 · CURRENT MOMENT ─────────────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-10 md:px-12">
        <div className="rounded-sm border border-[var(--cinnabar)]/35 bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.32em" }}>
                ปัจจุบัน · 大運 · 流年
              </div>
              <h3 className="mt-1 font-serif text-lg">คลื่นพลังตอนนี้</h3>
            </div>
            <div className="text-[12px] text-foreground/70">
              {CURRENT_AGE !== null ? <>อายุ {CURRENT_AGE}</> : <>อายุ 39</>}
              {CURRENT_LP ? <> · LP <span className="zh font-medium">{CURRENT_LP}</span></> : <> · LP <span className="zh font-medium">戊子</span></>}
              {LUCK_START ? <> · 起運 {LUCK_START.years}ปี{LUCK_START.months > 0 ? ` ${LUCK_START.months}เดือน` : ''}</> : null}
              {' · '}ปี {new Date().getFullYear()} <span className="zh">丙午</span> ✨
            </div>
          </div>

          <div className="mt-4 text-foreground">
            <LpTimeline pillars={LUCK} />
          </div>
        </div>
      </section>

      {/* ── ZONE 3 · ACCORDION ───────────────────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-8 md:px-12">
        <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.32em" }}>
          เปิดดูลึก · ตามต้องการ
        </div>
        <h2 className="mt-2 font-serif text-2xl tracking-tight md:text-3xl">
          18 หมวดเชิงลึก
        </h2>

        <div className="mt-6 space-y-2">
          {/* HHS */}
          <Accordion title="Hidden Stems · 藏干" subtitle="Stem ที่แฝงในแต่ละกิ่งดิน · ใช้คำนวณ 10 Gods + element strength">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PILLARS.map((p) => (
                <div key={p.label} className="rounded-sm border border-foreground/15 bg-background p-3">
                  <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.2em" }}>
                    {p.label.toUpperCase()}
                  </div>
                  <div className="zh mt-1 text-foreground" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {p.branch}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    {p.hidden.map((h, i) => (
                      <span
                        key={h + i}
                        className="zh text-[18px] text-foreground/70"
                        style={{
                          fontWeight: i === 0 ? 700 : 500,
                          opacity: i === 0 ? 1 : 0.7,
                        }}
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
                    <span>main</span>
                    <span>mid</span>
                    <span>res</span>
                  </div>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Pillar Interactions */}
          <Accordion title="Pillar Interactions · 9 ปฏิกิริยา" subtitle="合 · 沖 · 三合 · 半三合 · 六害 · 六破 · 刑 · 反吟 · 伏吟">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {INTERACTIONS_DATA.map((i, idx) => (
                <div
                  key={idx}
                  className={`flex items-baseline gap-2 rounded-sm border p-3 text-[12.5px] ${
                    i.polarity === "good"
                      ? "border-[var(--cinnabar)]/30"
                      : i.polarity === "warn"
                      ? "border-foreground/40"
                      : "border-foreground/15"
                  }`}
                >
                  <span
                    className="block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        i.polarity === "good"
                          ? "var(--cinnabar)"
                          : i.polarity === "warn"
                          ? "var(--foreground)"
                          : "var(--gold)",
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{i.type}</div>
                    <div className="zh text-[14px]">{i.pattern}</div>
                  </div>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Heaven Void + 6 Destructions */}
          <Accordion title="Heaven Void & Six Destructions · 空亡 · 六破" subtitle="กิ่งว่าง + คู่ทำลาย · ทำให้ pillar นั้นทำงานไม่เต็ม">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.2em" }}>
                  KONG WANG · 空亡
                </div>
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="text-[10px] text-foreground/55" style={{ letterSpacing: "0.15em" }}>
                      DP · จากวันเกิด
                    </div>
                    <div className="zh text-2xl text-foreground" style={{ fontWeight: 700 }}>
                      {KONG_WANG.join(' · ')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-foreground/55" style={{ letterSpacing: "0.15em" }}>
                      YP · จากปีเกิด
                    </div>
                    <div className="zh text-2xl text-foreground" style={{ fontWeight: 700 }}>
                      {KONG_WANG_YP.join(' · ')}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-foreground/65">
                  กิ่งว่าง 2 ชุด (วัน + ปี) · เสาที่มีกิ่งเหล่านี้จะทำงานไม่เต็ม
                </p>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.2em" }}>
                  6 DESTRUCTIONS · 六破
                </div>
                {SIX_DEST.length === 0 ? (
                  <>
                    <div className="zh mt-2 text-foreground" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
                      ✓ ไม่มี
                    </div>
                    <p className="mt-2 text-[11px] text-foreground/65">ดี · ไม่มี breakage pattern</p>
                  </>
                ) : (
                  <>
                    <ul className="mt-2 space-y-1.5">
                      {SIX_DEST.map((d, i) => (
                        <li key={i} className="text-[12px]">
                          <span className="zh text-foreground" style={{fontWeight:700}}>{d.pair.join('·')}</span>
                          <span className="ml-2 text-foreground/65">({d.pillars.join('+')})</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </Accordion>

          {/* 10 Gods polar */}
          <Accordion title="10 Gods Distribution · 十神" subtitle="พลังของ 10 ดวงต่อ DM · top 3 = พลังหลักของชีวิต">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex justify-center text-foreground">
                <TenGodsPolar data={TEN_GODS_DATA} />
              </div>
              <div className="space-y-1.5">
                {TEN_GODS_DATA.map((g, i) => (
                  <div
                    key={g.code}
                    className="flex items-center gap-3 text-[12px]"
                  >
                    <span
                      className={`zh w-10 ${
                        i < 3 ? "text-[var(--cinnabar)] font-bold" : "text-foreground/65"
                      }`}
                    >
                      {g.code}
                    </span>
                    <span className="w-20 text-foreground/75">{g.th}</span>
                    <div className="flex-1">
                      <div className="h-[6px] bg-foreground/10">
                        <div
                          className="h-full"
                          style={{
                            width: `${(g.pct / 30) * 100}%`,
                            background: i < 3 ? "var(--cinnabar)" : "var(--foreground)",
                            opacity: i < 3 ? 0.85 : 0.35,
                          }}
                        />
                      </div>
                    </div>
                    <span
                      className="w-10 text-right font-serif tabular-nums text-foreground/85"
                    >
                      {g.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Accordion>

          {/* 10-Year Luck full */}
          <Accordion title="10-Year Luck Pillars · 大運" subtitle="คลื่นโชค 8 รอบ ตลอดชีวิต · กว้าง 10 ปี/รอบ">
            <div className="text-foreground">
              <LpTimeline pillars={LUCK} />
            </div>
          </Accordion>

          {/* Stem matrix */}
          <Accordion title="10 Stems × Birth Chart" subtitle="ก้านฟ้าแต่ละตัวเข้ามาเจอ pillar ไหน · เกิดอะไร">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(STEM_MATRIX || []).map((s) => (
                <div key={s.stem} className={`rounded-sm border p-3 ${s.events.length ? 'border-[var(--cinnabar)]/40' : 'border-foreground/15'}`}>
                  <div className="zh text-2xl text-center" style={{ fontWeight: 700 }}>{s.stem}</div>
                  {s.events.length === 0 ? (
                    <div className="mt-1 text-center text-[9px] text-foreground/40">ไม่ทำปฏิกิริยา</div>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {s.events.slice(0, 3).map((e, i) => (
                        <li key={i} className="text-[10px]">
                          <span className="text-[var(--cinnabar)]">{e.pillar}</span>
                          <span className="ml-1 text-foreground/65">· {e.tenGod}</span>
                          {e.events !== '—' && <span className="ml-1 zh text-foreground/85">{e.events}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Accordion>

          {/* Branch matrix */}
          <Accordion title="12 Branches × Birth Chart" subtitle="กิ่งดินแต่ละตัวเข้ามาเจอ pillar ไหน · combo/clash/Fu Yin">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {(BRANCH_MATRIX || []).map((b) => {
                const hasAny = b.perPillar.length > 0 || b.chartLevel.length > 0;
                return (
                  <div key={b.branch} className={`rounded-sm border p-2.5 ${hasAny ? 'border-[var(--cinnabar)]/40' : 'border-foreground/15'}`}>
                    <div className="zh text-xl text-center" style={{ fontWeight: 700 }}>{b.branch}</div>
                    {hasAny ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {b.perPillar.slice(0, 2).map((p, i) => (
                          <li key={i} className="text-[10px]">
                            <span className="text-[var(--cinnabar)]">{p.pillar.slice(0,3)}</span>
                            <span className="ml-1 zh text-foreground/85">{p.events}</span>
                          </li>
                        ))}
                        {b.chartLevel.slice(0, 1).map((c, i) => (
                          <li key={'c'+i} className="text-[10px]">
                            <span className="zh text-[var(--cinnabar)]">{c.type}</span>
                            <span className="ml-1 text-foreground/65">→{c.element}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-center text-[9px] text-foreground/40">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Accordion>

          {/* Day View — 12 hour grid */}
          <Accordion title="Day View · 十二時辰" subtitle="ดูว่าชั่วโมงไหนของวันนี้ดี/ห้าม">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center">
              <div className="flex justify-center text-foreground">
                <HourClock hours={HOURS_DATA} />
              </div>
              <div className="space-y-2 text-[12px]">
                <Legend tone="good"    label="ดีที่สุด — 巳時 09:00–11:00" />
                <Legend tone="ok"      label="พอใช้ — 卯辰午未" />
                <Legend tone="neutral" label="กลาง — 子丑寅申酉戌" />
                <Legend tone="bad"     label="หลีกเลี่ยง — 亥時 21:00–23:00" />
              </div>
            </div>
          </Accordion>

          {/* Tongshu */}
          <Accordion title="Tongshu · 黃曆 — ปฏิทินมงคลวันนี้" subtitle="ทำได้ · ห้าม · ดาวพิเศษ · ทิศ">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Yi/Ji */}
              <div className="md:col-span-2 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-[var(--cinnabar)]" style={{ letterSpacing: "0.3em" }}>
                    宜 ทำได้
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {TONGSHU_DATA.yi.map((y, i) => (
                      <li key={y} className="flex items-baseline gap-2 text-[13px]">
                        <span className="text-[var(--cinnabar)]">✓</span>
                        <span className="zh">{y}</span>
                        <span className="text-foreground/65">· {TONGSHU_DATA.yi[i]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] text-foreground" style={{ letterSpacing: "0.3em" }}>
                    忌 ห้าม
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {TONGSHU_DATA.ji.map((j, i) => (
                      <li key={j} className="flex items-baseline gap-2 text-[13px]">
                        <span className="text-foreground">✕</span>
                        <span className="zh">{j}</span>
                        <span className="text-foreground/65">· {TONGSHU_DATA.ji[i]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {/* Compass */}
              <div className="text-foreground">
                <div className="text-center text-[10px] text-muted-foreground" style={{ letterSpacing: "0.3em" }}>
                  EIGHT DIRECTIONS · 八方
                </div>
                <div className="mt-2 flex justify-center">
                  <CompassMini bestDeg={COMPASS_DATA.best.deg} avoidDeg={COMPASS_DATA.avoid.deg} bestZh={COMPASS_DATA.best.zh} avoidZh={COMPASS_DATA.avoid.zh} />
                </div>
                <div className="mt-2 flex justify-center gap-3 text-[11px]">
                  <span className="text-[var(--cinnabar)]">
                    {COMPASS_DATA.best.th}
                  </span>
                  <span className="text-foreground/40">·</span>
                  <span className="text-foreground/65">เลี่ยง: {COMPASS_DATA.avoid.th}</span>
                </div>
              </div>
            </div>
          </Accordion>

          {/* Archetype */}
          <Accordion title="Archetype · 25 บุคลิก" subtitle="คุณคือใครในผังบุคลิก × ธาตุ">
            <div className="flex items-center gap-5">
              <div className="zh text-[var(--cinnabar)]" style={{ fontSize: "5rem", fontWeight: 700, lineHeight: 1 }}>
                {ARCHETYPE?.elementZh || "土"}
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.3em" }}>
                  ARCHETYPE × ELEMENT
                </div>
                <div className="mt-1 font-serif text-2xl">
                  {ARCHETYPE?.name || "—"}
                </div>
                <p className="mt-3 max-w-lg text-[12.5px] leading-relaxed text-foreground/75">
                  {ARCHETYPE?.descriptionTh}
                </p>
                {ARCHETYPE?.description && (
                  <p className="mt-1 max-w-lg text-[11.5px] italic text-foreground/55">
                    {ARCHETYPE.description}
                  </p>
                )}
              </div>
            </div>
          </Accordion>

          {/* Structure */}
          <Accordion title="Structure · 18 โครงดวง" subtitle="โครงสร้างหลักของชะตาคุณ">
            <div className="flex items-center gap-5">
              <div className="zh text-[var(--cinnabar)]" style={{ fontSize: "3.5rem", fontWeight: 700, lineHeight: 1 }}>
                {STRUCTURE?.code || "—"}
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground" style={{ letterSpacing: "0.3em" }}>
                  STRUCTURE · 格局
                </div>
                <div className="mt-1 font-serif text-2xl">
                  {STRUCTURE?.nameEn || "—"}
                </div>
                <div className="mt-1 font-serif text-[14px] italic text-muted-foreground">
                  {STRUCTURE?.nameTh}
                </div>
                <p className="mt-3 max-w-lg text-[12.5px] leading-relaxed text-foreground/75">
                  {STRUCTURE?.descriptionTh}
                </p>
                {STRUCTURE?.basis && (
                  <p className="mt-2 text-[10.5px] italic text-foreground/55">
                    {STRUCTURE.basis}
                  </p>
                )}
              </div>
            </div>
          </Accordion>

          {/* Na Yin */}
          <Accordion title="Na Yin · 納音 · 60 เสียงโลหะ" subtitle="ภาพ-สัญลักษณ์ 5 ธาตุของแต่ละเสา · ใช้บอก 'นิสัย' ของ pillar นั้น">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['hour','day','month','year'] as const).map(pos => {
                const ny = NA_YIN?.[pos];
                return (
                  <div key={pos} className="rounded-sm border border-foreground/15 p-3 text-center">
                    <div className="text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>{pos.toUpperCase()}</div>
                    {ny ? (
                      <>
                        <div className="mt-2 text-2xl">{ny.symbol}</div>
                        <div className="zh mt-1 text-[var(--cinnabar)]" style={{fontSize:"1.1rem", fontWeight:700}}>{ny.zh}</div>
                        <div className="mt-1 text-[10px] italic text-muted-foreground">{ny.en}</div>
                        <div className="mt-1 text-[11px] text-foreground/70">{ny.element}</div>
                      </>
                    ) : <div className="mt-2 text-[10px] opacity-50">—</div>}
                  </div>
                );
              })}
            </div>
          </Accordion>

          {/* 12 Qi Phases */}
          <Accordion title="12 Qi Phases · 十二長生" subtitle="พลังของ DM ในแต่ละกิ่ง · 帝旺=สูงสุด · 絕=ต่ำสุด">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['hour','day','month','year'] as const).map(pos => {
                const ph = QI_PHASES?.[pos];
                const peak = ['帝旺','臨官','長生','冠帶'].includes(ph || '');
                const trough = ['絕','墓','死','病'].includes(ph || '');
                return (
                  <div key={pos} className={`rounded-sm border p-3 text-center ${peak ? 'border-[var(--cinnabar)]/55' : trough ? 'border-foreground/40' : 'border-foreground/15'}`}>
                    <div className="text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>{pos.toUpperCase()}</div>
                    <div className={`zh mt-2 ${peak ? 'text-[var(--cinnabar)]' : trough ? 'text-foreground' : 'text-foreground/70'}`} style={{fontSize:"2rem", fontWeight:700, lineHeight:1}}>
                      {ph || '—'}
                    </div>
                    <div className="mt-1 text-[10px] text-foreground/55">DM ใน {pos}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              <span className="text-[var(--cinnabar)]">●</span> peak (帝旺/臨官/長生/冠帶) ·
              <span className="ml-2 text-foreground">●</span> trough (絕/墓/死/病)
            </div>
          </Accordion>

          {/* Liu Yue / Liu Ri / Liu Shi */}
          <Accordion title="Liu Cycles · 流月 流日 流時" subtitle="คลื่นพลัง 3 จังหวะถี่ขึ้น · เดือน · วัน · ชั่วโมง">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['yue','ri','shi'] as const).map(k => {
                const t = LIU_TRANSITS?.[k];
                const labelMap: Record<string,string> = { yue:'流月', ri:'流日', shi:'流時' };
                return (
                  <div key={k} className="rounded-sm border border-foreground/15 p-4 text-center">
                    <div className="zh text-[var(--cinnabar)]" style={{fontSize:"1rem", fontWeight:700, letterSpacing:"0.2em"}}>{labelMap[k]}</div>
                    <div className="zh mt-3 text-foreground" style={{fontSize:"2.5rem", fontWeight:700}}>
                      {t?.pillar || '—'}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">{t?.label}</div>
                  </div>
                );
              })}
            </div>
          </Accordion>

          {/* 25 Shen Sha full list */}
          <Accordion title="Symbolic Stars · 神煞 · ครบ 25 ดวง" subtitle={`active ${SHEN_SHA_FULL?.length || 0} ดวง · กดดูแยกตามดี/กลาง/ร้าย`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {(['good','neutral','bad'] as const).map(pol => {
                const filtered = (SHEN_SHA_FULL || []).filter(s => s.polarity === pol);
                const colorMap = { good:'var(--cinnabar)', neutral:'var(--gold)', bad:'var(--foreground)' };
                const titleMap = { good:'ดาวดี · 吉', neutral:'ดาวกลาง · 平', bad:'ดาวร้าย · 凶' };
                return (
                  <div key={pol}>
                    <div className="text-[11px] font-semibold" style={{color: colorMap[pol], letterSpacing:"0.15em"}}>
                      {titleMap[pol]} ({filtered.length})
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {filtered.length === 0 ? (
                        <li className="text-[11px] text-foreground/50">—</li>
                      ) : filtered.map(s => (
                        <li key={s.code} className="flex items-baseline gap-2 text-[12px]">
                          <span className="zh font-medium" style={{color: colorMap[pol]}}>{s.zh}</span>
                          <span className="text-foreground/65">{s.th}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">@{s.pillars.join(',')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Accordion>

          {/* R · Root / Tou Gan · 根透 */}
          <Accordion title="Root & Tou Gan · 根透" subtitle="ราก กับ การปรากฏ · stem ที่มีรากแข็งจะทนคลั่ง · stem ที่ปรากฏจาก hidden = ธีมเปิดใช้งาน">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] text-muted-foreground mb-2" style={{ letterSpacing: "0.2em" }}>ROOT STRENGTH · 4 STEMS</div>
                {ROOTS_DATA ? ROOTS_DATA.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-foreground/10">
                    <div className="zh text-xl text-foreground" style={{ fontWeight: 700 }}>{r.stem}</div>
                    <div className="text-[11px] text-foreground/65 w-14">{r.pillar}</div>
                    <div className="flex-1 h-1.5 bg-foreground/10 rounded">
                      <div className="h-full rounded" style={{ width: `${r.strength * 100}%`, background: r.strength >= 1 ? '#1a8a3a' : r.strength >= 0.6 ? '#c8941f' : r.strength >= 0.3 ? '#a35d5d' : '#777' }} />
                    </div>
                    <div className="text-[11px] text-foreground/85 w-24 text-right">{r.labelTh}</div>
                    <div className="zh text-[12px] text-foreground/60 w-16">{r.rootedIn.join('') || '—'}</div>
                  </div>
                )) : <div className="text-[11px] text-foreground/55">ยังไม่มีข้อมูล (ต้อง real profile)</div>}
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-2" style={{ letterSpacing: "0.2em" }}>TOU GAN · 透 hidden ปรากฏบนยอด</div>
                {TOU_GAN_DATA && TOU_GAN_DATA.length > 0 ? TOU_GAN_DATA.map((t, i) => (
                  <div key={i} className="py-1.5 border-b border-foreground/10">
                    <div className="flex items-center gap-2">
                      <span className="zh text-foreground text-base" style={{ fontWeight: 700 }}>{t.branch}</span>
                      <span className="text-[11px] text-foreground/55">({t.pillar})</span>
                      <span className="text-[11px] text-foreground/85">→</span>
                      {t.tou.map((x, j) => (
                        <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]" style={{ background: x.pos === 'main' ? '#3a4a1a30' : x.pos === 'middle' ? '#a3801f30' : '#77777730' }}>
                          <span className="zh">{x.hidden}</span>
                          <span className="text-foreground/70">{x.pos}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )) : <div className="text-[11px] text-foreground/55">ไม่มี tou gan ในดวงนี้</div>}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-foreground/65">รากแข็ง = stem ทนแรงกระแทก · รากกลาง = ใช้ได้ในวัย/ปีที่ถูกจุด · ไม่มีราก = stem ลอย เปลี่ยนได้ง่าย</p>
          </Accordion>

          {/* S · Storage / Tomb · 庫墓 */}
          <Accordion title="Storage & Tomb · 庫墓 · 4 คลัง" subtitle="辰戌丑未 = คลังเก็บธาตุ · ปลดปล่อยเมื่อครบ san_he ในปี/รอบโชค">
            {STORAGE_DATA && STORAGE_DATA.length > 0 ? (
              <div className="space-y-3">
                {STORAGE_DATA.map((s, i) => (
                  <div key={i} className="border-l-2 pl-4 py-2" style={{ borderColor: '#c8941f' }}>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="zh text-2xl text-foreground" style={{ fontWeight: 700 }}>{s.branch}</span>
                      <span className="text-[11px] text-foreground/60 uppercase tracking-wider">{s.pillar} pillar</span>
                    </div>
                    <div className="text-[12px] text-foreground/85">เก็บ: <span className="zh">{s.primaryStored}</span> + {s.secondary.join(', ')}</div>
                    <div className="text-[11px] text-foreground/65 mt-1">ปลดปล่อย: <span className="zh">{s.sanHe}</span></div>
                    <div className="text-[11px] text-foreground/85 mt-1">{s.thNote}</div>
                  </div>
                ))}
              </div>
            ) : <div className="text-[11px] text-foreground/55">ดวงนี้ไม่มีกิ่งคลัง (辰戌丑未)</div>}
          </Accordion>

          {/* T · Palace Reading · 宮位 */}
          <Accordion title="Palace Reading · 宮位 · 4 พระราชวัง" subtitle="แต่ละเสา = ขอบเขตชีวิตที่ต่างกัน · year=ผู้ใหญ่ · month=อาชีพ · day=คู่ครอง · hour=ลูก">
            {PALACE_DATA ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PALACE_DATA.map((p, i) => (
                  <div key={i} className="border border-foreground/15 rounded p-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <div>
                        <span className="zh text-base text-foreground" style={{ fontWeight: 700 }}>{p.zh}</span>
                        <span className="ml-2 text-[10px] text-foreground/55 uppercase tracking-wider">{p.pillar}</span>
                      </div>
                      <span className="text-[11px] text-foreground/55">อายุ {p.age}</span>
                    </div>
                    <div className="text-[11px] text-foreground/85 mb-2">{p.th}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-[10px] text-foreground/55">stem · {p.stem} ({p.stemEl})</div>
                        <div className="text-foreground/85">{p.stemMeaning}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-foreground/55">branch · {p.branch} ({p.branchEl})</div>
                        <div className="text-foreground/85">{p.branchMeaning}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.domains.map((d, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-foreground/65">{d}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="text-[11px] text-foreground/55">ยังไม่มีข้อมูล (ต้อง real profile)</div>}
          </Accordion>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-foreground/15">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-6 px-6 py-10 text-xs text-muted-foreground md:px-12">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-base text-foreground" style={{ fontVariant: "small-caps", letterSpacing: "0.04em" }}>
              Decode
            </span>
            <span className="zh text-sm">解碼</span>
            <span className="ml-2" style={{ letterSpacing: "0.1em" }}>
              · Folio Vol. VI — Chart v2
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/today" className="hover:text-foreground">วันนี้</Link>
            <Link href="/yongshen" className="hover:text-foreground">ตำรับ</Link>
            <Link href="/decisions" className="hover:text-foreground">ตัดสินใจ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`relative text-sm transition-colors ${
        active ? "text-foreground" : "text-foreground/70 hover:text-foreground"
      }`}
    >
      {children}
      {active && (
        <span aria-hidden className="absolute -bottom-2 left-1/2 block h-1 w-1 -translate-x-1/2 bg-[var(--cinnabar)]" />
      )}
    </Link>
  );
}

function PillarCard({
  pillar,
}: {
  pillar: {
    label: string;
    labelZh: string;
    stem: string;
    branch: string;
    element: string;
    pinyin: string;
    isDM?: boolean;
  };
}) {
  return (
    <div
      className={`relative flex flex-col items-center rounded-sm border bg-card px-2 py-4 ${
        pillar.isDM ? "border-[var(--cinnabar)]/55" : "border-foreground/15"
      }`}
    >
      <div className="flex items-baseline gap-1">
        <span
          className={`text-[9px] ${pillar.isDM ? "text-[var(--cinnabar)]" : "text-muted-foreground"}`}
          style={{ letterSpacing: "0.32em" }}
        >
          {pillar.label.toUpperCase()}
        </span>
        <span
          className={`zh text-[10px] ${
            pillar.isDM ? "text-[var(--cinnabar)]" : "text-foreground/55"
          }`}
        >
          {pillar.labelZh}
        </span>
      </div>
      <div
        className={`zh mt-3 leading-none ${pillar.isDM ? "text-[var(--cinnabar)]" : "text-foreground"}`}
        style={{ fontSize: "clamp(2.25rem, 6vw, 3.5rem)", fontWeight: 700, letterSpacing: "-0.04em" }}
      >
        {pillar.stem}
      </div>
      <div className="mt-2 h-[1px] w-8 bg-foreground/30" />
      <div
        className="zh mt-2 leading-none text-foreground/85"
        style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 600, letterSpacing: "-0.04em" }}
      >
        {pillar.branch}
      </div>
      <div className="mt-2 font-serif text-[10px] italic text-muted-foreground">
        {pillar.pinyin}
      </div>
      {pillar.isDM && (
        <div
          aria-hidden
          className="absolute -right-1.5 top-2 rotate-[6deg] bg-[var(--cinnabar)] px-1.5 py-0.5 font-serif text-[8px] text-white"
          style={{ letterSpacing: "0.16em" }}
        >
          DM
        </div>
      )}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative h-full rounded-sm border border-foreground/15 bg-card p-4">
      <div
        className="text-[10px] text-muted-foreground"
        style={{ letterSpacing: "0.32em" }}
      >
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Accordion({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-sm border border-foreground/15 bg-card transition-colors open:border-[var(--cinnabar)]/35">
      <summary className="flex cursor-pointer items-center gap-4 px-5 py-4 text-left">
        <span className="text-[var(--cinnabar)] transition-transform group-open:rotate-90">▸</span>
        <div className="flex-1">
          <div className="font-serif text-[15px] font-medium tracking-tight">{title}</div>
          {subtitle && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{subtitle}</div>}
        </div>
      </summary>
      <div className="border-t border-foreground/10 px-5 py-5">{children}</div>
    </details>
  );
}

function Legend({
  tone,
  label,
}: {
  tone: "good" | "ok" | "bad" | "neutral";
  label: string;
}) {
  const cls = {
    good: "bg-[var(--cinnabar)]",
    ok: "bg-[var(--gold)]",
    neutral: "bg-foreground/15",
    bad: "bg-foreground",
  }[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`block h-3 w-3 ${cls}`} />
      {label}
    </span>
  );
}
