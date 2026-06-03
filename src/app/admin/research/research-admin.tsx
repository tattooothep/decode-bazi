"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  users_total?: number;
  users_recent?: number;
  participants_total?: number;
  profiles_total?: number;
  qna_total?: number;
  qna_recent?: number;
  events_recent?: number;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  tier: string | null;
  hour_balance: number | null;
  research_status: string;
  cohort: string | null;
  notes: string | null;
  labels: string[] | null;
  created_at: string;
  last_active_at: string | null;
  profile_count: number;
  qna_count: number;
  event_count: number;
  last_qna_at: string | null;
  last_event_at: string | null;
};

type QnaRow = {
  id: string;
  feature: string;
  user_id: string | null;
  profile_id: string | null;
  mode: string | null;
  topic: string | null;
  lang: string;
  question: string;
  answer: string | null;
  history: unknown;
  response_meta: unknown;
  model: string | null;
  status: string;
  created_at: string;
  email: string | null;
  user_name: string | null;
  profile_name: string | null;
};

type TrafficRow = {
  page_path: string;
  event_name: string;
  count: number;
  users: number;
  last_at: string;
};

type EventRow = {
  id: string;
  event_name: string;
  page_path: string | null;
  referrer: string | null;
  payload: unknown;
  created_at: string;
  email: string | null;
  user_name: string | null;
  profile_name: string | null;
};

type Payload = {
  ok: boolean;
  days: number;
  summary: Summary;
  users: UserRow[];
  qna: QnaRow[];
  traffic_by_path: TrafficRow[];
  recent_events: EventRow[];
};

const STATUS_LABEL: Record<string, string> = {
  active: "เข้าร่วม",
  watch: "ติดตามพิเศษ",
  paused: "พักไว้",
  done: "จบเคส",
  excluded: "ไม่นับวิจัย",
};

const STATUS_CLASS: Record<string, string> = {
  active: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10",
  watch: "border-amber-500/35 text-amber-300 bg-amber-500/10",
  paused: "border-sky-500/30 text-sky-300 bg-sky-500/10",
  done: "border-foreground/20 text-foreground/60 bg-foreground/5",
  excluded: "border-red-500/30 text-red-300 bg-red-500/10",
};

function dt(v: string | null | undefined): string {
  if (!v) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(v));
  } catch {
    return v;
  }
}

function short(v: string | null | undefined, n = 160): string {
  if (!v) return "-";
  return v.length > n ? v.slice(0, n) + "..." : v;
}

function initials(u: UserRow): string {
  const base = (u.name || u.email || "?").trim();
  return base.slice(0, 2).toUpperCase();
}

function featureLabel(v: string): string {
  const map: Record<string, string> = {
    sifu_master: "ซินแสหลัก",
    network_sifu: "ซินแสเครือข่าย",
    qimen_sifu: "ซินแสฉีเหมิน",
    chart_overview: "อ่านดวงต่อเนื่อง",
  };
  return map[v] || v;
}

