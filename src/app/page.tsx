import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────────────────
// Decode · Landing
// Editorial Chinese scroll · ink on rice paper · single cinnabar seal
// ─────────────────────────────────────────────────────────────────────

const DISCIPLINES = [
  { th: "ปาจื้อ",   zh: "八字",   en: "BaZi",       num: "I"  },
  { th: "ฉีเหมิน",  zh: "奇門",   en: "Qi Men",     num: "II" },
  { th: "ทงชู",     zh: "通書",   en: "Tong Shu",   num: "III"},
  { th: "ฮวงจุ้ย",  zh: "風水",   en: "Feng Shui",  num: "IV" },
];

const FEATURES = [
  {
    no: "01",
    zhMark: "晨",
    th: "สรุปวันเช้า",
    en: "Daily Brief",
    zh: "每日早報",
    body: "ทุกเช้า 06:00 — สรุปดวงวันนี้ของคุณเป็นหนึ่งหน้ากระดาษ ทำได้ ทำไม่ได้ และเหตุผลแบบที่ซินแสจริงเขียน",
  },
  {
    no: "02",
    zhMark: "決",
    th: "ตัดสินใจอย่างฉลาด",
    en: "Quick Decision",
    zh: "智能決策",
    body: "เลือกว่าจะปิดดีลกับใคร เวลาไหน ทิศไหน ระบบประมวลปาจื้อคุณ + ฉีเหมิน + ทงชู ตอบเป็นคะแนน 0–100",
  },
  {
    no: "03",
    zhMark: "向",
    th: "ทิศมงคลสด",
    en: "Lucky Direction",
    zh: "吉方羅盤",
    body: "เข็มทิศหลอผานใช้กล้องมือถือ จับทิศจริง ระบุประตูชีวิต 開門 และเตือนทิศ 5黃 ที่ห้ามนัดงาน",
  },
];

// ดวงตัวอย่าง (1984-12-31 13:15 ♂ GMT+7)
const PILLARS = [
  { label: "ปี",       en: "Year",  stem: "甲", branch: "子", elem: "Wood",  god: "Direct Officer" },
  { label: "เดือน",    en: "Month", stem: "丙", branch: "子", elem: "Fire",  god: "Direct Resource" },
  { label: "วัน",      en: "Day",   stem: "己", branch: "亥", elem: "Earth", god: "Day Master", isDM: true },
  { label: "ชั่วโมง",  en: "Hour",  stem: "辛", branch: "未", elem: "Metal", god: "Eating God" },
];

