import Link from "next/link";
import { getSession } from "@/lib/auth";

type Props = {
  titleTh: string;
  titleZh: string;
  titleEn: string;
  description: string;
};

export async function ComingSoon({ titleTh, titleZh, titleEn, description }: Props) {
  const s = await getSession();
  const backHref = s ? "/dashboard" : "/";
  const backLabel = s ? "← กลับ Dashboard" : "← กลับหน้าแรก";

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.85 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="relative z-10 w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-baseline gap-2">
          <span className="font-serif text-2xl" style={{ fontVariant: "small-caps", letterSpacing: "0.04em" }}>Decode</span>
          <span className="zh text-base text-[var(--cinnabar)]">解碼</span>
        </Link>

        <div className="mt-12 inline-block rounded-sm border border-[var(--cinnabar)]/30 bg-[var(--cinnabar)]/5 px-4 py-1.5 text-[10px] text-[var(--cinnabar)]" style={{ letterSpacing: "0.32em" }}>
          COMING SOON · 即將開放
        </div>

        <h1 className="mt-6 font-serif text-4xl tracking-tight">{titleTh}</h1>
        <div className="mt-2 zh text-2xl text-foreground/70">{titleZh}</div>
        <div className="mt-1 font-serif italic text-[13px] text-muted-foreground">{titleEn}</div>

        <p className="mx-auto mt-8 max-w-sm text-pretty text-[14.5px] leading-relaxed text-foreground/75">
          {description}
        </p>

        <div className="mt-12">
          <Link href={backHref} className="text-[13px] text-[var(--cinnabar)] hover:underline">
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
