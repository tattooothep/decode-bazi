import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { q } from "@/lib/db";

type ProfileRow = {
  id: string;
  name: string;
  nickname?: string;
  birth_datetime: string;
  birth_location_name?: string;
  day_master?: string;
  day_master_strength?: string;
  yongshen?: { top3?: { stem: string; element: string }[]; climate?: string };
  bazi_pillars?: { pillars?: Record<string, { stem: string; branch: string }>; ge_ju?: string };
};

export default async function DashboardPage() {
  const s = await getSession();
  if (!s) redirect("/signup?tab=login&next=/dashboard");

  const profiles = await q<ProfileRow>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') AS birth_datetime,
            birth_location_name,
            day_master, day_master_strength, yongshen, bazi_pillars
     FROM profiles
     WHERE org_id=$1 AND is_archived=false
     ORDER BY created_at DESC`,
    [s.orgId]
  );

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.85 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")",
        }}
      />

      <nav className="relative z-10 mx-auto flex max-w-[1100px] items-center justify-between px-6 pt-8">
        <Link href="/" className="inline-flex items-baseline gap-2">
          <span className="font-serif text-2xl" style={{ fontVariant:"small-caps", letterSpacing:"0.04em" }}>Decode</span>
          <span className="zh text-base text-[var(--cinnabar)]">解碼</span>
        </Link>
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">{s.email}</span>
          <form action="/api/auth/logout" method="post">
            <button className="text-[var(--cinnabar)] hover:underline" formMethod="post">ออก</button>
          </form>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-[1100px] px-6 pt-12">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground" style={{letterSpacing:"0.32em"}}>YOUR FOLIO</div>
            <h1 className="mt-2 font-serif text-3xl">ดวงในห้องของคุณ</h1>
          </div>
          <Link href="/onboarding" className="rounded-sm bg-[var(--cinnabar)] px-4 py-2 text-[13px] text-white">
            + เพิ่มดวง
          </Link>
        </div>

        {profiles.length === 0 ? (
          <div className="mt-12 rounded-sm border border-dashed border-foreground/30 p-12 text-center">
            <p className="text-foreground/65">ยังไม่มีดวงในห้อง · เริ่มจากดวงคุณเอง</p>
            <Link href="/onboarding" className="mt-4 inline-block rounded-sm bg-[var(--cinnabar)] px-5 py-2.5 text-[13px] text-white">
              สร้างดวงแรก
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <ProfileCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileCard({ p }: { p: ProfileRow }) {
  const pillars = p.bazi_pillars?.pillars;
  const geJu = p.bazi_pillars?.ge_ju;
  const top3 = p.yongshen?.top3 || [];
  return (
    <Link
      href={`/chart-v2?profile=${p.id}`}
      className="block rounded-sm border border-foreground/15 bg-card p-5 transition-colors hover:border-[var(--cinnabar)]/55"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl">{p.name}</h3>
        {p.day_master && (
          <span className="zh text-3xl text-[var(--cinnabar)]" style={{fontWeight:700}}>
            {p.day_master}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">
        {new Date(p.birth_datetime).toLocaleDateString("th-TH", {
          year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok"
        })}
        {p.birth_location_name && ` · ${p.birth_location_name}`}
      </div>

      {pillars && (
        <div className="mt-4 flex justify-around rounded-sm bg-foreground/[0.03] py-3">
          {(["year","month","day","hour"] as const).map(pos => (
            <div key={pos} className="text-center">
              <div className="text-[8px] text-muted-foreground" style={{letterSpacing:"0.18em"}}>{pos.toUpperCase()}</div>
              <div className="zh mt-1 text-base" style={{fontWeight:700}}>
                {pillars[pos]?.stem}
              </div>
              <div className="zh text-base text-foreground/70" style={{fontWeight:600}}>
                {pillars[pos]?.branch}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-[10.5px]">
        {geJu && (
          <span className="zh rounded-full border border-[var(--cinnabar)]/30 px-2 py-0.5 text-[var(--cinnabar)]">
            {geJu}
          </span>
        )}
        {p.day_master_strength && (
          <span className="rounded-full border border-foreground/20 px-2 py-0.5">
            {p.day_master_strength}
          </span>
        )}
        {top3.slice(0, 3).map((y) => (
          <span key={y.stem} className="zh rounded-full bg-foreground/[0.05] px-2 py-0.5">
            {y.stem}
          </span>
        ))}
      </div>
    </Link>
  );
}