export default function ResearchAdmin({ email }: { email: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"members" | "qna" | "traffic">("members");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    const params = new URLSearchParams({ days: String(days), limit: "120" });
    if (query.trim()) params.set("q", query.trim());
    try {
      const r = await fetch(`/api/admin/research?${params}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [days, query]);

  useEffect(() => { load(); }, [load]);

  const summaryCards = useMemo(() => {
    const s = data?.summary || {};
    return [
      ["สมาชิก", s.users_total ?? 0, `${s.users_recent ?? 0} active ${days} วัน`],
      ["อาสาสมัคร", s.participants_total ?? 0, "สถานะไม่ถูกตัดออก"],
      ["ดวงในระบบ", s.profiles_total ?? 0, "profiles ทั้งหมด"],
      ["Q&A", s.qna_total ?? 0, `${s.qna_recent ?? 0} รายการล่าสุด`],
      ["Traffic", s.events_recent ?? 0, `events ใน ${days} วัน`],
    ];
  }, [data, days]);

  async function updateStatus(user: UserRow, status: string) {
    setMsg("");
    const r = await fetch("/api/admin/research", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        status,
        cohort: user.cohort || "research-200",
        notes: user.notes || "",
        labels: user.labels || [],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      setMsg(j.error || "บันทึกสถานะไม่สำเร็จ");
      return;
    }
    setMsg("บันทึกสถานะแล้ว");
    await load();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-7">
        <header className="mb-5 flex flex-col gap-3 border-b border-foreground/15 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs tracking-[.18em] text-foreground/45">ADMIN · RESEARCH</div>
            <h1 className="mt-1 font-serif text-3xl">หลังบ้านวิจัยผู้ใช้งาน</h1>
            <p className="mt-1 text-sm text-foreground/55">สมาชิก อาสาสมัคร คำถามต่อเนื่อง คำตอบซินแส และ traffic ก่อน launch</p>
          </div>
          <div className="text-xs text-foreground/45">{email}</div>
        </header>

        <section className="mb-5 grid gap-3 md:grid-cols-5">
          {summaryCards.map(([label, value, note]) => (
            <div key={label} className="border border-foreground/15 p-4">
              <div className="text-xs tracking-[.14em] text-foreground/45">{label}</div>
              <div className="mt-2 font-serif text-3xl">{value}</div>
              <div className="mt-1 text-xs text-foreground/45">{note}</div>
            </div>
          ))}
        </section>

        <section className="mb-5 flex flex-col gap-3 border border-foreground/15 p-3 md:flex-row md:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            className="min-h-10 flex-1 border border-foreground/15 bg-transparent px-3 text-sm outline-none focus:border-amber-500/60"
            placeholder="ค้นชื่อ อีเมล เบอร์ โปรไฟล์ หรือคำถาม"
          />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="min-h-10 border border-foreground/15 bg-background px-3 text-sm"
          >
            <option value={7}>7 วัน</option>
            <option value={30}>30 วัน</option>
            <option value={90}>90 วัน</option>
            <option value={365}>365 วัน</option>
          </select>
          <button onClick={load} className="min-h-10 border border-foreground/25 px-4 text-sm hover:border-amber-500/60">
            {loading ? "กำลังโหลด" : "รีเฟรช"}
          </button>
        </section>

        {msg && <div className="mb-4 border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{msg}</div>}

        <nav className="mb-4 flex gap-2 border-b border-foreground/15">
          {[
            ["members", "สมาชิก"],
            ["qna", "คำถามและคำตอบ"],
            ["traffic", "Traffic"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              className={`border-b-2 px-3 py-2 text-sm ${tab === id ? "border-amber-500 text-amber-300" : "border-transparent text-foreground/55 hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "members" && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden border border-foreground/15">
              <div className="grid grid-cols-[52px_1.4fr_120px_90px_90px_150px] gap-3 border-b border-foreground/10 px-3 py-2 text-xs text-foreground/45">
                <div></div><div>สมาชิก</div><div>สถานะ</div><div>ดวง</div><div>Q&A</div><div>ล่าสุด</div>
              </div>
              <div className="max-h-[62vh] overflow-auto">
                {(data?.users || []).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelected(u)}
                    className="grid w-full grid-cols-[52px_1.4fr_120px_90px_90px_150px] gap-3 border-b border-foreground/10 px-3 py-3 text-left text-sm hover:bg-foreground/[.03]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 bg-foreground/5 text-xs">{initials(u)}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.name || "(no name)"}</div>
                      <div className="truncate text-xs text-foreground/45">{u.email || u.phone || "-"}</div>
                    </div>
                    <div><span className={`inline-flex border px-2 py-1 text-xs ${STATUS_CLASS[u.research_status] || STATUS_CLASS.active}`}>{STATUS_LABEL[u.research_status] || u.research_status}</span></div>
                    <div className="text-foreground/70">{u.profile_count}</div>
                    <div className="text-foreground/70">{u.qna_count}</div>
                    <div className="text-xs text-foreground/45">{dt(u.last_event_at || u.last_qna_at || u.last_active_at)}</div>
                  </button>
                ))}
                {!data?.users?.length && <div className="p-8 text-center text-sm text-foreground/45">ยังไม่มีข้อมูลสมาชิกในเงื่อนไขนี้</div>}
              </div>
            </div>

            <aside className="border border-foreground/15 p-4">
              {selected ? (
                <div>
                  <div className="text-xs tracking-[.16em] text-foreground/45">MEMBER DETAIL</div>
                  <h2 className="mt-2 font-serif text-2xl">{selected.name || selected.email}</h2>
                  <div className="mt-1 break-all text-xs text-foreground/45">{selected.email}</div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="border border-foreground/10 p-2"><div className="text-xs text-foreground/45">ดวง</div>{selected.profile_count}</div>
                    <div className="border border-foreground/10 p-2"><div className="text-xs text-foreground/45">Q&A</div>{selected.qna_count}</div>
                    <div className="border border-foreground/10 p-2"><div className="text-xs text-foreground/45">Traffic</div>{selected.event_count}</div>
                    <div className="border border-foreground/10 p-2"><div className="text-xs text-foreground/45">Hour</div>{selected.hour_balance ?? "-"}</div>
                  </div>
                  <label className="mt-4 block text-xs text-foreground/45">สถานะวิจัย</label>
                  <select
                    value={selected.research_status}
                    onChange={(e) => updateStatus(selected, e.target.value)}
                    className="mt-1 w-full border border-foreground/15 bg-background px-3 py-2 text-sm"
                  >
                    {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  <div className="mt-4 text-xs leading-6 text-foreground/55">
                    <div>สมัคร: {dt(selected.created_at)}</div>
                    <div>active ล่าสุด: {dt(selected.last_active_at)}</div>
                    <div>event ล่าสุด: {dt(selected.last_event_at)}</div>
                    <div>Q&A ล่าสุด: {dt(selected.last_qna_at)}</div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-foreground/45">เลือกสมาชิกเพื่อดูรายละเอียด</div>
              )}
            </aside>
          </section>
        )}

        {tab === "qna" && (
          <section className="space-y-3">
            {(data?.qna || []).map((x) => (
              <article key={`${x.feature}-${x.id}`} className="border border-foreground/15 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-foreground/45">
                  <span className="border border-foreground/15 px-2 py-1 text-foreground/70">{featureLabel(x.feature)}</span>
                  {x.mode && <span>mode: {x.mode}</span>}
                  {x.topic && <span>topic: {x.topic}</span>}
                  <span>{dt(x.created_at)}</span>
                  <span>{x.user_name || x.email || "unknown user"}</span>
                  {x.profile_name && <span>profile: {x.profile_name}</span>}
                </div>
                <div className="text-sm font-medium">ถาม: {short(x.question, 500)}</div>
                <div className="mt-3 whitespace-pre-wrap border-l border-amber-500/30 pl-3 text-sm leading-6 text-foreground/72">
                  {short(x.answer, 1_800)}
                </div>
                {Array.isArray(x.history) && x.history.length > 0 && (
                  <details className="mt-3 text-xs text-foreground/50">
                    <summary className="cursor-pointer">ประวัติคำถามก่อนหน้า {x.history.length} รายการ</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border border-foreground/10 p-2">{JSON.stringify(x.history, null, 2)}</pre>
                  </details>
                )}
              </article>
            ))}
            {!data?.qna?.length && <div className="border border-foreground/15 p-8 text-center text-sm text-foreground/45">ยังไม่มี Q&A</div>}
          </section>
        )}

        {tab === "traffic" && (
          <section className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="border border-foreground/15">
              <div className="border-b border-foreground/10 px-3 py-2 text-sm font-medium">สรุปตามหน้า</div>
              <div className="max-h-[65vh] overflow-auto">
                {(data?.traffic_by_path || []).map((r) => (
                  <div key={`${r.page_path}-${r.event_name}`} className="border-b border-foreground/10 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate">{r.page_path}</div>
                      <div className="font-mono text-amber-300">{r.count}</div>
                    </div>
                    <div className="mt-1 text-xs text-foreground/45">{r.event_name} · {r.users} users · {dt(r.last_at)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-foreground/15">
              <div className="border-b border-foreground/10 px-3 py-2 text-sm font-medium">Events ล่าสุด</div>
              <div className="max-h-[65vh] overflow-auto">
                {(data?.recent_events || []).map((e) => (
                  <div key={e.id} className="border-b border-foreground/10 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="border border-foreground/15 px-2 py-1 text-xs">{e.event_name}</span>
                      <span>{e.page_path || "-"}</span>
                    </div>
                    <div className="mt-1 text-xs text-foreground/45">{dt(e.created_at)} · {e.user_name || e.email || "unknown"}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
