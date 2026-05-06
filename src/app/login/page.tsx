import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const s = await getSession();
  if (s?.orgId) redirect("/dashboard");
  return <LoginForm searchParamsPromise={searchParams} />;
}

async function LoginForm({ searchParamsPromise }: { searchParamsPromise: Promise<{ err?: string }> }) {
  const sp = await searchParamsPromise;
  const err = sp.err;

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.05] mix-blend-multiply dark:opacity-[0.07] dark:mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.85 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")",
        }}
      />
      <form action="/api/auth/login-form" method="POST" className="relative z-10 w-full max-w-sm space-y-5 border border-foreground/15 bg-card p-8">
        <div>
          <Link href="/" className="inline-flex items-baseline gap-2">
            <span className="font-serif text-xl" style={{ fontVariant:"small-caps", letterSpacing:"0.04em" }}>Decode</span>
            <span className="zh text-base text-[var(--cinnabar)]">解碼</span>
          </Link>
          <h1 className="mt-4 font-serif text-2xl">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">กรอกอีเมลและรหัสผ่าน</p>
        </div>

        <label className="block">
          <span className="block text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>EMAIL</span>
          <input name="email" type="email" required autoComplete="email" className="mt-1.5 w-full rounded-sm border border-foreground/20 bg-background px-3 py-2.5 text-[14px] focus:border-[var(--cinnabar)] focus:outline-none" />
        </label>
        <label className="block">
          <span className="block text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>PASSWORD</span>
          <input name="password" type="password" required autoComplete="current-password" className="mt-1.5 w-full rounded-sm border border-foreground/20 bg-background px-3 py-2.5 text-[14px] focus:border-[var(--cinnabar)] focus:outline-none" />
        </label>

        {err && (
          <div className="rounded-sm border border-[var(--cinnabar)] bg-[var(--cinnabar)]/10 p-3 text-[13px] text-[var(--cinnabar)]">
            ⚠️ {err}
          </div>
        )}

        <button type="submit" className="w-full rounded-sm bg-[var(--cinnabar)] py-3 text-[14px] font-medium text-white">
          เข้าสู่ระบบ
        </button>
        <div className="text-center text-[12px] text-muted-foreground">
          ยังไม่มีบัญชี? <Link href="/signup" className="text-[var(--cinnabar)] underline">สมัครเลย</Link>
        </div>
      </form>
    </div>
  );
}
