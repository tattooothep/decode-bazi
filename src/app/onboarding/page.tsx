import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const s = await getSession();
  if (!s?.orgId) redirect("/login");
  return <OnboardingForm searchParamsPromise={searchParams} />;
}

async function OnboardingForm({ searchParamsPromise }: { searchParamsPromise: Promise<{ err?: string }> }) {
  const sp = await searchParamsPromise;
  const err = sp.err;

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-10">
      <form action="/api/profile-form" method="POST" className="w-full max-w-md space-y-5 border border-foreground/15 bg-card p-8">
        <div>
          <div className="text-[10px] text-muted-foreground" style={{letterSpacing:"0.32em"}}>STEP 1 OF 1</div>
          <h1 className="mt-2 font-serif text-2xl">วันเกิดของคุณ</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">ใช้คำนวณดวง 4 เสา · บันทึกครั้งเดียว · กลับมาดูได้เสมอ</p>
        </div>

        <label className="block">
          <span className="block text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>NAME</span>
          <input name="name" type="text" required placeholder="พิมพ์ใจ" className="mt-1.5 w-full rounded-sm border border-foreground/20 bg-background px-3 py-2.5 text-[14px] focus:border-[var(--cinnabar)] focus:outline-none" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>BIRTH DATE</span>
            <input name="birthDate" type="date" required className="mt-1.5 w-full rounded-sm border border-foreground/20 bg-background px-3 py-2.5 text-[14px] focus:border-[var(--cinnabar)] focus:outline-none" />
          </label>
          <label className="block">
            <span className="block text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>BIRTH TIME</span>
            <input name="birthTime" type="time" required defaultValue="12:00" className="mt-1.5 w-full rounded-sm border border-foreground/20 bg-background px-3 py-2.5 text-[14px] focus:border-[var(--cinnabar)] focus:outline-none" />
          </label>
        </div>

        <label className="block">
          <span className="block text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>LOCATION</span>
          <input name="locationName" type="text" defaultValue="Bangkok, Thailand" className="mt-1.5 w-full rounded-sm border border-foreground/20 bg-background px-3 py-2.5 text-[14px] focus:border-[var(--cinnabar)] focus:outline-none" />
        </label>

        <fieldset>
          <legend className="block text-[10px] text-muted-foreground" style={{letterSpacing:"0.2em"}}>GENDER</legend>
          <div className="mt-1.5 flex gap-3">
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-sm border border-foreground/20 px-3 py-3 text-[13px] has-[:checked]:border-[var(--cinnabar)] has-[:checked]:bg-[var(--cinnabar)] has-[:checked]:text-white">
              <input type="radio" name="gender" value="M" defaultChecked className="sr-only" />
              ชาย
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-sm border border-foreground/20 px-3 py-3 text-[13px] has-[:checked]:border-[var(--cinnabar)] has-[:checked]:bg-[var(--cinnabar)] has-[:checked]:text-white">
              <input type="radio" name="gender" value="F" className="sr-only" />
              หญิง
            </label>
          </div>
        </fieldset>

        {err && (
          <div className="rounded-sm border border-[var(--cinnabar)] bg-[var(--cinnabar)]/10 p-3 text-[13px] text-[var(--cinnabar)]">
            ⚠️ {err}
          </div>
        )}

        <button type="submit" className="w-full rounded-sm bg-[var(--cinnabar)] py-3 text-[14px] font-medium text-white">
          คำนวณดวง · บันทึก
        </button>
      </form>
    </div>
  );
}
