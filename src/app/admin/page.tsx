import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  Boxes,
  CircleDollarSign,
  FileSliders,
  FlaskConical,
  Handshake,
  LibraryBig,
  MessageSquareText,
  Package,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { q, q1 } from "@/lib/db";
import { requireAdmin, type AdminSession } from "@/lib/admin-guard";

export const metadata = { title: "หลังบ้าน · Admin" };
export const dynamic = "force-dynamic";

type Icon = typeof Users;
type DailyPoint = { label: string; thb: number; yam: number; ai: number };
type FeatureSpend = { feature: string; n: number; yam: number };
type RecentTxn = {
  created_at: string;
  email: string;
  delta: number;
  reason: string;
  ref_feature: string | null;
  balance_after: number;
};
type Dashboard = {
  users: {
    total: number;
    active7: number;
    active30: number;
    paying: number;
    suspended: number;
    verified: number;
    profiles: number;
  };
  revenue: { paidOrders: number; totalThb: number; thb30: number; yamSold: number };
  yam: { spent: number; spent7: number; given: number; outstanding: number };
  ai: { costThb: number; cost30Thb: number; tokens: number; calls: number };
  catalog: { packages: number; coupons: number; engineConfigs: number; formulas: number; prompts: number };
  settings: { maintenance: string; signup: string; fusion: string; announcement: string };
  daily: DailyPoint[];
  byFeature: FeatureSpend[];
  recentTxns: RecentTxn[];
  generatedAt: string;
};

const MODULES: { href: string; Icon: Icon; title: string; desc: string; tone: string }[] = [
  { href: "/admin/members", Icon: Users, title: "สมาชิก · User 360", desc: "ค้นหา เติม/หักยาม ระงับ tier free/premium/master · หน้ารายคน", tone: "from-cyan-500/10" },
  { href: "/admin/orders", Icon: CircleDollarSign, title: "ออเดอร์", desc: "refund + clawback ยาม + reverse affiliate", tone: "from-rose-500/10" },
  { href: "/admin/support", Icon: Users, title: "ซัพพอร์ต", desc: "ticket inbox + user reports", tone: "from-sky-500/10" },
  { href: "/admin/packages", Icon: Package, title: "แพ็คเกจ", desc: "คูปอง/โปร · checkout SoT = packages.ts", tone: "from-amber-500/10" },
  { href: "/admin/finance", Icon: CircleDollarSign, title: "การเงิน", desc: "รายได้ · margin · AI · affiliate reserve", tone: "from-emerald-500/10" },
  { href: "/admin/ai-cost", Icon: Settings, title: "ต้นทุน AI", desc: "usage + kill switches", tone: "from-orange-500/10" },
  { href: "/admin/iam", Icon: Settings, title: "แอดมิน & สิทธิ์", desc: "RBAC หลายบทบาท · invite · break-glass ADMIN_EMAILS", tone: "from-violet-500/10" },
  { href: "/admin/affiliate", Icon: Handshake, title: "Affiliate", desc: "pilot allowlist, referral ledger, approval, payout และ reversal audit", tone: "from-teal-500/10" },
  { href: "/admin/settings", Icon: Settings, title: "ตั้งค่าเว็บ", desc: "อัตราเครดิต feature flag ประกาศ และ maintenance", tone: "from-slate-500/10" },
];

const CONTENT: { href: string; Icon: Icon; title: string; desc: string }[] = [
  { href: "/admin/library", Icon: LibraryBig, title: "หอสมุดคัมภีร์", desc: "แหล่งอ้างอิงและ packet ความรู้" },
  { href: "/admin/engine", Icon: SlidersHorizontal, title: "Engine 360", desc: "ค่าคำนวณ น้ำหนัก และ audit" },
  { href: "/admin/formulas", Icon: FileSliders, title: "สูตร", desc: "สูตรหลักและ verification" },
  { href: "/admin/sifu-prompts", Icon: MessageSquareText, title: "Prompt ซินแส", desc: "persona และ guardrail" },
  { href: "/admin/paraphrase", Icon: BookOpenText, title: "Paraphrase", desc: "คลังข้อความอธิบาย" },
  { href: "/admin/research", Icon: FlaskConical, title: "Research", desc: "ผู้ใช้ทดสอบ consent และ event" },
];

