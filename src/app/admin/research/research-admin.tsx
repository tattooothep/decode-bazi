"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BotIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  InboxIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  MoonIcon,
  RefreshCwIcon,
  SearchIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

/* ---------------------------------------------------------------------------
 * /admin/research · มอนิเตอร์แชท AI
 * แอดมินดูว่าผู้ใช้คุยอะไรกับ AI (ทุกแหล่งในระบบ) — อ่านอย่างเดียว
 * API (Agent A):
 *   GET /api/admin/research/stats
 *   GET /api/admin/research/chats?source=&user=&q=&days=&limit=&offset=
 *   GET /api/admin/research/chats/<id>?source=
 * ------------------------------------------------------------------------- */

type Lang = "th" | "en" | "zh";

type ChatRow = {
  id: string;
  source: string;
  user_email: string | null;
  user_name: string | null;
  feature: string | null;
  started_at: string | null;
  last_at: string | null;
  message_count: number;
  preview: string | null;
};

type ThreadMsg = {
  role: string; // "user" | "ai"
  content: string;
  at: string | null;
};

type ThreadData = {
  user_email: string | null;
  user_name: string | null;
  feature: string | null;
  messages: ThreadMsg[];
};

type SourceStat = { source: string; chats: number; messages: number };

type StatsData = {
  chats_today: number;
  chats_7d: number;
  messages_7d: number;
  users_7d: number;
  by_source: SourceStat[];
};

/* source จริงที่ API รองรับ: all|research|sifu|fusion */
const KNOWN_SOURCES = ["research", "sifu", "fusion"];

/* ---------- i18n ภายในหน้า (ไทยนำ + en/zh) — ไม่แตะระบบ i18n กลาง ---------- */

const L: Record<string, { th: string; en: string; zh: string }> = {
  title: { th: "มอนิเตอร์แชท AI", en: "AI Chat Monitor", zh: "AI 對話監控" },
  subtitle: {
    th: "ดูว่าผู้ใช้คุยอะไรกับ AI ทุกแหล่งในระบบ · อ่านอย่างเดียว",
    en: "See what users talk about with the AI across all sources · read-only",
    zh: "查看用戶與 AI 的全部對話 · 只讀",
  },
  statToday: { th: "แชทวันนี้", en: "Chats today", zh: "今日對話" },
  stat7d: { th: "แชท 7 วัน", en: "Chats · 7 days", zh: "7天對話" },
  statMsg7d: { th: "ข้อความ 7 วัน", en: "Messages · 7 days", zh: "7天訊息" },
  statUsers7d: { th: "คนคุย 7 วัน", en: "Users · 7 days", zh: "7天用戶" },
  bySource: { th: "แยกแหล่ง 7 วัน", en: "By source · 7 days", zh: "7天來源分佈" },
  filterSource: { th: "แหล่ง", en: "Source", zh: "來源" },
  allSources: { th: "ทุกแหล่ง", en: "All sources", zh: "全部來源" },
  filterUser: { th: "ค้นหาชื่อ/อีเมล", en: "Search name/email", zh: "搜尋名稱/電郵" },
  filterQ: { th: "ค้นหาในเนื้อหาแชท", en: "Search in messages", zh: "搜尋對話內容" },
  filterDays: { th: "ช่วงวัน", en: "Range", zh: "時間範圍" },
  day1: { th: "วันนี้", en: "Today", zh: "今天" },
  day7: { th: "7 วัน", en: "7 days", zh: "7天" },
  day30: { th: "30 วัน", en: "30 days", zh: "30天" },
  day90: { th: "90 วัน", en: "90 days", zh: "90天" },
  day365: { th: "1 ปี", en: "1 year", zh: "1年" },
  refresh: { th: "รีเฟรช", en: "Refresh", zh: "重新整理" },
  loading: { th: "กำลังโหลด…", en: "Loading…", zh: "載入中…" },
  convList: { th: "บทสนทนา", en: "Conversations", zh: "對話列表" },
  msgUnit: { th: "ข้อความ", en: "msgs", zh: "則" },
  started: { th: "เริ่ม", en: "Started", zh: "開始" },
  lastAt: { th: "ล่าสุด", en: "Last", zh: "最新" },
  noName: { th: "ไม่ระบุชื่อ", en: "Unnamed", zh: "未命名" },
  emptyList: {
    th: "ยังไม่มีบทสนทนาในช่วงที่เลือก — ตอนนี้ผู้ใช้จริงยังน้อย ลองขยายช่วงวันหรือเคลียร์ตัวกรองดูครับ",
    en: "No conversations in this range yet — with few real users so far, try widening the range or clearing filters.",
    zh: "所選範圍內尚無對話 — 目前真實用戶還不多，可放寬時間範圍或清除篩選。",
  },
  emptyThread: {
    th: "เลือกบทสนทนาจากรายการด้านซ้ายเพื่ออ่านเธรดเต็ม",
    en: "Pick a conversation on the left to read the full thread",
    zh: "從左側選擇對話以閱讀完整內容",
  },
  threadEmpty: {
    th: "เธรดนี้ยังไม่มีข้อความ",
    en: "This thread has no messages",
    zh: "此對話尚無訊息",
  },
  loadFail: { th: "โหลดข้อมูลไม่สำเร็จ", en: "Failed to load", zh: "載入失敗" },
  copy: { th: "คัดลอก", en: "Copy", zh: "複製" },
  copied: { th: "คัดลอกแล้ว", en: "Copied", zh: "已複製" },
  copyAll: { th: "คัดลอกทั้งเธรด", en: "Copy thread", zh: "複製全部" },
  prev: { th: "ก่อนหน้า", en: "Prev", zh: "上一頁" },
  next: { th: "ถัดไป", en: "Next", zh: "下一頁" },
  pageOf: { th: "หน้า", en: "Page", zh: "頁" },
  userSide: { th: "ผู้ใช้", en: "User", zh: "用戶" },
  aiSide: { th: "AI", en: "AI", zh: "AI" },
  themeDark: { th: "โหมดหมึก", en: "Ink mode", zh: "墨色模式" },
  themeLight: { th: "โหมดกระดาษ", en: "Paper mode", zh: "紙色模式" },
  itemsShown: { th: "รายการ", en: "items", zh: "筆" },
};