// element → chart token
const ELEM_VAR: Record<string, string> = {
  Wood:  "var(--chart-1)",
  Fire:  "var(--chart-2)",
  Earth: "var(--chart-3)",
  Metal: "var(--chart-4)",
  Water: "var(--chart-5)",
};

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Paper grain — subtle SVG noise */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.85 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* ── NAV ───────────────────────────────────────────────── */}
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
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#chart">Chart</NavLink>
          <NavLink href="#wisdom">Wisdom</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            เข้าสู่ระบบ
          </Link>
          <Link href="/signup" className={buttonVariants({ variant: "default", size: "sm" })}>
            เริ่มสร้างดวง
          </Link>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pt-24 pb-32 md:px-12 md:pt-36 md:pb-48">
        <div className="grid grid-cols-12 gap-8">
          {/* Left: editorial label */}
          <aside className="col-span-12 md:col-span-2">
            <div className="mb-2 text-[10px] tracking-[0.3em] text-muted-foreground">
              EST. 2026
            </div>
            <div className="font-serif text-sm italic text-muted-foreground">
              Vol. I — Issue 01
            </div>
          </aside>

          {/* Centre: massive wordmark */}
          <div className="col-span-12 md:col-span-8">
            <h1 className="font-serif text-[clamp(4.5rem,14vw,12rem)] leading-[0.85] tracking-[-0.045em]">
              Decode
              <span className="ml-3 inline-block translate-y-[-0.15em] align-baseline text-[0.4em] not-italic text-[var(--cinnabar)]">
                .
              </span>
            </h1>

            <p className="mt-10 max-w-2xl text-pretty text-[17px] leading-relaxed text-foreground/80 md:text-[19px]">
              <span className="font-serif italic">An almanac for the modern decision-maker.</span>{" "}
              ดวงปาจื้อ ฉีเหมิน และทงชู สามศาสตร์โบราณของจีน ถูกเรียบเรียงเป็นหน้าเดียว สำหรับวันที่คุณต้องเลือก
            </p>

            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className={`${buttonVariants({ size: "lg" })} h-12 px-7 text-[15px]`}
              >
                เริ่มสร้างดวง
                <span className="ml-2 opacity-60">→</span>
              </Link>
              <Link
                href="/sample"
                className={`${buttonVariants({ size: "lg", variant: "ghost" })} h-12 px-5 text-[15px]`}
              >
                ดูดวงตัวอย่าง
              </Link>

              <span
                className="ml-2 inline-flex items-center gap-2 text-xs text-muted-foreground"
                style={{ letterSpacing: "0.06em" }}
              >
                <span className="block h-px w-6 bg-foreground/30" />
                ฟรี · ไม่ต้องผูกบัตร
              </span>
            </div>
          </div>

          {/* Right: vertical Chinese scroll column with cinnabar seal */}
          <aside className="relative col-span-12 mt-12 hidden md:col-span-2 md:mt-0 md:block">
            <div className="relative h-full">
              <div
                className="zh absolute right-0 top-0 flex flex-col items-center text-foreground/85"
                style={{
                  writingMode: "vertical-rl",
                  fontSize: "clamp(2.5rem, 4vw, 3.5rem)",
                  lineHeight: "1.4",
                  letterSpacing: "0.15em",
                }}
              >
                <span>解</span>
                <span>碼</span>
                <span className="my-4 inline-block h-px w-6 rotate-90 bg-foreground/40" />
                <span className="text-base text-muted-foreground" style={{ letterSpacing: "0.4em" }}>
                  命運
                </span>
              </div>

              {/* Cinnabar seal — calligrapher's signature */}
              <div
                className="absolute right-1 top-2 -translate-y-12 rotate-[-4deg] select-none"
                aria-hidden
              >
                <div
                  className="zh flex h-14 w-14 flex-col items-center justify-center text-[10px] leading-tight text-white"
                  style={{
                    background: "var(--cinnabar)",
                    boxShadow:
                      "inset 0 0 0 2px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.15)",
                  }}
                >
                  <span className="text-[18px] font-bold leading-none">印</span>
                  <span className="mt-0.5 text-[8px] tracking-wider opacity-80">DECODE</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Trust strip */}
        <div className="mt-24 border-t border-foreground/15 pt-8">
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
            {DISCIPLINES.map((d) => (
              <div key={d.zh} className="flex items-baseline gap-3">
                <span
                  className="font-serif text-xs italic text-muted-foreground"
                  style={{ letterSpacing: "0.1em" }}
                >
                  no. {d.num}
                </span>
                <div>
                  <div className="text-[15px] font-medium text-foreground">{d.th}</div>
                  <div className="zh text-sm text-muted-foreground">
                    {d.zh}{" "}
                    <span className="font-serif text-[11px] italic text-muted-foreground/70">
                      / {d.en}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────── */}
      <section
        id="features"
        className="relative z-10 mx-auto w-full max-w-[1400px] border-t border-foreground/15 px-6 py-24 md:px-12 md:py-32"
      >
        <header className="mb-16 grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-4">
            <div
              className="mb-3 text-[10px] text-muted-foreground"
              style={{ letterSpacing: "0.3em" }}
            >
              CHAPTER · I
            </div>
            <h2 className="font-serif text-5xl leading-[0.95] tracking-tight md:text-6xl">
              สามเครื่องมือ
              <br />
              <span className="italic text-foreground/70">สำหรับวันที่ต้องเลือก</span>
            </h2>
          </div>
          <div className="col-span-12 md:col-span-7 md:col-start-6">
            <p className="mt-3 max-w-xl text-pretty text-[17px] leading-relaxed text-foreground/75">
              ไม่ใช่หน้าจอที่บอกว่าวันนี้สีมงคลคืออะไร แต่เป็นที่ปรึกษาที่ดูดวงคุณมาแล้ว
              และตอบเฉพาะคำถามที่คุณถาม
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {FEATURES.map((f) => (
            <FeatureCard key={f.no} {...f} />
          ))}
        </div>
      </section>

      {/* ── 4 PILLARS SHOWCASE ────────────────────────────────── */}
      <section
        id="chart"
        className="relative z-10 border-y border-foreground/15 bg-foreground/[0.02] px-6 py-24 md:py-32"
      >
        <div className="mx-auto w-full max-w-[1400px] md:px-12">
          <header className="mb-14 grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-5">
              <div
                className="mb-3 text-[10px] text-muted-foreground"
                style={{ letterSpacing: "0.3em" }}
              >
                CHAPTER · II
              </div>
              <h2 className="font-serif text-5xl leading-[0.95] tracking-tight md:text-6xl">
                ดวงของคุณ
                <br />
                <span className="zh text-[0.95em] text-[var(--cinnabar)]">四柱</span>
              </h2>
              <p className="mt-6 max-w-md text-pretty text-foreground/75">
                สี่เสาดวงชะตา — ปี เดือน วัน ชั่วโมง — บอกธาตุประจำตัวคุณ จุดแข็ง จุดอ่อน
                และทิศทางที่ชะตาเปิด
              </p>
            </div>

            <div className="col-span-12 md:col-span-6 md:col-start-7">
              <div className="flex items-baseline gap-6 text-sm text-muted-foreground">
                <span style={{ letterSpacing: "0.15em" }}>SAMPLE READING</span>
                <span className="block h-px flex-1 bg-foreground/20" />
                <span className="font-serif italic">31 Dec 1984 · ♂</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {PILLARS.map((p) => (
              <PillarCell key={p.en} {...p} />
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-baseline justify-between gap-4 border-t border-foreground/10 pt-6 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 text-muted-foreground">
              <ReadingTag label="DM" value="己 · Earth" />
              <ReadingTag label="STRENGTH" value="弱 18/100" />
              <ReadingTag label="STRUCTURE" value="Indirect Wealth" />
              <ReadingTag label="USEFUL GOD" value="Earth · Fire" />
            </div>
            <Link
              href="/signup"
              className={`${buttonVariants({ variant: "ghost", size: "sm" })} text-[var(--cinnabar)]`}
            >
              สร้างดวงของคุณเอง →
            </Link>
          </div>
        </div>
      </section>

      {/* ── PULL QUOTE ────────────────────────────────────────── */}
      <section
        id="wisdom"
        className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-32 md:px-12 md:py-40"
      >
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-2">
            <div
              className="zh text-[var(--cinnabar)]"
              style={{ fontSize: "5rem", lineHeight: 1 }}
            >
              「
            </div>
          </div>
          <div className="col-span-12 md:col-span-8">
            <blockquote className="font-serif text-[28px] italic leading-[1.35] text-foreground md:text-[40px]">
              ดวงไม่ได้บอกว่าอะไรจะเกิด — มันบอกว่าวันไหนที่พลังของคุณตรงกับเรื่องที่ทำ
              และวันไหนที่ควรนิ่งไว้ก่อน
            </blockquote>

            <footer className="mt-10 flex items-center gap-4">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-foreground/10 ring-1 ring-foreground/20">
                <span
                  className="absolute inset-0 flex items-center justify-center font-serif text-lg italic"
                  aria-hidden
                >
                  W
                </span>
              </div>
              <div>
                <div className="font-serif text-[15px]">
                  อาจารย์ Wenshi · <span className="zh text-foreground/70">温師</span>
                </div>
                <div
                  className="text-[10px] text-muted-foreground"
                  style={{ letterSpacing: "0.18em" }}
                >
                  CONSULTING SINSAE · GENERATION III
                </div>
              </div>
            </footer>
          </div>
          <div className="col-span-12 flex justify-end md:col-span-2">
            <div
              className="zh text-[var(--cinnabar)]"
              style={{ fontSize: "5rem", lineHeight: 1 }}
            >
              」
            </div>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ───────────────────────────────────────── */}
      <section
        id="pricing"
        className="relative z-10 border-y border-foreground/15 bg-foreground text-background"
      >
        <div className="mx-auto grid w-full max-w-[1400px] grid-cols-12 gap-8 px-6 py-24 md:px-12 md:py-32">
          <div className="col-span-12 md:col-span-7">
            <h2 className="font-serif text-5xl leading-[0.95] tracking-tight md:text-7xl">
              วันนี้
              <br />
              <span className="italic text-background/70">ของคุณ คือวันไหน?</span>
            </h2>
            <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-background/80">
              สร้างดวงของคุณภายใน 60 วินาที กรอกแค่วันเกิด เวลา และเมือง — ระบบที่เหลือ Decode จัดการให้
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className={`${buttonVariants({ variant: "secondary", size: "lg" })} h-12 px-7 text-[15px]`}
              >
                เริ่มสร้างดวง · ฟรี
                <span className="ml-2 opacity-60">→</span>
              </Link>
              <span
                className="text-xs text-background/60"
                style={{ letterSpacing: "0.1em" }}
              >
                ใช้ได้ไม่จำกัด · ไม่ต้องผูกบัตร
              </span>
            </div>
          </div>

          <aside className="col-span-12 flex flex-col justify-end gap-4 md:col-span-4 md:col-start-9">
            <div
              className="zh text-right text-background/30"
              style={{ fontSize: "clamp(6rem, 12vw, 10rem)", lineHeight: 0.85 }}
            >
              開
            </div>
            <p
              className="text-right text-[10px] text-background/60"
              style={{ letterSpacing: "0.3em" }}
            >
              開門 · OPEN GATE
            </p>
          </aside>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-16 md:px-12">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-4">
            <div className="flex items-baseline gap-2">
              <span
                className="font-serif text-xl"
                style={{ fontVariant: "small-caps", letterSpacing: "0.04em" }}
              >
                Decode
              </span>
              <span className="zh text-sm text-muted-foreground">解碼</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              An almanac for the modern decision-maker. Crafted in Bangkok, written for
              everywhere the East meets the everyday.
            </p>
          </div>

          <FooterCol
            label="ภาษาไทย"
            sub="TH"
            links={[
              ["เริ่มสร้างดวง", "/signup"],
              ["เข้าสู่ระบบ", "/login"],
              ["ดูดวงตัวอย่าง", "/sample"],
              ["บล็อก", "/blog"],
            ]}
          />
          <FooterCol
            label="English"
            sub="EN"
            links={[
              ["Create chart", "/en/signup"],
              ["Log in", "/en/login"],
              ["Sample reading", "/en/sample"],
              ["Journal", "/en/blog"],
            ]}
          />
          <FooterCol
            label="繁體中文"
            sub="ZH"
            links={[
              ["建立八字", "/zh/signup"],
              ["登入", "/zh/login"],
              ["命例", "/zh/sample"],
              ["專欄", "/zh/blog"],
            ]}
          />
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/10 pt-8 text-xs text-muted-foreground">
          <div style={{ letterSpacing: "0.1em" }}>
            © 2026 Decode · Hourkey Co., Ltd.
          </div>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-foreground/70 transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function FeatureCard({
  no,
  zhMark,
  th,
  en,
  zh,
  body,
}: {
  no: string;
  zhMark: string;
  th: string;
  en: string;
  zh: string;
  body: string;
}) {
  return (
    <article className="group relative overflow-hidden border border-foreground/15 bg-card p-7 transition-colors hover:border-foreground/40">
      <div
        aria-hidden
        className="zh pointer-events-none absolute -right-3 -top-2 select-none text-foreground/[0.05] transition-colors group-hover:text-[var(--cinnabar)]/10"
        style={{ fontSize: "8rem", lineHeight: 1, fontWeight: 700 }}
      >
        {zhMark}
      </div>

      <div className="relative">
        <div
          className="font-serif text-sm italic text-muted-foreground"
          style={{ letterSpacing: "0.08em" }}
        >
          no. {no}
        </div>

        <h3 className="mt-8 font-serif text-3xl leading-tight tracking-tight">{th}</h3>
        <div className="mt-1 flex items-baseline gap-2 text-sm">
          <span className="zh text-muted-foreground">{zh}</span>
          <span className="font-serif italic text-muted-foreground">/ {en}</span>
        </div>

        <p className="mt-6 text-pretty text-[15px] leading-relaxed text-foreground/75">
          {body}
        </p>

        <div className="mt-8 flex items-center gap-2 text-sm text-foreground/60 transition-colors group-hover:text-[var(--cinnabar)]">
          <span style={{ letterSpacing: "0.08em" }}>READ</span>
          <span className="block h-px w-8 bg-current" />
          <span>→</span>
        </div>
      </div>
    </article>
  );
}

function PillarCell({
  label,
  en,
  stem,
  branch,
  elem,
  god,
  isDM,
}: {
  label: string;
  en: string;
  stem: string;
  branch: string;
  elem: string;
  god: string;
  isDM?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col bg-background p-5 ring-1 ${
        isDM ? "ring-[var(--cinnabar)]/60" : "ring-foreground/15"
      }`}
    >
      {isDM && (
        <span
          className="zh absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center text-[12px] font-bold text-white"
          style={{
            background: "var(--cinnabar)",
            boxShadow: "inset 0 0 0 1.5px rgba(0,0,0,0.15)",
          }}
          aria-label="Day Master"
        >
          日
        </span>
      )}

      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <span
          className="font-serif text-[10px] italic text-muted-foreground"
          style={{ letterSpacing: "0.1em" }}
        >
          {en}
        </span>
      </div>

      <div className="mt-7 text-center">
        <div
          className="zh leading-none"
          style={{
            fontSize: "clamp(3.5rem, 7vw, 5rem)",
            color: ELEM_VAR[elem] ?? "var(--foreground)",
            fontWeight: 600,
          }}
        >
          {stem}
        </div>
      </div>

      <div className="my-4 mx-auto h-px w-8 bg-foreground/15" />

      <div className="text-center">
        <div
          className="zh leading-none text-foreground/85"
          style={{ fontSize: "clamp(2.25rem, 4.5vw, 3rem)", fontWeight: 500 }}
        >
          {branch}
        </div>
      </div>

      <div className="mt-6 text-center">
        <div
          className="text-[10px] text-muted-foreground"
          style={{ letterSpacing: "0.18em" }}
        >
          {god.toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function ReadingTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-[9px] text-muted-foreground"
        style={{ letterSpacing: "0.2em" }}
      >
        {label}
      </span>
      <span className="zh font-serif text-sm text-foreground">{value}</span>
    </div>
  );
}

function FooterCol({
  label,
  sub,
  links,
}: {
  label: string;
  sub: string;
  links: [string, string][];
}) {
  return (
    <div className="col-span-6 md:col-span-2">
      <div className="flex items-baseline gap-2">
        <h4 className="font-serif text-base">{label}</h4>
        <span
          className="text-[10px] text-muted-foreground"
          style={{ letterSpacing: "0.18em" }}
        >
          {sub}
        </span>
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([title, href]) => (
          <li key={href}>
            <Link
              href={href}
              className="text-foreground/70 transition-colors hover:text-foreground"
            >
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