const fmtInt = (n: number) => Number(n || 0).toLocaleString("th-TH");
const baht = (n: number) => `฿${fmtInt(n)}`;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "0%");
const num = (v: unknown) => Number(v || 0);

async function safeQ1<T>(sql: string, params: unknown[], fallback: T): Promise<T> {
  try {
    return (await q1<T>(sql, params)) || fallback;
  } catch (err) {
    console.warn("[admin dashboard] q1 failed", (err as Error).message);
    return fallback;
  }
}

async function safeQ<T>(sql: string, params: unknown[], fallback: T[]): Promise<T[]> {
  try {
    return await q<T>(sql, params);
  } catch (err) {
    console.warn("[admin dashboard] q failed", (err as Error).message);
    return fallback;
  }
}

async function loadDashboard(): Promise<Dashboard> {
  const [users, revenue, rev30, yamSpent, yamGiven, ai, ai30, catalog, settings, daily, byFeature, recentTxns] =
    await Promise.all([
      safeQ1(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE last_active_at >= now() - interval '7 days')::int AS active7,
           COUNT(*) FILTER (WHERE last_active_at >= now() - interval '30 days')::int AS active30,
           COUNT(*) FILTER (WHERE tier <> 'free')::int AS paying,
           COUNT(*) FILTER (WHERE is_active=false)::int AS suspended,
           COUNT(*) FILTER (WHERE email_verified=true OR phone_verified=true)::int AS verified,
           (SELECT COUNT(*)::int FROM profiles WHERE is_archived=false) AS profiles
         FROM users`,
        [],
        { total: 0, active7: 0, active30: 0, paying: 0, suspended: 0, verified: 0, profiles: 0 }
      ),
      safeQ1(
        `SELECT COUNT(*)::int AS paid_orders,
                COALESCE(SUM(amount_thb),0)::int AS total_thb,
                COALESCE(SUM(yam_granted),0)::int AS yam_sold
           FROM orders WHERE status='paid'`,
        [],
        { paid_orders: 0, total_thb: 0, yam_sold: 0 }
      ),
      safeQ1(
        `SELECT COALESCE(SUM(amount_thb),0)::int AS thb_30
           FROM orders WHERE status='paid' AND paid_at >= now() - interval '30 days'`,
        [],
        { thb_30: 0 }
      ),
      safeQ1(
        `SELECT COALESCE(SUM(-delta),0)::int AS spent,
                COALESCE(SUM(-delta) FILTER (WHERE created_at >= now() - interval '7 days'),0)::int AS spent7
           FROM hour_transactions WHERE delta < 0`,
        [],
        { spent: 0, spent7: 0 }
      ),
      safeQ1(
        `SELECT COALESCE(SUM(delta),0)::int AS given,
                (SELECT COALESCE(SUM(hour_balance),0)::int FROM users) AS outstanding
           FROM hour_transactions WHERE delta > 0`,
        [],
        { given: 0, outstanding: 0 }
      ),
      safeQ1(
        `SELECT COALESCE(SUM(cost_cents),0)::int AS cost_cents,
                COALESCE(SUM(tokens_used),0)::int AS tokens,
                COUNT(*)::int AS calls
           FROM ai_usage`,
        [],
        { cost_cents: 0, tokens: 0, calls: 0 }
      ),
      safeQ1(
        `SELECT COALESCE(SUM(cost_cents),0)::int AS cost_cents
           FROM ai_usage WHERE date >= (now() - interval '30 days')::date`,
        [],
        { cost_cents: 0 }
      ),
      safeQ1(
        `SELECT
           (SELECT COUNT(*)::int FROM packages WHERE active=true) AS packages,
           (SELECT COUNT(*)::int FROM coupons WHERE active=true) AS coupons,
           (SELECT COUNT(*)::int FROM ref_engine_configs WHERE is_active=true) AS engine_configs,
           (SELECT COUNT(*)::int FROM ref_formulas WHERE is_active=true) AS formulas,
           24::int AS prompts`,
        [],
        { packages: 0, coupons: 0, engine_configs: 0, formulas: 0, prompts: 0 }
      ),
      safeQ1(
        `SELECT
          COALESCE(MAX(value) FILTER (WHERE key='maintenance_mode'), 'off') AS maintenance,
          COALESCE(MAX(value) FILTER (WHERE key='signup_open'), 'on') AS signup,
          COALESCE(MAX(value) FILTER (WHERE key='feature_fusion'), 'on') AS fusion,
          COALESCE(MAX(value) FILTER (WHERE key='announcement'), '') AS announcement
         FROM app_settings`,
        [],
        { maintenance: "off", signup: "on", fusion: "on", announcement: "" }
      ),
      safeQ<DailyPoint>(
        `WITH days AS (
           SELECT generate_series(current_date - 13, current_date, '1 day'::interval)::date AS d
         )
         SELECT to_char(days.d,'MM-DD') AS label,
                COALESCE((SELECT SUM(amount_thb)::int FROM orders o WHERE o.status='paid' AND o.paid_at::date=days.d),0)::int AS thb,
                COALESCE((SELECT SUM(-delta)::int FROM hour_transactions t WHERE t.delta < 0 AND t.created_at::date=days.d),0)::int AS yam,
                COALESCE((SELECT COUNT(*)::int FROM research_ai_messages m WHERE m.created_at::date=days.d),0)::int AS ai
           FROM days ORDER BY days.d`,
        [],
        []
      ),
      safeQ<FeatureSpend>(
        `SELECT COALESCE(ref_feature, reason, 'unknown') AS feature,
                COUNT(*)::int AS n,
                COALESCE(SUM(-delta),0)::int AS yam
           FROM hour_transactions
          WHERE delta < 0
          GROUP BY 1
          ORDER BY yam DESC
          LIMIT 8`,
        [],
        []
      ),
      safeQ<RecentTxn>(
        `SELECT t.created_at::text, u.email, t.delta, t.reason, t.ref_feature, t.balance_after
           FROM hour_transactions t
           JOIN users u ON u.id=t.user_id
          ORDER BY t.created_at DESC
          LIMIT 7`,
        [],
        []
      ),
    ]);

  return {
    users: {
      total: num(users.total),
      active7: num(users.active7),
      active30: num(users.active30),
      paying: num(users.paying),
      suspended: num(users.suspended),
      verified: num(users.verified),
      profiles: num(users.profiles),
    },
    revenue: {
      paidOrders: num(revenue.paid_orders),
      totalThb: num(revenue.total_thb),
      thb30: num(rev30.thb_30),
      yamSold: num(revenue.yam_sold),
    },
    yam: {
      spent: num(yamSpent.spent),
      spent7: num(yamSpent.spent7),
      given: num(yamGiven.given),
      outstanding: num(yamGiven.outstanding),
    },
    ai: {
      costThb: Math.round(num(ai.cost_cents) / 100),
      cost30Thb: Math.round(num(ai30.cost_cents) / 100),
      tokens: num(ai.tokens),
      calls: num(ai.calls),
    },
    catalog: {
      packages: num(catalog.packages),
      coupons: num(catalog.coupons),
      engineConfigs: num(catalog.engine_configs),
      formulas: num(catalog.formulas),
      prompts: num(catalog.prompts),
    },
    settings: {
      maintenance: String(settings.maintenance || "off"),
      signup: String(settings.signup || "on"),
      fusion: String(settings.fusion || "on"),
      announcement: String(settings.announcement || ""),
    },
    daily,
    byFeature,
    recentTxns,
    generatedAt: new Date().toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    }),
  };
}

async function getAdmin(): Promise<AdminSession | null> {
  try {
    return await requireAdmin();
  } catch (err) {
    if (err instanceof Response && err.status === 401) return null;
    throw err;
  }
}

export default async function AdminHub() {
  const admin = await getAdmin();
  if (!admin) redirect("/signup?tab=login&next=/admin");
  const d = await loadDashboard();
  const conversion = pct(d.users.paying, d.users.total);
  const activeRate = pct(d.users.active7, d.users.total);

  return (
    <main className="hk-admin-frame" style={{ display: "block", maxWidth: "80rem", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
      <div>
        <header className="mb-6 grid gap-5 border-b border-white/10 pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
                <span className="rounded border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 font-mono text-amber-200">
                時 HOURKEY ADMIN
              </span>
              <span>อัปเดต {d.generatedAt}</span>
            </div>
            <h1 className="font-serif text-4xl leading-tight md:text-5xl">หลังบ้าน · hourkey</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
              ภาพรวมธุรกิจ สมาชิก ยาม รายได้ ต้นทุน AI และเครื่องมือคุมระบบในหน้าเดียว สำหรับดูสถานะก่อนตัดสินใจทำงานหลังบ้านต่อ
            </p>
            <nav className="mt-4 flex flex-wrap gap-2 text-xs">
              {[
                ["/admin/members", "สมาชิก"],
                ["/admin/orders", "ออเดอร์"],
                ["/admin/support", "ซัพพอร์ต"],
                ["/admin/finance", "การเงิน"],
                ["/admin/ai-cost", "ต้นทุน AI"],
                ["/admin/packages", "แพ็กเกจ"],
                ["/admin/iam", "สิทธิ์"],
                ["/admin/settings", "ตั้งค่า"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="rounded-full border border-white/10 px-3 py-1 text-white/55 hover:border-amber-300/40 hover:text-amber-200">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <StatusPill label="admin" value={admin.email} tone="neutral" />
            <StatusPill label="maintenance" value={d.settings.maintenance === "on" ? "ON" : "OFF"} tone={d.settings.maintenance === "on" ? "warn" : "ok"} />
            <StatusPill label="signup" value={d.settings.signup === "on" ? "OPEN" : "CLOSED"} tone={d.settings.signup === "on" ? "ok" : "warn"} />
          </div>
        </header>

        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard Icon={Users} label="สมาชิกทั้งหมด" value={fmtInt(d.users.total)} sub={`${fmtInt(d.users.active7)} active 7 วัน · ${activeRate}`} />
          <KpiCard Icon={WalletCards} label="ยามคงค้าง" value={fmtInt(d.yam.outstanding)} sub={`ใช้แล้ว ${fmtInt(d.yam.spent)} · 7 วัน ${fmtInt(d.yam.spent7)}`} />
          <KpiCard Icon={CircleDollarSign} label="รายได้รวม" value={baht(d.revenue.totalThb)} sub={`${fmtInt(d.revenue.paidOrders)} paid orders · 30 วัน ${baht(d.revenue.thb30)}`} />
          <KpiCard Icon={Activity} label="ต้นทุน AI" value={baht(d.ai.costThb)} sub={`${fmtInt(d.ai.tokens)} tokens · ${fmtInt(d.ai.calls)} logs`} />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,.85fr)]">
          <div className="rounded-lg border border-white/10 bg-white/[.035] p-4 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">ธุรกิจ 14 วันล่าสุด</div>
                <div className="mt-1 text-xs text-white/45">รายได้ต่อวันเทียบกับการใช้ยามและจำนวนคำถาม AI</div>
              </div>
              <Link href="/admin/finance" className="inline-flex items-center gap-1 rounded border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:border-amber-300/40 hover:text-amber-200">
                การเงิน <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <DailyChart points={d.daily} />
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-white/10 bg-white/[.035] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">สถานะระบบขาย</div>
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <MiniStat label="paying" value={fmtInt(d.users.paying)} sub={conversion} />
                <MiniStat label="verified" value={fmtInt(d.users.verified)} sub="บัญชียืนยัน" />
                <MiniStat label="packages" value={fmtInt(d.catalog.packages)} sub="active" />
                <MiniStat label="coupons" value={fmtInt(d.catalog.coupons)} sub="active" />
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[.035] p-4">
              <div className="mb-3 text-sm font-medium">Feature ที่ใช้ยามสูงสุด</div>
              <FeatureBars rows={d.byFeature} />
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          {MODULES.map(({ href, Icon, title, desc, tone }) => (
            <Link
              key={href}
              href={href}
              className={`group rounded-lg border border-white/10 bg-gradient-to-br ${tone} to-white/[.035] p-4 transition hover:-translate-y-0.5 hover:border-amber-300/35 hover:bg-white/[.055]`}
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20">
                  <Icon className="h-4 w-4 text-amber-200" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-white/30 transition group-hover:text-amber-200" />
              </div>
              <div className="font-serif text-xl">{title}</div>
              <p className="mt-2 text-sm leading-6 text-white/58">{desc}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.86fr)]">
          <div className="rounded-lg border border-white/10 bg-white/[.035] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">เนื้อหา / Engine</div>
                <div className="mt-1 text-xs text-white/45">
                  {fmtInt(d.catalog.engineConfigs)} engine configs · {fmtInt(d.catalog.formulas)} formulas · {fmtInt(d.catalog.prompts)} prompt slots
                </div>
              </div>
              <Boxes className="h-4 w-4 text-white/40" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {CONTENT.map(({ href, Icon, title, desc }) => (
                <Link key={href} href={href} className="group rounded-lg border border-white/10 bg-black/15 p-3 transition hover:border-cyan-200/35 hover:bg-white/[.045]">
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className="h-4 w-4 text-cyan-200/80" />
                    <ArrowUpRight className="h-3.5 w-3.5 text-white/25 group-hover:text-cyan-200" />
                  </div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-white/45">{desc}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Ledger ล่าสุด</div>
                <div className="mt-1 text-xs text-white/45">รายการเติม/หักยามล่าสุดจากทุกระบบ</div>
              </div>
              <TrendingUp className="h-4 w-4 text-amber-200" />
            </div>
            <div className="space-y-2">
              {d.recentTxns.length ? (
                d.recentTxns.map((t, i) => <TxnRow key={`${t.created_at}-${i}`} tx={t} />)
              ) : (
                <div className="rounded-lg border border-dashed border-white/12 p-5 text-center text-sm text-white/40">ยังไม่มีธุรกรรม</div>
              )}
            </div>
          </div>
        </section>

        {d.settings.announcement ? (
          <section className="mt-6 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            <span className="font-medium">ประกาศบนเว็บ:</span> {d.settings.announcement}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "neutral" }) {
  const cls =
    tone === "ok"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-white/10 bg-white/[.035] text-white/68";
  return (
    <span className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${cls}`}>
      <span className="font-mono uppercase text-white/42">{label}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

function KpiCard({ Icon, label, value, sub }: { Icon: Icon; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[.04] p-4 shadow-xl shadow-black/10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
        <Icon className="h-4 w-4 text-amber-200/80" />
      </div>
      <div className="font-serif text-3xl leading-none text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-white/48">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/15 p-3">
      <div className="text-xs uppercase text-white/38">{label}</div>
      <div className="mt-1 font-serif text-2xl">{value}</div>
      <div className="mt-1 text-xs text-white/42">{sub}</div>
    </div>
  );
}

function DailyChart({ points }: { points: DailyPoint[] }) {
  const maxThb = Math.max(1, ...points.map((p) => p.thb));
  const maxYam = Math.max(1, ...points.map((p) => p.yam));
  const maxAi = Math.max(1, ...points.map((p) => p.ai));
  const spark = sparkline(points.map((p) => p.ai), 360, 78);

  return (
    <div>
      <div className="relative mb-4 h-24 overflow-hidden rounded-lg border border-white/10 bg-black/15 px-3 py-2">
        <svg className="h-full w-full" viewBox="0 0 360 78" preserveAspectRatio="none" aria-hidden="true">
          <path d={spark.area} fill="rgba(111,182,176,.08)" />
          <path d={spark.line} fill="none" stroke="rgba(111,182,176,.86)" strokeWidth="2.2" />
        </svg>
        <div className="pointer-events-none absolute left-3 top-2 text-xs text-white/42">AI questions trend</div>
      </div>
      <div className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, points.length)}, minmax(0, 1fr))` }}>
        {points.map((p) => {
          const h = Math.max(4, Math.round((p.thb / maxThb) * 104));
          const yamH = Math.max(4, Math.round((p.yam / maxYam) * 104));
          const aiH = Math.max(4, Math.round((p.ai / maxAi) * 104));
          return (
            <div key={p.label} className="group min-w-0">
              <div className="flex h-28 items-end gap-1">
                <div className="min-h-1 flex-1 rounded-t bg-amber-300/70" style={{ height: `${h}px` }} title={`${p.label} revenue ${baht(p.thb)}`} />
                <div className="min-h-1 flex-1 rounded-t bg-cyan-300/60" style={{ height: `${yamH}px` }} title={`${p.label} yam ${fmtInt(p.yam)}`} />
                <div className="min-h-1 flex-1 rounded-t bg-white/28" style={{ height: `${aiH}px` }} title={`${p.label} AI ${fmtInt(p.ai)}`} />
              </div>
              <div className="mt-2 truncate text-center text-[10px] text-white/34">{p.label}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/48">
        <Legend color="bg-amber-300/70" label="รายได้" />
        <Legend color="bg-cyan-300/60" label="ยามที่ใช้" />
        <Legend color="bg-white/28" label="จำนวนคำถาม AI" />
      </div>
    </div>
  );
}

function sparkline(values: number[], w: number, h: number) {
  if (!values.length) return { line: "", area: "" };
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => {
    const x = Math.round(i * step * 100) / 100;
    const y = Math.round((h - (v / max) * (h - 10) - 5) * 100) / 100;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return { line, area };
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function FeatureBars({ rows }: { rows: FeatureSpend[] }) {
  const max = Math.max(1, ...rows.map((r) => r.yam));
  if (!rows.length) return <div className="rounded-lg border border-dashed border-white/12 p-5 text-center text-sm text-white/40">ยังไม่มีการใช้ยาม</div>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.feature}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-white/72">{r.feature}</span>
            <span className="font-mono text-white/44">{fmtInt(r.yam)} ยาม</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-white/10">
            <div className="h-full rounded bg-gradient-to-r from-amber-300/80 to-cyan-300/70" style={{ width: `${Math.max(4, (r.yam / max) * 100)}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-white/34">{fmtInt(r.n)} ครั้ง</div>
        </div>
      ))}
    </div>
  );
}

function TxnRow({ tx }: { tx: RecentTxn }) {
  const positive = tx.delta >= 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
      <div className="min-w-0">
        <div className="truncate text-sm">{tx.email}</div>
        <div className="mt-1 truncate text-xs text-white/42">
          {fmtDate(tx.created_at)} · {tx.ref_feature || tx.reason}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono text-sm ${positive ? "text-emerald-300" : "text-rose-300"}`}>
          {positive ? "+" : ""}
          {fmtInt(tx.delta)}
        </div>
        <div className="mt-1 font-mono text-[10px] text-white/34">{fmtInt(tx.balance_after)}</div>
      </div>
    </div>
  );
}

function fmtDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
