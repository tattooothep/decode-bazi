"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BarChart3Icon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  EyeOffIcon,
  FileTextIcon,
  FilterIcon,
  MailIcon,
  MessageSquareIcon,
  MoonIcon,
  NotebookPenIcon,
  PaletteIcon,
  PhoneIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldIcon,
  SunIcon,
  UserCheckIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";

type Summary = {
  users_total?: number;
  users_recent?: number;
  participants_total?: number;
  consent_pending_total?: number;
  consent_granted_total?: number;
  test_users_total?: number;
  real_users_total?: number;
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
  account_kind?: "real" | "phone_user" | "test" | string;
  research_status: string;
  cohort: string | null;
  consent_at: string | null;
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
  request_payload: unknown;
  response_meta: unknown;
  profile_snapshot: unknown;
  pillars_snapshot: unknown;
  packet_hash: string | null;
  packet_snapshot_safe: unknown;
  context_hash: string | null;
  prompt_hash: string | null;
  prompt_version: string | null;
  knowledge_hashes: unknown;
  fact_lock: string | null;
  pillar_lock: string | null;
  thread_id: string | null;
  thread_profile_id: string | null;
  history_profile_ids: unknown;
  identity_check_result: string | null;
  prediction_phase: string | null;
  prediction_rows: unknown;
  history_dropped_count: number | null;
  profile_binding_status: string | null;
  audit_quality: string | null;
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

type ThemeName = "ink" | "paper" | "field" | "night";
type UserFilter = "real" | "pending" | "consented" | "attention" | "test" | "all";
type DetailTab = "overview" | "qna" | "traffic" | "consent";

const CONSENT_SCRIPT =
  "ขออนุญาตใช้ข้อมูลที่คุณกรอกใน HourKey เช่น วันเวลาเกิด โปรไฟล์ คำถาม-คำตอบซินแส และพฤติกรรมการใช้งานในระบบ เพื่อวิจัยและปรับปรุงระบบก่อนเปิดจริง ข้อมูลจะใช้ภายในทีม ไม่เอาไปเปิดเผยชื่อรายบุคคล และถ้าไม่สะดวกหรืออยากถอนออกภายหลัง บอกได้ครับ";

const THEMES: Record<ThemeName, { label: string; icon: typeof MoonIcon; vars: CSSProperties }> = {
  ink: {
    label: "หมึก",
    icon: MoonIcon,
    vars: {
      "--research-bg": "oklch(0.135 0.014 250)",
      "--research-panel": "oklch(0.18 0.015 250)",
      "--research-soft": "oklch(0.225 0.014 250)",
      "--research-text": "oklch(0.94 0.012 85)",
      "--research-muted": "oklch(0.68 0.014 85)",
      "--research-line": "oklch(1 0 0 / 0.11)",
      "--research-accent": "oklch(0.62 0.18 28)",
      "--research-ok": "oklch(0.70 0.12 158)",
      "--research-warn": "oklch(0.78 0.14 76)",
      "--research-bad": "oklch(0.66 0.18 28)",
    } as CSSProperties,
  },
  paper: {
    label: "กระดาษ",
    icon: SunIcon,
    vars: {
      "--research-bg": "oklch(0.965 0.014 83)",
      "--research-panel": "oklch(0.99 0.008 85)",
      "--research-soft": "oklch(0.935 0.012 80)",
      "--research-text": "oklch(0.20 0.016 250)",
      "--research-muted": "oklch(0.48 0.014 250)",
      "--research-line": "oklch(0.78 0.018 78)",
      "--research-accent": "oklch(0.50 0.17 27)",
      "--research-ok": "oklch(0.50 0.12 155)",
      "--research-warn": "oklch(0.57 0.13 75)",
      "--research-bad": "oklch(0.54 0.17 28)",
    } as CSSProperties,
  },
  field: {
    label: "ภาคสนาม",
    icon: ShieldIcon,
    vars: {
      "--research-bg": "oklch(0.205 0.025 178)",
      "--research-panel": "oklch(0.255 0.024 178)",
      "--research-soft": "oklch(0.315 0.023 178)",
      "--research-text": "oklch(0.94 0.012 92)",
      "--research-muted": "oklch(0.73 0.018 116)",
      "--research-line": "oklch(1 0 0 / 0.14)",
      "--research-accent": "oklch(0.73 0.13 76)",
      "--research-ok": "oklch(0.74 0.12 152)",
      "--research-warn": "oklch(0.78 0.13 72)",
      "--research-bad": "oklch(0.66 0.16 28)",
    } as CSSProperties,
  },
  night: {
    label: "กลางคืน",
    icon: PaletteIcon,
    vars: {
      "--research-bg": "oklch(0.12 0.018 275)",
      "--research-panel": "oklch(0.17 0.021 275)",
      "--research-soft": "oklch(0.225 0.024 275)",
      "--research-text": "oklch(0.94 0.01 88)",
      "--research-muted": "oklch(0.70 0.014 255)",
      "--research-line": "oklch(1 0 0 / 0.12)",
      "--research-accent": "oklch(0.68 0.14 312)",
      "--research-ok": "oklch(0.72 0.11 168)",
      "--research-warn": "oklch(0.80 0.13 80)",
      "--research-bad": "oklch(0.68 0.17 28)",
    } as CSSProperties,
  },
};

const STATUS_META: Record<string, { label: string; short: string; tone: "ok" | "warn" | "bad" | "muted" | "info"; help: string }> = {
  pending: {
    label: "ยังไม่ได้ถาม",
    short: "รอถาม",
    tone: "warn",
    help: "ยังไม่ควรใช้เป็นข้อมูลวิจัยจนกว่าจะขออนุญาต",
  },
  verbal_consent: {
    label: "อนุญาตปากเปล่า",
    short: "อนุญาตแล้ว",
    tone: "ok",
    help: "บันทึกว่าได้รับอนุญาตปากเปล่าแล้ว",
  },
  declined: {
    label: "ไม่อนุญาต",
    short: "ไม่อนุญาต",
    tone: "bad",
    help: "ห้ามใช้ข้อมูลรายนี้ใน research",
  },
  withdrawn: {
    label: "ถอนความยินยอม",
    short: "ถอนแล้ว",
    tone: "bad",
    help: "เคยอนุญาตแล้ว แต่ขอถอนออก",
  },
  watch: {
    label: "ติดตามพิเศษ",
    short: "ติดตาม",
    tone: "info",
    help: "ใช้ติดตามเคสสำคัญหลังได้รับอนุญาต",
  },
  done: {
    label: "จบเคส",
    short: "จบเคส",
    tone: "muted",
    help: "เก็บไว้เป็นเคสที่ดูครบแล้ว",
  },
  test: {
    label: "บัญชีทดสอบ",
    short: "test",
    tone: "muted",
    help: "ข้อมูลทดสอบ ไม่ใช่ผู้ใช้จริง",
  },
  excluded: {
    label: "ตัดออก",
    short: "ตัดออก",
    tone: "muted",
    help: "ไม่แสดงเป็นกลุ่มวิจัย",
  },
  active: {
    label: "อนุญาตแล้ว",
    short: "อนุญาต",
    tone: "ok",
    help: "ค่าเดิมของระบบ",
  },
  paused: {
    label: "พักไว้",
    short: "พักไว้",
    tone: "info",
    help: "พักการติดตามชั่วคราว",
  },
};

const STATUS_OPTIONS = [
  "pending",
  "verbal_consent",
  "declined",
  "withdrawn",
  "watch",
  "done",
  "test",
  "excluded",
];

function toneClass(tone: "ok" | "warn" | "bad" | "muted" | "info"): string {
  if (tone === "ok") return "border-[color:var(--research-ok)]/35 bg-[color:var(--research-ok)]/12 text-[color:var(--research-ok)]";
  if (tone === "warn") return "border-[color:var(--research-warn)]/40 bg-[color:var(--research-warn)]/12 text-[color:var(--research-warn)]";
  if (tone === "bad") return "border-[color:var(--research-bad)]/38 bg-[color:var(--research-bad)]/12 text-[color:var(--research-bad)]";
  if (tone === "info") return "border-[color:var(--research-accent)]/35 bg-[color:var(--research-accent)]/10 text-[color:var(--research-accent)]";
  return "border-[color:var(--research-line)] bg-[color:var(--research-soft)] text-[color:var(--research-muted)]";
}

function statusMeta(status: string) {
  return STATUS_META[status] || STATUS_META.pending;
}

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

function isTestAccount(u: UserRow): boolean {
  return u.account_kind === "test" || u.research_status === "test";
}

function isRealAccount(u: UserRow): boolean {
  return !isTestAccount(u);
}

function featureLabel(v: string): string {
  const map: Record<string, string> = {
    sifu_master: "ซินแสหลัก",
    sifu_group: "ซินแสกลุ่ม",
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

function auditBadgeClass(ok: boolean): string {
  return ok
    ? "rounded-sm border border-[color:var(--research-ok)]/45 bg-[color:var(--research-ok)]/10 px-2 py-1 text-[color:var(--research-ok)]"
    : "rounded-sm border border-[color:var(--research-warn)]/45 bg-[color:var(--research-warn)]/10 px-2 py-1 text-[color:var(--research-warn)]";
}

function profileMeta(p: ProfileRow): string {
  return [
    p.relationship_type || "เจ้าของ/คนในเครือข่าย",
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

function accountKindLabel(u: UserRow): string {
  if (u.account_kind === "test") return "บัญชีทดสอบ";
  if (u.account_kind === "phone_user") return "สมัครด้วยเบอร์";
  return "ผู้ใช้จริง";
}

function parseLabels(labels: string[] | null | undefined): string[] {
  return Array.isArray(labels) ? labels.filter(Boolean).slice(0, 12) : [];
}

export default function ResearchAdmin({ email }: { email: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("real");
  const [theme, setTheme] = useState<ThemeName>("ink");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftCohort, setDraftCohort] = useState("friends-200-20260604");
  const detailRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hourkey-research-theme") as ThemeName | null;
      if (saved && THEMES[saved]) setTheme(saved);
    } catch {}
  }, []);

  function chooseTheme(next: ThemeName) {
    setTheme(next);
    try { window.localStorage.setItem("hourkey-research-theme", next); } catch {}
  }

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    const params = new URLSearchParams({ days: String(days), limit: "500" });
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

  const allUsers = data?.users || [];

  const filteredUsers = useMemo(() => {
    const rows = allUsers;
    if (filter === "all") return rows;
    if (filter === "test") return rows.filter(isTestAccount);
    if (filter === "real") return rows.filter(isRealAccount);
    if (filter === "pending") return rows.filter((u) => isRealAccount(u) && u.research_status === "pending");
    if (filter === "consented") return rows.filter((u) => isRealAccount(u) && ["verbal_consent", "active", "watch", "done"].includes(u.research_status));
    return rows.filter((u) => isRealAccount(u) && ["declined", "withdrawn", "excluded"].includes(u.research_status));
  }, [allUsers, filter]);

  useEffect(() => {
    if (!filteredUsers.length) {
      setSelected(null);
      return;
    }
    setSelected((current) => filteredUsers.find((u) => u.id === current?.id) || filteredUsers[0]);
  }, [filteredUsers]);

  useEffect(() => {
    if (!selected) {
      setDraftNotes("");
      return;
    }
    setDraftNotes(selected.notes || "");
    setDraftCohort(selected.cohort || "friends-200-20260604");
  }, [selected]);

  const counts = useMemo(() => {
    const real = allUsers.filter(isRealAccount);
    return {
      real: real.length,
      test: allUsers.filter(isTestAccount).length,
      pending: real.filter((u) => u.research_status === "pending").length,
      consented: real.filter((u) => ["verbal_consent", "active", "watch", "done"].includes(u.research_status)).length,
      attention: real.filter((u) => ["declined", "withdrawn", "excluded"].includes(u.research_status)).length,
    };
  }, [allUsers]);

  const summaryCards = useMemo(() => {
    const s = data?.summary || {};
    return [
      {
        label: "ผู้ใช้จริง",
        value: s.real_users_total ?? counts.real,
        note: `${s.users_recent ?? 0} active ใน ${days} วัน`,
        icon: UsersIcon,
        tone: "accent",
      },
      {
        label: "อนุญาตวิจัยแล้ว",
        value: s.consent_granted_total ?? counts.consented,
        note: "พร้อมใช้เป็นข้อมูลวิจัย",
        icon: UserCheckIcon,
        tone: "ok",
      },
      {
        label: "ยังไม่ได้ถาม",
        value: s.consent_pending_total ?? counts.pending,
        note: "เป้าหมายพรุ่งนี้",
        icon: NotebookPenIcon,
        tone: "warn",
      },
      {
        label: "ดวงในระบบ",
        value: s.profiles_total ?? 0,
        note: "profiles active",
        icon: DatabaseIcon,
        tone: "accent",
      },
      {
        label: "Q&A / Traffic",
        value: `${s.qna_total ?? 0}/${s.events_recent ?? 0}`,
        note: `${s.qna_recent ?? 0} Q&A ในช่วงล่าสุด`,
        icon: ActivityIcon,
        tone: "accent",
      },
    ];
  }, [data, counts, days]);

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

  async function saveConsent(status: string, user = selected) {
    if (!user) return;
    setMsg("");
    const labels = parseLabels(user.labels);
    const nextLabels = status === "verbal_consent"
      ? Array.from(new Set([...labels, "verbal-consent", "field-research"]))
      : labels.filter((x) => x !== "verbal-consent");
    const r = await fetch("/api/admin/research", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        status,
        cohort: draftCohort || user.cohort || "friends-200-20260604",
        notes: draftNotes,
        labels: nextLabels,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      setMsg(j.error || "บันทึกสถานะไม่สำเร็จ");
      return;
    }
    const label = statusMeta(status).label;
    setMsg(`บันทึกแล้ว: ${displayName(user)} · ${label}`);
    await load();
  }

  function selectUser(user: UserRow) {
    setSelected(user);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  const filterButtons: Array<{ id: UserFilter; label: string; count: number; icon: typeof UsersIcon }> = [
    { id: "real", label: "ผู้ใช้จริง", count: counts.real, icon: UsersIcon },
    { id: "pending", label: "ยังไม่ได้ถาม", count: counts.pending, icon: NotebookPenIcon },
    { id: "consented", label: "อนุญาตแล้ว", count: counts.consented, icon: UserCheckIcon },
    { id: "attention", label: "ไม่ใช้วิจัย", count: counts.attention, icon: EyeOffIcon },
    { id: "test", label: "test/sim", count: counts.test, icon: AlertTriangleIcon },
    { id: "all", label: "ทั้งหมด", count: allUsers.length, icon: FilterIcon },
  ];

  return (
    <main
      style={THEMES[theme].vars}
      className="min-h-screen bg-[color:var(--research-bg)] text-[color:var(--research-text)]"
    >
      <div className="mx-auto max-w-[1560px] px-4 py-5 md:px-6 md:py-7">
        <header className="mb-5 border-b border-[color:var(--research-line)] pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2 text-xs tracking-[.16em] text-[color:var(--research-muted)]">
                <span>ADMIN</span>
                <span>RESEARCH FIELD CONSOLE</span>
                <span>PRE-LAUNCH</span>
              </div>
              <h1 className="mt-2 font-serif text-3xl md:text-4xl">หลังบ้านวิจัยผู้ใช้งานจริง</h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--research-muted)]">
                ใช้ดูสมาชิกที่สมัครจริง ขออนุญาตปากเปล่า บันทึกสถานะ consent และตามข้อมูล Q&A / traffic รายคนก่อนเปิดระบบเต็ม
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:min-w-[500px]">
              <div className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)] px-3 py-2 text-xs text-[color:var(--research-muted)]">
                <div>admin</div>
                <div className="mt-0.5 break-all text-[color:var(--research-text)]">{email}</div>
              </div>
              <div className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)] p-2">
                <div className="mb-1 flex items-center gap-1 px-1 text-[11px] text-[color:var(--research-muted)]">
                  <PaletteIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  โหมดสี
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(Object.keys(THEMES) as ThemeName[]).map((key) => {
                    const item = THEMES[key];
                    const Icon = item.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => chooseTheme(key)}
                        className={`inline-flex h-9 items-center justify-center gap-1 rounded-sm border px-2 text-xs ${
                          theme === key
                            ? "border-[color:var(--research-accent)] bg-[color:var(--research-accent)]/14"
                            : "border-[color:var(--research-line)] hover:bg-[color:var(--research-soft)]"
                        }`}
                        title={item.label}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            const accentClass = card.tone === "ok"
              ? "text-[color:var(--research-ok)]"
              : card.tone === "warn"
                ? "text-[color:var(--research-warn)]"
                : "text-[color:var(--research-accent)]";
            return (
              <div key={card.label} className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs tracking-[.12em] text-[color:var(--research-muted)]">{card.label}</div>
                  <Icon className={`h-4 w-4 ${accentClass}`} aria-hidden="true" />
                </div>
                <div className="mt-2 font-serif text-3xl">{card.value}</div>
                <div className="mt-1 text-xs text-[color:var(--research-muted)]">{card.note}</div>
              </div>
            );
          })}
        </section>

        <section className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ShieldIcon className="h-4 w-4 text-[color:var(--research-accent)]" aria-hidden="true" />
              ข้อความขออนุญาตปากเปล่า
            </div>
            <p className="text-sm leading-7 text-[color:var(--research-muted)]">{CONSENT_SCRIPT}</p>
          </div>
          <div className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)] p-4">
            <div className="mb-2 text-sm font-medium">หลักการใช้งานพรุ่งนี้</div>
            <div className="space-y-2 text-sm text-[color:var(--research-muted)]">
              <div className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--research-ok)]" aria-hidden="true" />ถามก่อน แล้วค่อยกด “อนุญาตปากเปล่า”</div>
              <div className="flex gap-2"><AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--research-warn)]" aria-hidden="true" />คนที่ยังไม่ได้ถามให้ค้างเป็น “รอถาม”</div>
              <div className="flex gap-2"><EyeOffIcon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--research-bad)]" aria-hidden="true" />ถ้าไม่อนุญาต ให้กด “ไม่อนุญาต” ทันที</div>
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)] p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <label className="relative min-h-10 flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--research-muted)]" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") load(); }}
                className="min-h-10 w-full rounded-sm border border-[color:var(--research-line)] bg-[color:var(--research-soft)] pl-9 pr-3 text-sm outline-none focus:border-[color:var(--research-accent)]"
                placeholder="ค้นชื่อ อีเมล เบอร์ โปรไฟล์ หรือคำถาม เช่น 4656"
              />
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="min-h-10 rounded-sm border border-[color:var(--research-line)] bg-[color:var(--research-soft)] px-3 text-sm"
            >
              <option value={7}>7 วัน</option>
              <option value={30}>30 วัน</option>
              <option value={90}>90 วัน</option>
              <option value={365}>365 วัน</option>
            </select>
            <button
              onClick={load}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-[color:var(--research-line)] px-4 text-sm hover:border-[color:var(--research-accent)] hover:bg-[color:var(--research-soft)]"
            >
              <RefreshCwIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              {loading ? "กำลังโหลด" : "รีเฟรช"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {filterButtons.map(({ id, label, count, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-sm border px-3 text-sm ${
                  filter === id
                    ? "border-[color:var(--research-accent)] bg-[color:var(--research-accent)]/14 text-[color:var(--research-text)]"
                    : "border-[color:var(--research-line)] text-[color:var(--research-muted)] hover:bg-[color:var(--research-soft)]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                <span className="font-mono text-xs">{count}</span>
              </button>
            ))}
          </div>
        </section>

        {msg && (
          <div className="mb-4 rounded-md border border-[color:var(--research-warn)]/35 bg-[color:var(--research-warn)]/10 px-3 py-2 text-sm text-[color:var(--research-warn)]">
            {msg}
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-[450px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)]">
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--research-line)] px-4 py-3">
              <div>
                <div className="text-sm font-medium">รายชื่อสมาชิก</div>
                <div className="mt-0.5 text-xs text-[color:var(--research-muted)]">
                  {filteredUsers.length} คนในมุมมองนี้ จาก {allUsers.length} คนที่โหลด
                </div>
              </div>
              <UsersIcon className="h-4 w-4 text-[color:var(--research-muted)]" aria-hidden="true" />
            </div>
            <div className="max-h-[45vh] overflow-auto xl:max-h-[78vh]">
              {filteredUsers.map((u) => {
                const active = selected?.id === u.id;
                const meta = statusMeta(u.research_status);
                return (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={`w-full border-b border-[color:var(--research-line)] px-4 py-3 text-left transition-colors hover:bg-[color:var(--research-soft)] ${active ? "bg-[color:var(--research-accent)]/10 shadow-[inset_3px_0_0_var(--research-accent)]" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] text-xs font-medium">
                        {initials(u)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{displayName(u)}</div>
                          <span className={`shrink-0 rounded-sm border px-2 py-0.5 text-[11px] ${toneClass(meta.tone)}`}>
                            {meta.short}
                          </span>
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-[color:var(--research-muted)]">
                          {u.phone ? <PhoneIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <MailIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                          <span className="truncate">{contactLine(u)}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-[color:var(--research-muted)]">
                          <span>ดวง {u.profile_count}</span>
                          <span>Q&A {u.qna_count}</span>
                          <span>Events {u.event_count}</span>
                          <span className="truncate">{accountKindLabel(u)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!filteredUsers.length && (
                <div className="p-10 text-center text-sm text-[color:var(--research-muted)]">
                  ยังไม่มีสมาชิกในมุมมองนี้
                </div>
              )}
            </div>
          </aside>

          <section ref={detailRef} className="min-w-0 scroll-mt-4 rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-panel)]">
            {selected ? (
              <div>
                <div className="border-b border-[color:var(--research-line)] p-4 md:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[color:var(--research-accent)]/45 bg-[color:var(--research-accent)]/12 font-serif text-xl">
                        {initials(selected)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs tracking-[.16em] text-[color:var(--research-muted)]">USER RESEARCH DOSSIER</div>
                        <h2 className="mt-1 truncate font-serif text-3xl">{displayName(selected)}</h2>
                        <div className="mt-1 break-all text-xs text-[color:var(--research-muted)]">{contactLine(selected)}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-sm border px-2 py-1 text-xs ${toneClass(statusMeta(selected.research_status).tone)}`}>
                            {statusMeta(selected.research_status).label}
                          </span>
                          <span className="rounded-sm border border-[color:var(--research-line)] px-2 py-1 text-xs text-[color:var(--research-muted)]">
                            {accountKindLabel(selected)}
                          </span>
                          {selected.cohort && (
                            <span className="rounded-sm border border-[color:var(--research-line)] px-2 py-1 text-xs text-[color:var(--research-muted)]">
                              {selected.cohort}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-[380px]">
                      <button
                        onClick={() => saveConsent("verbal_consent", selected)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-[color:var(--research-ok)]/45 bg-[color:var(--research-ok)]/12 px-3 text-sm text-[color:var(--research-ok)]"
                      >
                        <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                        อนุญาตปากเปล่า
                      </button>
                      <button
                        onClick={() => saveConsent("declined", selected)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-[color:var(--research-bad)]/45 bg-[color:var(--research-bad)]/10 px-3 text-sm text-[color:var(--research-bad)]"
                      >
                        <EyeOffIcon className="h-4 w-4" aria-hidden="true" />
                        ไม่อนุญาต
                      </button>
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
                        <div key={item.label} className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] p-3">
                          <div className="flex items-center justify-between text-xs text-[color:var(--research-muted)]">
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
                      { id: "consent" as const, label: "Consent", icon: ShieldIcon },
                      { id: "qna" as const, label: "Q&A ต่อเนื่อง", icon: MessageSquareIcon },
                      { id: "traffic" as const, label: "Traffic รายคน", icon: ActivityIcon },
                    ].map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setDetailTab(id)}
                        className={`inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm ${
                          detailTab === id
                            ? "border-[color:var(--research-accent)] bg-[color:var(--research-accent)]/14"
                            : "border-[color:var(--research-line)] text-[color:var(--research-muted)] hover:bg-[color:var(--research-soft)]"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="p-4 md:p-5">
                  {detailTab === "overview" && (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_330px]">
                      <section className="space-y-4">
                        <div>
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                            <DatabaseIcon className="h-4 w-4 text-[color:var(--research-accent)]" aria-hidden="true" />
                            ดวงในระบบของคนนี้
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {selectedProfiles.map((p) => (
                              <div key={p.id} className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{p.name}</div>
                                    <div className="mt-1 truncate text-xs text-[color:var(--research-muted)]">{profileMeta(p)}</div>
                                  </div>
                                  <span className="rounded-sm border border-[color:var(--research-line)] px-2 py-1 text-xs text-[color:var(--research-muted)]">{stemLabel(p.day_master)}</span>
                                </div>
                                <div className="mt-3 grid gap-1 text-xs leading-5 text-[color:var(--research-muted)]">
                                  <div>เกิด: {dt(p.birth_datetime)}</div>
                                  <div>สถานที่: {p.birth_location_name || "-"}</div>
                                  <div>กำลังวัน: {p.day_master_strength || "-"}</div>
                                </div>
                              </div>
                            ))}
                            {!selectedProfiles.length && (
                              <div className="rounded-md border border-dashed border-[color:var(--research-line)] p-6 text-center text-sm text-[color:var(--research-muted)] md:col-span-2">
                                ยังไม่พบดวง active ของคนนี้ในข้อมูลที่โหลด
                              </div>
                            )}
                          </div>
                        </div>
                      </section>

                      <aside className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <ClockIcon className="h-4 w-4 text-[color:var(--research-accent)]" aria-hidden="true" />
                          Timeline
                        </div>
                        <div className="space-y-3 text-sm">
                          {[
                            ["สมัคร", selected.created_at],
                            ["active ล่าสุด", selected.last_active_at],
                            ["event ล่าสุด", selected.last_event_at],
                            ["Q&A ล่าสุด", selected.last_qna_at],
                            ["consent", selected.consent_at],
                          ].map(([label, value]) => (
                            <div key={label || ""} className="flex items-start justify-between gap-3 border-b border-[color:var(--research-line)] pb-2 last:border-0">
                              <span className="text-[color:var(--research-muted)]">{label}</span>
                              <span className="text-right">{dt(value)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-[color:var(--research-line)] pt-4">
                          <div className="text-xs text-[color:var(--research-muted)]">Notes</div>
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--research-muted)]">{selected.notes || "-"}</div>
                        </div>
                      </aside>
                    </div>
                  )}

                  {detailTab === "consent" && (
                    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <ShieldIcon className="h-4 w-4 text-[color:var(--research-accent)]" aria-hidden="true" />
                          บันทึก consent รายคน
                        </div>
                        <label className="block text-xs text-[color:var(--research-muted)]">สถานะ</label>
                        <select
                          value={selected.research_status}
                          onChange={(e) => saveConsent(e.target.value, selected)}
                          className="mt-1 min-h-10 w-full rounded-sm border border-[color:var(--research-line)] bg-[color:var(--research-panel)] px-3 text-sm"
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                        <label className="mt-4 block text-xs text-[color:var(--research-muted)]">Cohort / กลุ่ม</label>
                        <input
                          value={draftCohort}
                          onChange={(e) => setDraftCohort(e.target.value)}
                          className="mt-1 min-h-10 w-full rounded-sm border border-[color:var(--research-line)] bg-[color:var(--research-panel)] px-3 text-sm"
                          placeholder="friends-200-20260604"
                        />
                        <label className="mt-4 block text-xs text-[color:var(--research-muted)]">Note ภาคสนาม</label>
                        <textarea
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          className="mt-1 min-h-32 w-full rounded-sm border border-[color:var(--research-line)] bg-[color:var(--research-panel)] px-3 py-2 text-sm leading-6"
                          placeholder="เช่น ขออนุญาตปากเปล่าแล้วต่อหน้า / ไม่สะดวกให้ใช้ข้อมูล / นัดตามผลภายหลัง"
                        />
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <button
                            onClick={() => saveConsent("verbal_consent", selected)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-[color:var(--research-ok)]/45 bg-[color:var(--research-ok)]/12 px-3 text-sm text-[color:var(--research-ok)]"
                          >
                            <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                            บันทึกอนุญาต
                          </button>
                          <button
                            onClick={() => saveConsent(selected.research_status, selected)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-[color:var(--research-line)] px-3 text-sm hover:bg-[color:var(--research-panel)]"
                          >
                            <NotebookPenIcon className="h-4 w-4" aria-hidden="true" />
                            บันทึก note
                          </button>
                        </div>
                      </div>
                      <aside className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] p-4">
                        <div className="text-sm font-medium">ข้อความที่ใช้พูด</div>
                        <p className="mt-3 text-sm leading-7 text-[color:var(--research-muted)]">{CONSENT_SCRIPT}</p>
                        <div className="mt-4 rounded-sm border border-[color:var(--research-line)] bg-[color:var(--research-panel)] p-3 text-xs leading-6 text-[color:var(--research-muted)]">
                          หลังพูดจบ ถ้าเขาตอบตกลง ให้กด “บันทึกอนุญาต” ทันที ถ้าไม่แน่ใจอย่ากด ให้คงสถานะ “ยังไม่ได้ถาม”
                        </div>
                      </aside>
                    </section>
                  )}

                  {detailTab === "qna" && (
                    <section className="space-y-3">
                      {selectedQna.map((x) => (
                        <article key={`${x.feature}-${x.id}`} className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] p-4">
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--research-muted)]">
                            <span className="rounded-sm border border-[color:var(--research-line)] px-2 py-1 text-[color:var(--research-text)]">{featureLabel(x.feature)}</span>
                            {x.profile_name && <span>ดวง: {x.profile_name}</span>}
                            {x.mode && <span>mode: {x.mode}</span>}
                            {x.topic && <span>topic: {x.topic}</span>}
                            <span>{dt(x.created_at)}</span>
                          </div>
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className={auditBadgeClass(Boolean(x.profile_id && x.profile_binding_status === "bound"))}>
                              {x.profile_id && x.profile_binding_status === "bound" ? "BOUND" : "UNBOUND"}
                            </span>
                            <span className={auditBadgeClass(Boolean(x.packet_hash && x.audit_quality === "packet_evidence"))}>
                              {x.packet_hash && x.audit_quality === "packet_evidence" ? "PACKET_SEEN" : "NO_PACKET_EVIDENCE"}
                            </span>
                            {x.identity_check_result && (
                              <span className={auditBadgeClass(x.identity_check_result === "pass" || x.identity_check_result === "cached")}>
                                identity: {x.identity_check_result}
                              </span>
                            )}
                            {x.prediction_phase && <span className="rounded-sm border border-[color:var(--research-line)] px-2 py-1">phase: {x.prediction_phase}</span>}
                            {typeof x.history_dropped_count === "number" && x.history_dropped_count > 0 && (
                              <span className={auditBadgeClass(false)}>history dropped: {x.history_dropped_count}</span>
                            )}
                          </div>
                          <div className="text-sm font-medium leading-6">ถาม: {short(x.question, 700)}</div>
                          <div className="mt-3 whitespace-pre-wrap border-l border-[color:var(--research-accent)]/50 pl-3 text-sm leading-6 text-[color:var(--research-muted)]">
                            {short(x.answer, 2_400)}
                          </div>
                          <details className="mt-3 text-xs text-[color:var(--research-muted)]">
                              <summary className="cursor-pointer">audit evidence</summary>
                              <div className="mt-2 grid gap-2 rounded-sm border border-[color:var(--research-line)] p-2 md:grid-cols-2">
                                <div>packet: {x.packet_hash || "-"}</div>
                                <div>context: {x.context_hash || "-"}</div>
                                <div>prompt: {x.prompt_hash || "-"}</div>
                                <div>thread: {x.thread_id || "-"}</div>
                                <div>thread profile: {x.thread_profile_id || "-"}</div>
                                <div>prompt version: {x.prompt_version || "-"}</div>
                                <div>binding: {x.profile_binding_status || "-"}</div>
                                <div>audit: {x.audit_quality || "-"}</div>
                              </div>
                              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-[color:var(--research-line)] p-2">{payloadText({
                                profile_snapshot: x.profile_snapshot,
                                pillars_snapshot: x.pillars_snapshot,
                                packet_snapshot_safe: x.packet_snapshot_safe,
                                fact_lock: x.fact_lock,
                                pillar_lock: x.pillar_lock,
                                knowledge_hashes: x.knowledge_hashes,
                                prediction_rows: x.prediction_rows,
                                request_payload: x.request_payload,
                                response_meta: x.response_meta,
                                history_profile_ids: x.history_profile_ids,
                                prompt_version: x.prompt_version,
                                profile_binding_status: x.profile_binding_status,
                                audit_quality: x.audit_quality,
                              })}</pre>
                          </details>
                          {Array.isArray(x.history) && x.history.length > 0 && (
                            <details className="mt-3 text-xs text-[color:var(--research-muted)]">
                              <summary className="cursor-pointer">ประวัติคำถามก่อนหน้า {x.history.length} รายการ</summary>
                              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-sm border border-[color:var(--research-line)] p-2">{JSON.stringify(x.history, null, 2)}</pre>
                            </details>
                          )}
                        </article>
                      ))}
                      {!selectedQna.length && (
                        <div className="rounded-md border border-dashed border-[color:var(--research-line)] p-8 text-center text-sm text-[color:var(--research-muted)]">
                          {selected.qna_count > 0
                            ? `คนนี้มี Q&A ${selected.qna_count} รายการ แต่ไม่อยู่ในชุดล่าสุดที่โหลด ลองค้นชื่อ/เบอร์ของคนนี้แล้วรีเฟรช`
                            : "ยังไม่มี Q&A ของคนนี้ในชุดข้อมูลที่โหลด"}
                        </div>
                      )}
                    </section>
                  )}

                  {detailTab === "traffic" && (
                    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="space-y-3">
                        {selectedEvents.map((e) => (
                          <article key={e.id} className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)] p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-sm border border-[color:var(--research-line)] px-2 py-1 text-xs">{e.event_name}</span>
                              <span className="truncate">{e.page_path || "-"}</span>
                              {e.profile_name && <span className="text-xs text-[color:var(--research-muted)]">ดวง: {e.profile_name}</span>}
                            </div>
                            <div className="mt-2 text-xs text-[color:var(--research-muted)]">{dt(e.created_at)} · session {e.session_key || "-"}</div>
                            <details className="mt-2 text-xs text-[color:var(--research-muted)]">
                              <summary className="cursor-pointer">payload</summary>
                              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-sm border border-[color:var(--research-line)] p-2">{payloadText(e.payload)}</pre>
                            </details>
                          </article>
                        ))}
                        {!selectedEvents.length && (
                          <div className="rounded-md border border-dashed border-[color:var(--research-line)] p-8 text-center text-sm text-[color:var(--research-muted)]">
                            ยังไม่มี event ของคนนี้ในช่วง {days} วัน
                          </div>
                        )}
                      </div>
                      <aside className="rounded-md border border-[color:var(--research-line)] bg-[color:var(--research-soft)]">
                        <div className="border-b border-[color:var(--research-line)] px-3 py-2 text-sm font-medium">Traffic รวมตามหน้า</div>
                        <div className="max-h-[58vh] overflow-auto">
                          {(data?.traffic_by_path || []).map((r) => (
                            <div key={`${r.page_path}-${r.event_name}`} className="border-b border-[color:var(--research-line)] px-3 py-3 text-sm last:border-0">
                              <div className="flex items-center justify-between gap-3">
                                <div className="truncate">{r.page_path}</div>
                                <div className="font-mono text-[color:var(--research-accent)]">{r.count}</div>
                              </div>
                              <div className="mt-1 text-xs text-[color:var(--research-muted)]">{r.event_name} · {r.users} users · {dt(r.last_at)}</div>
                            </div>
                          ))}
                        </div>
                      </aside>
                    </section>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[480px] items-center justify-center text-sm text-[color:var(--research-muted)]">
                เลือกสมาชิกจากรายการซ้ายเพื่อดูรายละเอียดรายคน
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
