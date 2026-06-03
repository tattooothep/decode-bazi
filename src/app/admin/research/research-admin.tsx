"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";

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

type ProfileRow = {
  id: string;
  created_by_user_id: string | null;
  name: string;
  nickname: string | null;
  gender: string | null;
  relationship_type: string | null;
  network_group: string | null;
  network_group_label: string | null;
  day_master: string | null;
  day_master_strength: string | null;
  birth_datetime: string;
  birth_location_name: string | null;
  is_archived: boolean;
  created_at: string;
  email: string | null;
  user_name: string | null;
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
  user_id: string | null;
  profile_id: string | null;
  event_name: string;
  page_path: string | null;
  referrer: string | null;
  session_key: string | null;
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
  profiles: ProfileRow[];
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

function displayName(u: UserRow): string {
  return u.name || u.email || u.phone || "ไม่ระบุชื่อ";
}

function contactLine(u: UserRow): string {
  return [u.email, u.phone].filter(Boolean).join(" · ") || "-";
}

function initials(u: UserRow): string {
  const base = displayName(u).trim();
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

function payloadText(v: unknown): string {
  if (!v) return "-";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function profileMeta(p: ProfileRow): string {
  return [
    p.relationship_type || "ไม่ระบุความสัมพันธ์",
    p.network_group_label || p.network_group,
    p.gender,
  ].filter(Boolean).join(" · ");
}

function stemLabel(stem: string | null | undefined): string {
  const map: Record<string, string> = {
    甲: "ไม้หยาง 甲",
    乙: "ไม้หยิน 乙",
    丙: "ไฟหยาง 丙",
    丁: "ไฟหยิน 丁",
    戊: "ดินหยาง 戊",
    己: "ดินหยิน 己",
    庚: "ทองหยาง 庚",
    辛: "ทองหยิน 辛",
    壬: "น้ำหยาง 壬",
    癸: "น้ำหยิน 癸",
  };
  return stem ? (map[stem] || stem) : "-";
}

export default function ResearchAdmin({ email }: { email: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState("");
  const [detailTab, setDetailTab] = useState<"overview" | "qna" | "traffic">("overview");
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

  useEffect(() => {
    if (!data?.users?.length) {
      setSelected(null);
      return;
    }
    setSelected((current) => data.users.find((u) => u.id === current?.id) || data.users[0]);
  }, [data]);

  const summaryCards = useMemo(() => {
    const s = data?.summary || {};
    return [
      { label: "สมาชิก", value: s.users_total ?? 0, note: `${s.users_recent ?? 0} active ${days} วัน`, icon: UsersIcon },
      { label: "อาสาสมัคร", value: s.participants_total ?? 0, note: "สถานะไม่ถูกตัดออก", icon: UserIcon },
      { label: "ดวงในระบบ", value: s.profiles_total ?? 0, note: "profiles active", icon: DatabaseIcon },
      { label: "Q&A", value: s.qna_total ?? 0, note: `${s.qna_recent ?? 0} รายการล่าสุด`, icon: MessageSquareIcon },
      { label: "Traffic", value: s.events_recent ?? 0, note: `events ใน ${days} วัน`, icon: ActivityIcon },
    ];
  }, [data, days]);

  const selectedProfiles = useMemo(
    () => selected ? (data?.profiles || []).filter((p) => p.created_by_user_id === selected.id) : [],
    [data, selected]
  );

  const selectedQna = useMemo(
    () => selected ? (data?.qna || []).filter((x) => x.user_id === selected.id) : [],
    [data, selected]
  );

  const selectedEvents = useMemo(
    () => selected ? (data?.recent_events || []).filter((e) => e.user_id === selected.id) : [],
    [data, selected]
  );

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
      <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6 md:py-7">
        <header className="mb-5 flex flex-col gap-4 border-b border-foreground/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs tracking-[.18em] text-foreground/45">ADMIN · RESEARCH COMMAND</div>
            <h1 className="mt-1 font-serif text-3xl">หลังบ้านวิจัยผู้ใช้งาน</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/58">
              แยกดูสมาชิก อาสาสมัคร ดวงในระบบ คำถามต่อเนื่อง คำตอบซินแส และ traffic ก่อน launch แบบรายคน
            </p>
          </div>
          <div className="rounded-md border border-foreground/10 bg-card/45 px-3 py-2 text-xs text-foreground/55">
            <div className="text-foreground/40">admin</div>
            <div className="mt-0.5">{email}</div>
          </div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-md border border-foreground/10 bg-card/45 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs tracking-[.14em] text-foreground/45">{card.label}</div>
                  <Icon className="h-4 w-4 text-[var(--cinnabar)]/80" aria-hidden="true" />
                </div>
                <div className="mt-2 font-serif text-3xl">{card.value}</div>
                <div className="mt-1 text-xs text-foreground/45">{card.note}</div>
              </div>
            );
          })}
        </section>

        <section className="mb-5 rounded-md border border-foreground/10 bg-card/35 p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative min-h-10 flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/35" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") load(); }}
                className="min-h-10 w-full rounded-sm border border-foreground/15 bg-background/70 pl-9 pr-3 text-sm outline-none focus:border-[var(--cinnabar)]/70"
                placeholder="ค้นชื่อ อีเมล เบอร์ โปรไฟล์ หรือคำถาม เช่น 4656"
              />
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="min-h-10 rounded-sm border border-foreground/15 bg-background px-3 text-sm"
            >
              <option value={7}>7 วัน</option>
              <option value={30}>30 วัน</option>
              <option value={90}>90 วัน</option>
              <option value={365}>365 วัน</option>
            </select>
            <button
              onClick={load}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-foreground/20 px-4 text-sm hover:border-[var(--cinnabar)]/70 hover:bg-foreground/[.03]"
            >
              <RefreshCwIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              {loading ? "กำลังโหลด" : "รีเฟรช"}
            </button>
          </div>
        </section>

        {msg && <div className="mb-4 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{msg}</div>}

        <section className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-md border border-foreground/10 bg-card/35">
            <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-3">
              <div>
                <div className="text-sm font-medium">สมาชิกวิจัย</div>
                <div className="mt-0.5 text-xs text-foreground/45">{data?.users?.length || 0} คนในเงื่อนไขนี้</div>
              </div>
              <UsersIcon className="h-4 w-4 text-foreground/45" aria-hidden="true" />
            </div>
            <div className="max-h-[72vh] overflow-auto">
              {(data?.users || []).map((u) => {
                const active = selected?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelected(u)}
                    className={`w-full border-b border-foreground/8 px-4 py-3 text-left transition-colors hover:bg-foreground/[.035] ${active ? "bg-[var(--cinnabar)]/8 shadow-[inset_3px_0_0_var(--cinnabar)]" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-foreground/15 bg-background/70 text-xs font-medium">
                        {initials(u)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{displayName(u)}</div>
                          <span className={`shrink-0 rounded-sm border px-2 py-0.5 text-[11px] ${STATUS_CLASS[u.research_status] || STATUS_CLASS.active}`}>
                            {STATUS_LABEL[u.research_status] || u.research_status}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-foreground/45">{contactLine(u)}</div>
                        <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-foreground/55">
                          <span>ดวง {u.profile_count}</span>
                          <span>Q&A {u.qna_count}</span>
                          <span>Events {u.event_count}</span>
                          <span className="truncate">{dt(u.last_event_at || u.last_qna_at || u.last_active_at)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!data?.users?.length && <div className="p-10 text-center text-sm text-foreground/45">ยังไม่มีข้อมูลสมาชิกในเงื่อนไขนี้</div>}
            </div>
          </aside>

          <section className="min-w-0 rounded-md border border-foreground/10 bg-card/35">
            {selected ? (
              <div>
                <div className="border-b border-foreground/10 p-4 md:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[var(--cinnabar)]/35 bg-[var(--cinnabar)]/10 font-serif text-xl">
                        {initials(selected)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs tracking-[.16em] text-foreground/45">USER DOSSIER</div>
                        <h2 className="mt-1 truncate font-serif text-3xl">{displayName(selected)}</h2>
                        <div className="mt-1 break-all text-xs text-foreground/50">{contactLine(selected)}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-sm border px-2 py-1 text-xs ${STATUS_CLASS[selected.research_status] || STATUS_CLASS.active}`}>
                            {STATUS_LABEL[selected.research_status] || selected.research_status}
                          </span>
                          {selected.cohort && <span className="rounded-sm border border-foreground/10 px-2 py-1 text-xs text-foreground/55">{selected.cohort}</span>}
                          {selected.tier && <span className="rounded-sm border border-foreground/10 px-2 py-1 text-xs text-foreground/55">{selected.tier}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="w-full lg:w-56">
                      <label className="block text-xs text-foreground/45">สถานะวิจัย</label>
                      <select
                        value={selected.research_status}
                        onChange={(e) => updateStatus(selected, e.target.value)}
                        className="mt-1 w-full rounded-sm border border-foreground/15 bg-background px-3 py-2 text-sm"
                      >
                        {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: "ดวง", value: selected.profile_count, icon: DatabaseIcon },
                      { label: "Q&A", value: selected.qna_count, icon: MessageSquareIcon },
                      { label: "Traffic", value: selected.event_count, icon: ActivityIcon },
                      { label: "Hour", value: selected.hour_balance ?? "-", icon: BarChart3Icon },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="rounded-md border border-foreground/10 bg-background/45 p-3">
                          <div className="flex items-center justify-between text-xs text-foreground/45">
                            <span>{item.label}</span>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="mt-2 font-serif text-2xl">{item.value}</div>
                        </div>
                      );
                    })}
                  </div>

                  <nav className="mt-5 flex flex-wrap gap-2">
                    {[
                      { id: "overview" as const, label: "ภาพรวม", icon: FileTextIcon },
                      { id: "qna" as const, label: "Q&A ต่อเนื่อง", icon: MessageSquareIcon },
                      { id: "traffic" as const, label: "Traffic รายคน", icon: ActivityIcon },
                    ].map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setDetailTab(id)}
                        className={`inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm ${detailTab === id ? "border-[var(--cinnabar)]/65 bg-[var(--cinnabar)]/10 text-foreground" : "border-foreground/12 text-foreground/55 hover:border-foreground/25 hover:text-foreground"}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="p-4 md:p-5">
                  {detailTab === "overview" && (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_320px]">
                      <section className="space-y-4">
                        <div>
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                            <DatabaseIcon className="h-4 w-4 text-[var(--cinnabar)]/80" aria-hidden="true" />
                            ดวงในระบบของคนนี้
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {selectedProfiles.map((p) => (
                              <div key={p.id} className="rounded-md border border-foreground/10 bg-background/45 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{p.name}</div>
                                    <div className="mt-1 truncate text-xs text-foreground/45">{profileMeta(p)}</div>
                                  </div>
                                  <span className="rounded-sm border border-foreground/12 px-2 py-1 text-xs text-foreground/65">{stemLabel(p.day_master)}</span>
                                </div>
                                <div className="mt-3 grid gap-1 text-xs leading-5 text-foreground/55">
                                  <div>เกิด: {dt(p.birth_datetime)}</div>
                                  <div>สถานที่: {p.birth_location_name || "-"}</div>
                                  <div>กำลังวัน: {p.day_master_strength || "-"}</div>
                                </div>
                              </div>
                            ))}
                            {!selectedProfiles.length && (
                              <div className="rounded-md border border-dashed border-foreground/15 p-6 text-center text-sm text-foreground/45 md:col-span-2">
                                ยังไม่พบดวง active ของคนนี้ในข้อมูลที่โหลด
                              </div>
                            )}
                          </div>
                        </div>
                      </section>

                      <aside className="rounded-md border border-foreground/10 bg-background/45 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <ClockIcon className="h-4 w-4 text-[var(--cinnabar)]/80" aria-hidden="true" />
                          Timeline
                        </div>
                        <div className="space-y-3 text-sm">
                          {[
                            ["สมัคร", selected.created_at],
                            ["active ล่าสุด", selected.last_active_at],
                            ["event ล่าสุด", selected.last_event_at],
                            ["Q&A ล่าสุด", selected.last_qna_at],
                          ].map(([label, value]) => (
                            <div key={label || ""} className="flex items-start justify-between gap-3 border-b border-foreground/8 pb-2 last:border-0">
                              <span className="text-foreground/45">{label}</span>
                              <span className="text-right text-foreground/72">{dt(value)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-foreground/10 pt-4">
                          <div className="text-xs text-foreground/45">Notes</div>
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/65">{selected.notes || "-"}</div>
                        </div>
                      </aside>
                    </div>
                  )}

                  {detailTab === "qna" && (
                    <section className="space-y-3">
                      {selectedQna.map((x) => (
                        <article key={`${x.feature}-${x.id}`} className="rounded-md border border-foreground/10 bg-background/45 p-4">
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-foreground/45">
                            <span className="rounded-sm border border-foreground/15 px-2 py-1 text-foreground/70">{featureLabel(x.feature)}</span>
                            {x.profile_name && <span>ดวง: {x.profile_name}</span>}
                            {x.mode && <span>mode: {x.mode}</span>}
                            {x.topic && <span>topic: {x.topic}</span>}
                            <span>{dt(x.created_at)}</span>
                          </div>
                          <div className="text-sm font-medium leading-6">ถาม: {short(x.question, 700)}</div>
                          <div className="mt-3 whitespace-pre-wrap border-l border-[var(--cinnabar)]/40 pl-3 text-sm leading-6 text-foreground/72">
                            {short(x.answer, 2_400)}
                          </div>
                          {Array.isArray(x.history) && x.history.length > 0 && (
                            <details className="mt-3 text-xs text-foreground/50">
                              <summary className="cursor-pointer">ประวัติคำถามก่อนหน้า {x.history.length} รายการ</summary>
                              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-sm border border-foreground/10 p-2">{JSON.stringify(x.history, null, 2)}</pre>
                            </details>
                          )}
                        </article>
                      ))}
                      {!selectedQna.length && (
                        <div className="rounded-md border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/45">
                          ยังไม่มี Q&A ของคนนี้ในชุดข้อมูลที่โหลด
                        </div>
                      )}
                    </section>
                  )}

                  {detailTab === "traffic" && (
                    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="space-y-3">
                        {selectedEvents.map((e) => (
                          <article key={e.id} className="rounded-md border border-foreground/10 bg-background/45 p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-sm border border-foreground/15 px-2 py-1 text-xs">{e.event_name}</span>
                              <span className="truncate">{e.page_path || "-"}</span>
                              {e.profile_name && <span className="text-xs text-foreground/45">ดวง: {e.profile_name}</span>}
                            </div>
                            <div className="mt-2 text-xs text-foreground/45">{dt(e.created_at)} · session {e.session_key || "-"}</div>
                            <details className="mt-2 text-xs text-foreground/50">
                              <summary className="cursor-pointer">payload</summary>
                              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-sm border border-foreground/10 p-2">{payloadText(e.payload)}</pre>
                            </details>
                          </article>
                        ))}
                        {!selectedEvents.length && (
                          <div className="rounded-md border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/45">
                            ยังไม่มี event ของคนนี้ในช่วง {days} วัน
                          </div>
                        )}
                      </div>
                      <aside className="rounded-md border border-foreground/10 bg-background/45">
                        <div className="border-b border-foreground/10 px-3 py-2 text-sm font-medium">Traffic รวมตามหน้า</div>
                        <div className="max-h-[58vh] overflow-auto">
                          {(data?.traffic_by_path || []).map((r) => (
                            <div key={`${r.page_path}-${r.event_name}`} className="border-b border-foreground/8 px-3 py-3 text-sm last:border-0">
                              <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{r.page_path}</div>
                                <div className="font-mono text-[var(--cinnabar)]">{r.count}</div>
                              </div>
                              <div className="mt-1 text-xs text-foreground/45">{r.event_name} · {r.users} users · {dt(r.last_at)}</div>
                            </div>
                          ))}
                        </div>
                      </aside>
                    </section>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[480px] items-center justify-center text-sm text-foreground/45">
                เลือกสมาชิกจากรายการซ้ายเพื่อดูรายละเอียดรายคน
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