/* ป้ายแหล่งหลัก (source ของ API) */
const SOURCE_LABEL: Record<string, { th: string; en: string; zh: string }> = {
  research: { th: "ซินแสแชทต่อเนื่อง", en: "Sifu chat", zh: "師傅連續對話" },
  sifu: { th: "ซินแสหน้าดวง", en: "Chart sifu", zh: "命盤師傅" },
  fusion: { th: "ฟิวชั่น 5 ศาสตร์", en: "Fusion 5", zh: "五術融合" },
};

/* ป้าย feature ย่อย (ละเอียดกว่า source · โชว์บนการ์ด/หัวเธรด) */
const FEATURE_LABEL: Record<string, { th: string; en: string; zh: string }> = {
  sifu_master: { th: "ซินแสหลัก", en: "Sifu master", zh: "師傅主問" },
  sifu_group: { th: "ซินแสกลุ่ม", en: "Sifu group", zh: "群組師傅" },
  network_sifu: { th: "ซินแสเครือข่าย", en: "Network sifu", zh: "網絡師傅" },
  qimen_sifu: { th: "ซินแสฉีเหมิน", en: "Qimen sifu", zh: "奇門師傅" },
  chart_overview: { th: "อ่านดวงต่อเนื่อง", en: "Chart overview", zh: "命盤連讀" },
  chart_sifu: { th: "ถามซินแสหน้าดวง", en: "Chart sifu Q&A", zh: "命盤師傅問答" },
  fusion5_job: { th: "งานอ่านฟิวชั่น", en: "Fusion job", zh: "融合解讀" },
  fusion: { th: "ฟิวชั่น", en: "Fusion", zh: "融合" },
};

/* ---------- helpers (แสดงผลผ่าน JSX text เท่านั้น = escape กัน XSS เสมอ) ---------- */

function fmtDT(v: string | null | undefined, lang: Lang): string {
  if (!v) return "-";
  try {
    const loc = lang === "th" ? "th-TH" : lang === "zh" ? "zh-TW" : "en-GB";
    return new Intl.DateTimeFormat(loc, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(v));
  } catch {
    return String(v);
  }
}

function fmtTime(v: string | null | undefined, lang: Lang): string {
  if (!v) return "";
  try {
    const loc = lang === "th" ? "th-TH" : lang === "zh" ? "zh-TW" : "en-GB";
    return new Intl.DateTimeFormat(loc, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(new Date(v));
  } catch {
    return String(v);
  }
}

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US");
}

function clip(v: string | null | undefined, n: number): string {
  if (!v) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function asStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function asNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* map payload /stats → StatsData
 * รูปจริงจาก API: { ok, chats_today, chats_7d, messages_7d, active_chatters_7d,
 *   by_source: { research:{chats_7d,messages_7d}, sifu:{...}, fusion:{...} } } */
function normalizeStats(j: Record<string, unknown>): StatsData {
  const bySrc: SourceStat[] = [];
  if (j.by_source && typeof j.by_source === "object" && !Array.isArray(j.by_source)) {
    for (const [key, v] of Object.entries(j.by_source as Record<string, unknown>)) {
      const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      bySrc.push({ source: key, chats: asNum(o.chats_7d), messages: asNum(o.messages_7d) });
    }
  }
  return {
    chats_today: asNum(j.chats_today),
    chats_7d: asNum(j.chats_7d),
    messages_7d: asNum(j.messages_7d),
    users_7d: asNum(j.active_chatters_7d),
    by_source: bySrc,
  };
}

/* map payload /chats/<id> → ThreadData
 * รูปจริงจาก API: { ok, id, source, user_email, user_name, feature,
 *   messages:[{ role:"user"|"ai", content, created_at }] } */
function normalizeThread(j: Record<string, unknown>): ThreadData {
  const rawMsgs = Array.isArray(j.messages) ? (j.messages as Record<string, unknown>[]) : [];
  return {
    user_email: j.user_email != null ? asStr(j.user_email) : null,
    user_name: j.user_name != null ? asStr(j.user_name) : null,
    feature: j.feature != null ? asStr(j.feature) : null,
    messages: rawMsgs.map((m) => ({
      role: asStr(m.role || "ai"),
      content: asStr(m.content),
      at: m.created_at != null ? asStr(m.created_at) : null,
    })),
  };
}

/* ---------- ธีม 2 โหมดเข้าชุด admin (หมึกทอง / กระดาษ) ---------- */

const PAGE_CSS = `
.rc-wrap { --rc-line: rgba(240,232,220,0.1); --rc-soft: rgba(240,232,220,0.05);
  --rc-text: var(--hk-ink); --rc-muted: rgba(240,232,220,0.55);
  --rc-panel: rgba(28,24,20,0.82); --rc-user-bub: rgba(201,164,92,0.16);
  --rc-user-line: rgba(201,164,92,0.4); --rc-ai-bub: rgba(240,232,220,0.05);
  --rc-ai-line: rgba(240,232,220,0.14); --rc-accent: var(--hk-gold);
  color: var(--rc-text); }
.rc-wrap.rc-light { --rc-line: rgba(60,48,32,0.16); --rc-soft: rgba(60,48,32,0.05);
  --rc-text: #2a241c; --rc-muted: rgba(42,36,28,0.6);
  --rc-panel: #faf5ec; --rc-user-bub: rgba(160,120,48,0.13);
  --rc-user-line: rgba(160,120,48,0.4); --rc-ai-bub: rgba(60,48,32,0.05);
  --rc-ai-line: rgba(60,48,32,0.16); --rc-accent: #8a6a2f;
  background: #f3ebe0; border-radius: var(--hk-radius); padding: 0.9rem; }
.hk-admin .rc-wrap.rc-light input, .hk-admin .rc-wrap.rc-light select {
  background: #fffdf8 !important; color: #2a241c !important;
  border-color: rgba(60,48,32,0.22) !important; }
.hk-admin .rc-wrap.rc-light input::placeholder { color: rgba(42,36,28,0.45) !important; }
.rc-wrap .rc-panel { border: 1px solid var(--rc-line); background: var(--rc-panel);
  border-radius: var(--hk-radius); }
.rc-wrap .rc-tile { border: 1px solid var(--rc-line); background: var(--rc-panel);
  border-radius: var(--hk-radius); padding: 0.75rem 0.9rem; min-width: 0; }
.rc-wrap .rc-tile .lbl { font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--rc-muted); font-family: var(--hk-mono); }
.rc-wrap .rc-tile .val { margin-top: 0.3rem; font-family: var(--hk-mono);
  font-size: 1.35rem; color: var(--rc-text); }
.rc-wrap .rc-chip { display: inline-flex; align-items: center; gap: 0.3rem;
  border: 1px solid var(--rc-line); background: var(--rc-soft); border-radius: 999px;
  padding: 0.12rem 0.55rem; font-size: 0.72rem; color: var(--rc-muted); }
.rc-wrap .rc-chip b { color: var(--rc-accent); font-family: var(--hk-mono); font-weight: 600; }
.rc-wrap .rc-srcbadge { display: inline-block; border: 1px solid var(--rc-user-line);
  background: var(--rc-user-bub); color: var(--rc-accent); border-radius: 6px;
  padding: 0.05rem 0.45rem; font-size: 0.7rem; white-space: nowrap; }
.rc-wrap .rc-card { display: block; width: 100%; text-align: left; background: transparent;
  border: 0; border-bottom: 1px solid var(--rc-line); padding: 0.7rem 0.85rem;
  color: var(--rc-text); transition: background 0.12s ease; }
.rc-wrap .rc-card:hover { background: var(--rc-soft); }
.rc-wrap .rc-card.is-active { background: var(--rc-user-bub);
  box-shadow: inset 3px 0 0 var(--rc-accent); }
.rc-wrap .rc-muted { color: var(--rc-muted); }
.rc-wrap .rc-bub { max-width: min(46rem, 86%); border-radius: 12px; padding: 0.55rem 0.75rem;
  font-size: 0.85rem; line-height: 1.65; white-space: pre-wrap; word-break: break-word;
  overflow-wrap: anywhere; }
.rc-wrap .rc-bub.rc-user { background: var(--rc-user-bub); border: 1px solid var(--rc-user-line);
  border-bottom-right-radius: 4px; }
.rc-wrap .rc-bub.rc-ai { background: var(--rc-ai-bub); border: 1px solid var(--rc-ai-line);
  border-bottom-left-radius: 4px; }
.rc-wrap .rc-msgmeta { display: flex; align-items: center; gap: 0.45rem; margin-top: 0.25rem;
  font-size: 0.66rem; color: var(--rc-muted); font-family: var(--hk-mono); }
.rc-wrap .rc-copybtn { display: inline-flex; align-items: center; gap: 0.25rem;
  border: 1px solid transparent; background: transparent; color: var(--rc-muted);
  border-radius: 6px; padding: 0.08rem 0.4rem; font-size: 0.66rem; }
.rc-wrap .rc-copybtn:hover { border-color: var(--rc-line); color: var(--rc-text); }
.rc-wrap .rc-btn { display: inline-flex; align-items: center; justify-content: center;
  gap: 0.4rem; border: 1px solid var(--rc-line); background: transparent;
  color: var(--rc-text); border-radius: var(--hk-radius-sm); padding: 0.45rem 0.8rem;
  font-size: 0.8rem; }
.rc-wrap .rc-btn:hover { border-color: var(--rc-user-line); background: var(--rc-soft); }
.rc-wrap .rc-btn:disabled { opacity: 0.4; cursor: default; }
.rc-wrap .rc-scroll { overflow-y: auto; overscroll-behavior: contain; }
@media (max-width: 1023px) { .rc-wrap .rc-grid { grid-template-columns: 1fr !important; } }
`;

/* --------------------------------- page --------------------------------- */

export default function ResearchAdmin() {
  const { locale } = useAdminDict();
  const lang: Lang = locale === "th" ? "th" : locale === "zh" ? "zh" : "en";
  const t = useCallback((k: string) => (L[k] ? L[k][lang] || L[k].th : k), [lang]);

  const srcLabel = useCallback(
    (s: string) => {
      const m = SOURCE_LABEL[s];
      return m ? m[lang] || m.th : s;
    },
    [lang]
  );

  const featLabel = useCallback(
    (f: string | null | undefined) => {
      if (!f) return "";
      const m = FEATURE_LABEL[f];
      return m ? m[lang] || m.th : f;
    },
    [lang]
  );

  const [theme, setTheme] = useState<"ink" | "paper">("ink");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [err, setErr] = useState("");

  const [source, setSource] = useState("");
  const [user, setUser] = useState("");
  const [q, setQ] = useState("");
  const [days, setDays] = useState(30);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const [selected, setSelected] = useState<{ id: string; source: string } | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [copied, setCopied] = useState<string>("");

  const readerRef = useRef<HTMLElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hk-research-theme");
      if (saved === "paper" || saved === "ink") setTheme(saved);
    } catch {}
  }, []);

  const chooseTheme = (next: "ink" | "paper") => {
    setTheme(next);
    try {
      window.localStorage.setItem("hk-research-theme", next);
    } catch {}
  };

  /* ---- แถบสถิติ: GET /api/admin/research/stats ---- */
  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/research/stats", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(asStr(j.error) || `HTTP ${r.status}`);
      setStats(normalizeStats(j));
    } catch {
      /* แถบสถิติพังไม่ควรล้มทั้งหน้า — ปล่อยเป็นค่าว่าง */
    }
  }, []);

  /* ---- รายการซ้าย: GET /api/admin/research/chats ---- */
  const loadChats = useCallback(async () => {
    setLoadingList(true);
    setErr("");
    try {
      const p = new URLSearchParams({
        days: String(days),
        limit: String(limit),
        offset: String(offset),
      });
      if (source) p.set("source", source);
      if (user.trim()) p.set("user", user.trim());
      if (q.trim()) p.set("q", q.trim());
      const r = await fetch(`/api/admin/research/chats?${p}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(asStr(j.error) || `HTTP ${r.status}`);
      const list: ChatRow[] = Array.isArray(j.chats) ? j.chats : Array.isArray(j.rows) ? j.rows : [];
      setRows(list);
      setTotal(typeof j.total === "number" ? j.total : null);
    } catch (e) {
      setRows([]);
      setTotal(null);
      setErr(e instanceof Error ? e.message : t("loadFail"));
    } finally {
      setLoadingList(false);
    }
  }, [days, offset, source, user, q, t]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  /* แถวในลิสต์ของเธรดที่เปิดอยู่ (ใช้เวลาเริ่ม-ล่าสุด/จำนวนข้อความบนหัวเธรด) */
  const threadChat = useMemo(
    () =>
      selected
        ? rows.find((x) => x.id === selected.id && x.source === selected.source) || null
        : null,
    [rows, selected]
  );

  /* ---- เธรดขวา: GET /api/admin/research/chats/<id>?source= ---- */
  useEffect(() => {
    if (!selected) {
      setThread(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingThread(true);
      try {
        const p = new URLSearchParams({ source: selected.source });
        const r = await fetch(
          `/api/admin/research/chats/${encodeURIComponent(selected.id)}?${p}`,
          { cache: "no-store" }
        );
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(asStr(j.error) || `HTTP ${r.status}`);
        if (cancelled) return;
        setThread(normalizeThread(j));
      } catch {
        if (!cancelled) {
          setThread({ user_email: null, user_name: null, feature: null, messages: [] });
        }
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  /* เลือกอันแรกอัตโนมัติเมื่อรายการเปลี่ยน (เฉพาะจอกว้าง) */
  useEffect(() => {
    if (!rows.length) {
      setSelected(null);
      return;
    }
    setSelected((cur) => {
      if (cur && rows.some((x) => x.id === cur.id && x.source === cur.source)) return cur;
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        return null;
      }
      return { id: rows[0].id, source: rows[0].source };
    });
  }, [rows]);

  const pickChat = (row: ChatRow) => {
    setSelected({ id: row.id, source: row.source });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => {
        readerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const doCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1600);
    } catch {}
  };

  /* ชื่อ/อีเมลผู้ใช้ของเธรดที่เปิดอยู่ — เอาจาก detail ก่อน แล้วค่อย fallback แถวในลิสต์ */
  const threadUserName = thread?.user_name || threadChat?.user_name || null;
  const threadUserEmail = thread?.user_email || threadChat?.user_email || null;
  const threadFeature = thread?.feature || threadChat?.feature || null;

  const copyWholeThread = () => {
    if (!thread) return;
    const name = threadUserName || threadUserEmail || "";
    const txt = thread.messages
      .map((m) => `[${m.role === "user" ? t("userSide") : t("aiSide")}${m.at ? " · " + fmtDT(m.at, lang) : ""}] ${name && m.role === "user" ? name + ": " : ""}${m.content}`)
      .join("\n\n");
    doCopy("__all__", txt);
  };

  const sourceOptions = useMemo(() => {
    const set = new Set<string>(KNOWN_SOURCES);
    (stats?.by_source || []).forEach((r) => set.add(r.source));
    rows.forEach((r) => r.source && set.add(r.source));
    return Array.from(set);
  }, [stats, rows]);

  const page = Math.floor(offset / limit) + 1;
  const pageMax = total != null ? Math.max(1, Math.ceil(total / limit)) : null;
  const hasNext = total != null ? offset + limit < total : rows.length === limit;

  const tiles = [
    { label: t("statToday"), value: fmtNum(stats?.chats_today) },
    { label: t("stat7d"), value: fmtNum(stats?.chats_7d) },
    { label: t("statMsg7d"), value: fmtNum(stats?.messages_7d) },
    { label: t("statUsers7d"), value: fmtNum(stats?.users_7d) },
  ];

  return (
    <AdminShell title={t("title")} locale={locale}>
      <style>{PAGE_CSS}</style>
      <div className={`rc-wrap ${theme === "paper" ? "rc-light" : ""}`}>
        {/* แถวบน: คำอธิบาย + สลับธีม + รีเฟรช */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="rc-muted text-sm">{t("subtitle")}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rc-btn"
              onClick={() => chooseTheme(theme === "ink" ? "paper" : "ink")}
              title={theme === "ink" ? t("themeLight") : t("themeDark")}
            >
              {theme === "ink" ? (
                <SunIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <MoonIcon className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {theme === "ink" ? t("themeLight") : t("themeDark")}
              </span>
            </button>
            <button
              type="button"
              className="rc-btn"
              onClick={() => {
                loadStats();
                loadChats();
              }}
            >
              <RefreshCwIcon
                className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </button>
          </div>
        </div>

        {/* แถบสถิติ */}
        <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {tiles.map((c) => (
            <div key={c.label} className="rc-tile">
              <div className="lbl">{c.label}</div>
              <div className="val">{c.value}</div>
            </div>
          ))}
          <div className="rc-tile" style={{ gridColumn: "span 1" }}>
            <div className="lbl">{t("bySource")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(stats?.by_source || []).map((r) => (
                <span key={r.source} className="rc-chip">
                  {srcLabel(r.source)} <b>{fmtNum(r.chats)}</b>
                </span>
              ))}
              {!stats?.by_source?.length && <span className="rc-muted text-xs">-</span>}
            </div>
          </div>
        </div>

        {/* ตัวกรอง */}
        <div className="rc-panel mb-3 p-3">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label className="block">
              <span className="rc-muted mb-1 block text-xs">{t("filterSource")}</span>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setOffset(0);
                }}
                className="min-h-9 w-full px-2 text-sm"
              >
                <option value="">{t("allSources")}</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>
                    {srcLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="rc-muted mb-1 block text-xs">{t("filterUser")}</span>
              <div className="relative">
                <UserIcon className="rc-muted pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" aria-hidden="true" />
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setOffset(0);
                      loadChats();
                    }
                  }}
                  className="min-h-9 w-full pl-7 pr-2 text-sm"
                  placeholder={t("filterUser")}
                />
              </div>
            </label>
            <label className="block">
              <span className="rc-muted mb-1 block text-xs">{t("filterQ")}</span>
              <div className="relative">
                <SearchIcon className="rc-muted pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" aria-hidden="true" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setOffset(0);
                      loadChats();
                    }
                  }}
                  className="min-h-9 w-full pl-7 pr-2 text-sm"
                  placeholder={t("filterQ")}
                />
              </div>
            </label>
            <label className="block">
              <span className="rc-muted mb-1 block text-xs">{t("filterDays")}</span>
              <select
                value={days}
                onChange={(e) => {
                  setDays(Number(e.target.value));
                  setOffset(0);
                }}
                className="min-h-9 w-full px-2 text-sm"
              >
                <option value={1}>{t("day1")}</option>
                <option value={7}>{t("day7")}</option>
                <option value={30}>{t("day30")}</option>
                <option value={90}>{t("day90")}</option>
                <option value={365}>{t("day365")}</option>
              </select>
            </label>
          </div>
        </div>

        {err && (
          <div
            className="mb-3 rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "rgba(180,84,74,0.4)", background: "rgba(180,84,74,0.1)", color: "#d8a09a" }}
          >
            {t("loadFail")}: {err}
          </div>
        )}

        {/* ซ้าย: รายการบทสนทนา · ขวา: อ่านเธรดเต็ม */}
        <div className="rc-grid grid gap-3" style={{ gridTemplateColumns: "minmax(300px, 380px) minmax(0, 1fr)" }}>
          <aside className="rc-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--rc-line)" }}>
              <div className="flex items-center gap-2 text-sm">
                <MessagesSquareIcon className="h-4 w-4" style={{ color: "var(--rc-accent)" }} aria-hidden="true" />
                {t("convList")}
              </div>
              <div className="rc-muted text-xs">
                {loadingList
                  ? t("loading")
                  : total != null
                    ? `${fmtNum(total)} ${t("itemsShown")}`
                    : `${rows.length} ${t("itemsShown")}`}
              </div>
            </div>
            <div className="rc-scroll" style={{ maxHeight: "62vh" }}>
              {rows.map((row) => {
                const active = selected?.id === row.id && selected?.source === row.source;
                return (
                  <button
                    key={`${row.source}:${row.id}`}
                    type="button"
                    onClick={() => pickChat(row)}
                    className={`rc-card ${active ? "is-active" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-sm font-medium">
                        {row.user_name || row.user_email || t("noName")}
                      </div>
                      <span className="rc-srcbadge">{srcLabel(row.source)}</span>
                    </div>
                    {row.user_email && row.user_name && (
                      <div className="rc-muted mt-0.5 truncate text-xs">{row.user_email}</div>
                    )}
                    <div className="rc-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                      <span>
                        {fmtTime(row.started_at, lang)}
                        {row.last_at && row.last_at !== row.started_at ? ` → ${fmtTime(row.last_at, lang)}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquareIcon className="h-3 w-3" aria-hidden="true" />
                        {fmtNum(row.message_count)} {t("msgUnit")}
                      </span>
                      {row.feature && featLabel(row.feature) !== srcLabel(row.source) && (
                        <span>{featLabel(row.feature)}</span>
                      )}
                    </div>
                    {row.preview && (
                      <div className="rc-muted mt-1 text-xs leading-5" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {clip(row.preview, 180)}
                      </div>
                    )}
                  </button>
                );
              })}
              {!rows.length && !loadingList && (
                <div className="px-6 py-10 text-center">
                  <InboxIcon className="rc-muted mx-auto h-8 w-8" aria-hidden="true" />
                  <div className="rc-muted mt-3 text-sm leading-6">{t("emptyList")}</div>
                </div>
              )}
              {loadingList && !rows.length && (
                <div className="rc-muted px-6 py-10 text-center text-sm">{t("loading")}</div>
              )}
            </div>
            {/* แบ่งหน้า */}
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2" style={{ borderColor: "var(--rc-line)" }}>
              <button
                type="button"
                className="rc-btn"
                disabled={offset <= 0 || loadingList}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
                {t("prev")}
              </button>
              <div className="rc-muted text-xs">
                {t("pageOf")} {page}
                {pageMax != null ? ` / ${pageMax}` : ""}
              </div>
              <button
                type="button"
                className="rc-btn"
                disabled={!hasNext || loadingList}
                onClick={() => setOffset(offset + limit)}
              >
                {t("next")}
                <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </aside>

          <section ref={readerRef} className="rc-panel min-w-0 scroll-mt-4 overflow-hidden">
            {selected && (threadChat || thread) ? (
              <div className="flex h-full flex-col">
                <div className="border-b px-4 py-3" style={{ borderColor: "var(--rc-line)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-base font-medium">
                          {threadUserName || threadUserEmail || t("noName")}
                        </span>
                        <span className="rc-srcbadge">{srcLabel(threadChat?.source || selected.source)}</span>
                        {threadFeature && featLabel(threadFeature) !== srcLabel(threadChat?.source || selected.source) && (
                          <span className="rc-muted text-xs">{featLabel(threadFeature)}</span>
                        )}
                      </div>
                      <div className="rc-muted mt-0.5 break-all text-xs">
                        {threadUserEmail || ""}
                      </div>
                      <div className="rc-muted mt-1 text-xs">
                        {t("started")} {fmtDT(threadChat?.started_at, lang)} · {t("lastAt")} {fmtDT(threadChat?.last_at, lang)}
                        {threadChat ? ` · ${fmtNum(threadChat.message_count)} ${t("msgUnit")}` : ""}
                      </div>
                    </div>
                    <button type="button" className="rc-btn" onClick={copyWholeThread} disabled={!thread?.messages.length}>
                      {copied === "__all__" ? (
                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <CopyIcon className="h-4 w-4" aria-hidden="true" />
                      )}
                      {copied === "__all__" ? t("copied") : t("copyAll")}
                    </button>
                  </div>
                </div>

                <div className="rc-scroll flex-1 space-y-3 px-3 py-4 md:px-5" style={{ maxHeight: "70vh", minHeight: "20rem" }}>
                  {loadingThread && (
                    <div className="rc-muted py-8 text-center text-sm">{t("loading")}</div>
                  )}
                  {!loadingThread &&
                    (thread?.messages || []).map((m, i) => {
                      const isUser = m.role === "user";
                      const key = `${selected.id}:${i}`;
                      return (
                        <div key={key} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                          <div className={`rc-bub ${isUser ? "rc-user" : "rc-ai"}`}>{m.content}</div>
                          <div className="rc-msgmeta">
                            {isUser ? (
                              <UserIcon className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <BotIcon className="h-3 w-3" aria-hidden="true" />
                            )}
                            <span>{isUser ? t("userSide") : t("aiSide")}</span>
                            {m.at && <span>{fmtDT(m.at, lang)}</span>}
                            <button type="button" className="rc-copybtn" onClick={() => doCopy(key, m.content)}>
                              {copied === key ? (
                                <CheckIcon className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <CopyIcon className="h-3 w-3" aria-hidden="true" />
                              )}
                              {copied === key ? t("copied") : t("copy")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {!loadingThread && !thread?.messages.length && (
                    <div className="rc-muted py-10 text-center text-sm">{t("threadEmpty")}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
                <UsersIcon className="rc-muted h-8 w-8" aria-hidden="true" />
                <div className="rc-muted text-sm">{loadingList ? t("loading") : t("emptyThread")}</div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
