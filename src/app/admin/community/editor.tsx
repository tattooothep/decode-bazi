"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type LocaleKey = "th" | "en" | "zh" | "cn" | "vi" | "ja" | "ru" | "ko" | "es";
type LocaleMap = Partial<Record<LocaleKey, string>>;
type NewsRow = {
  id: string;
  kind: string;
  title: LocaleMap;
  body: LocaleMap;
  cta_label: LocaleMap;
  cta_url: string | null;
  media_url: string | null;
  video_url: string | null;
  badge: string | null;
  sort: number;
  active: boolean;
  publish_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};
type NewsDraft = {
  id?: string;
  kind: string;
  title: LocaleMap;
  body: LocaleMap;
  ctaLabel: LocaleMap;
  ctaUrl: string;
  mediaUrl: string;
  videoUrl: string;
  badge: string;
  sort: number;
  active: boolean;
  publishAt: string;
  expiresAt: string;
};
type ReportRow = {
  id: string;
  email: string | null;
  category: string;
  message: string;
  page_path: string | null;
  locale: string | null;
  severity: string;
  status: string;
  admin_note: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  assignee_id: string | null;
  assignee_email: string | null;
  unread_count: number;
  last_message_at: string | null;
};
type MessageRow = { id: string; author_type: "user" | "admin" | "system"; author_email: string | null; visibility: "public" | "internal"; body: string; created_at: string };

const LOCALES: { key: LocaleKey; label: string; name: string }[] = [
  { key: "th", label: "TH", name: "ไทย" },
  { key: "en", label: "EN", name: "English" },
  { key: "zh", label: "繁", name: "繁體" },
  { key: "cn", label: "简", name: "简体" },
  { key: "vi", label: "VI", name: "Tiếng Việt" },
  { key: "ja", label: "JA", name: "日本語" },
  { key: "ru", label: "RU", name: "Русский" },
  { key: "ko", label: "KO", name: "한국어" },
  { key: "es", label: "ES", name: "Español" },
];
const STATUSES = ["new", "triaged", "in_progress", "waiting_user", "user_replied", "resolved", "closed"];

function emptyDraft(): NewsDraft {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return {
    kind: "update",
    title: {},
    body: {},
    ctaLabel: {},
    ctaUrl: "",
    mediaUrl: "",
    videoUrl: "",
    badge: "",
    sort: 0,
    active: true,
    publishAt: now,
    expiresAt: "",
  };
}

function asMap(value: unknown): LocaleMap {
  return value && typeof value === "object" ? (value as LocaleMap) : {};
}

function toInputDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function draftFromRow(row: NewsRow): NewsDraft {
  return {
    id: row.id,
    kind: row.kind || "update",
    title: asMap(row.title),
    body: asMap(row.body),
    ctaLabel: asMap(row.cta_label),
    ctaUrl: row.cta_url || "",
    mediaUrl: row.media_url || "",
    videoUrl: row.video_url || "",
    badge: row.badge || "",
    sort: Number(row.sort || 0),
    active: row.active !== false,
    publishAt: toInputDate(row.publish_at),
    expiresAt: toInputDate(row.expires_at),
  };
}

export default function CommunityAdmin({ email }: { email: string }) {
  const [news, setNews] = useState<NewsRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [draft, setDraft] = useState<NewsDraft>(() => emptyDraft());
  const [activeLang, setActiveLang] = useState<LocaleKey>("th");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const selectedLocale = useMemo(() => LOCALES.find((l) => l.key === activeLang) || LOCALES[0], [activeLang]);

  const load = async () => {
    const r = await fetch("/api/admin/community", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      setMsg("โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    setNews(r.news || []);
    setReports(r.reports || []);
    setCurrentAdminId(r.current_admin?.user_id || "");
  };

  useEffect(() => { load(); }, []);

  const openReport = async (id: string) => {
    setSelectedReportId(id);
    const r = await fetch(`/api/admin/community?report_id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setMsg("โหลดบทสนทนาไม่สำเร็จ"); return; }
    setReports(r.reports || []);
    setMessages(r.messages || []);
    setCurrentAdminId(r.current_admin?.user_id || currentAdminId);
    await fetch("/api/admin/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_report_read", id }) }).catch(() => null);
    try { history.replaceState(null, "", `/admin/community?report=${encodeURIComponent(id)}`); } catch {}
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    if (id && /^\d+$/.test(id)) openReport(id);
  }, []);

  const setMap = (field: "title" | "body" | "ctaLabel", value: string) => {
    setDraft((old) => ({ ...old, [field]: { ...old[field], [activeLang]: value } }));
  };

  const saveNews = async () => {
    setBusy(true);
    setMsg("กำลังบันทึกข่าว...");
    const r = await fetch("/api/admin/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_news", ...draft }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setMsg("บันทึกไม่สำเร็จ: " + (r?.error || "error"));
      return;
    }
    setNews(r.news || []);
    setReports(r.reports || []);
    setMsg("บันทึกข่าวแล้ว");
    if (!draft.id) setDraft(emptyDraft());
  };

  const deleteNews = async (id: string) => {
    if (!window.confirm("ลบข่าวนี้?")) return;
    setBusy(true);
    const r = await fetch("/api/admin/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_news", id }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setNews(r.news || []);
      setDraft(emptyDraft());
      setMsg("ลบข่าวแล้ว");
    } else {
      setMsg("ลบไม่สำเร็จ");
    }
  };

  const reportAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!selectedReportId) return;
    setBusy(true);
    const r = await fetch("/api/admin/community", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: selectedReportId, clientMessageId: crypto.randomUUID(), ...extra }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(`ทำรายการไม่สำเร็จ: ${r?.error || "error"}`); return; }
    setReports(r.reports || []);
    setMessages(r.messages || []);
    setReply(""); setInternalNote(""); setMsg("อัปเดต ticket แล้ว");
  };

  return (
    <main className="min-h-screen bg-[#0b0d12] px-5 py-8 text-[#f5f0e8]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="mb-2 font-mono text-xs uppercase tracking-[.18em] text-amber-200/70">Community Console</div>
            <h1 className="font-serif text-3xl">ข่าวสาร / โปรโมชั่น / แจ้งปัญหา</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              จัดข่าวหน้า user แบบ 9 ภาษา และดูรายงานปัญหาที่ส่งจากเมนูอวตารหรือหน้า support
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded border border-white/10 px-3 py-1.5 text-xs text-white/55">{email}</span>
            <Link href="/admin" className="rounded border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:border-amber-300/40 hover:text-amber-100">หลังบ้าน</Link>
          </div>
        </header>

        {msg ? <div className="mb-5 rounded border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{msg}</div> : null}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,.95fr)_minmax(360px,1.05fr)]">
          <div className="rounded-lg border border-white/10 bg-white/[.035] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">ข่าวสารที่เผยแพร่</h2>
                <p className="mt-1 text-xs text-white/45">ใช้แสดงในหน้า /news และเมนูข่าวสาร</p>
              </div>
              <button onClick={() => setDraft(emptyDraft())} className="rounded border border-amber-300/30 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-300/10">ข่าวใหม่</button>
            </div>
            <div className="grid gap-2">
              {news.length ? news.map((row) => (
                <div key={row.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                        <span className="rounded border border-white/10 px-2 py-0.5">{row.kind}</span>
                        <span>{row.active ? "เผยแพร่" : "draft"}</span>
                        <span>sort {row.sort || 0}</span>
                      </div>
                      <div className="mt-2 font-medium">{row.title?.th || row.title?.en || row.title?.zh || "ไม่มีชื่อ"}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-white/55">{row.body?.th || row.body?.en || row.body?.zh || ""}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDraft(draftFromRow(row))} className="rounded border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-amber-300/40">แก้</button>
                      <button onClick={() => deleteNews(row.id)} className="rounded border border-red-300/20 px-3 py-1.5 text-xs text-red-200/80 hover:bg-red-500/10">ลบ</button>
                    </div>
                  </div>
                </div>
              )) : <div className="rounded border border-dashed border-white/15 p-6 text-center text-sm text-white/40">ยังไม่มีข่าว</div>}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[.035] p-4">
            <h2 className="mb-4 text-lg font-medium">{draft.id ? "แก้ข่าว" : "เพิ่มข่าวใหม่"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">ประเภท</span>
                <select value={draft.kind} onChange={(e) => setDraft((o) => ({ ...o, kind: e.target.value }))} className="rounded border border-white/10 bg-black/25 px-3 py-2">
                  <option value="update">Update</option>
                  <option value="promo">Promotion</option>
                  <option value="system">System</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">Badge</span>
                <input value={draft.badge} onChange={(e) => setDraft((o) => ({ ...o, badge: e.target.value }))} className="rounded border border-white/10 bg-black/25 px-3 py-2" placeholder="NEW / JULY / PRO" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">เผยแพร่</span>
                <input type="datetime-local" value={draft.publishAt} onChange={(e) => setDraft((o) => ({ ...o, publishAt: e.target.value }))} className="rounded border border-white/10 bg-black/25 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">หมดอายุ</span>
                <input type="datetime-local" value={draft.expiresAt} onChange={(e) => setDraft((o) => ({ ...o, expiresAt: e.target.value }))} className="rounded border border-white/10 bg-black/25 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">ลำดับ</span>
                <input type="number" value={draft.sort} onChange={(e) => setDraft((o) => ({ ...o, sort: Number(e.target.value || 0) }))} className="rounded border border-white/10 bg-black/25 px-3 py-2" />
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm text-white/70">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((o) => ({ ...o, active: e.target.checked }))} />
                เปิดแสดงหน้าเว็บ
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {LOCALES.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setActiveLang(l.key)}
                  className={`rounded border px-3 py-1.5 text-xs ${activeLang === l.key ? "border-amber-300 bg-amber-300 text-black" : "border-white/10 text-white/60 hover:border-amber-300/35"}`}
                >
                  {l.label} · {l.name}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">หัวข้อ · {selectedLocale.name}</span>
                <input value={draft.title[activeLang] || ""} onChange={(e) => setMap("title", e.target.value)} className="rounded border border-white/10 bg-black/25 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">เนื้อหา · {selectedLocale.name}</span>
                <textarea value={draft.body[activeLang] || ""} onChange={(e) => setMap("body", e.target.value)} rows={6} className="rounded border border-white/10 bg-black/25 px-3 py-2 leading-6" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/55">ข้อความปุ่ม · {selectedLocale.name}</span>
                <input value={draft.ctaLabel[activeLang] || ""} onChange={(e) => setMap("ctaLabel", e.target.value)} className="rounded border border-white/10 bg-black/25 px-3 py-2" placeholder="ดูรายละเอียด" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-white/55">ลิงก์ปุ่ม</span>
                  <input value={draft.ctaUrl} onChange={(e) => setDraft((o) => ({ ...o, ctaUrl: e.target.value }))} className="rounded border border-white/10 bg-black/25 px-3 py-2" placeholder="/pricing" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/55">ภาพประกอบ URL</span>
                  <input value={draft.mediaUrl} onChange={(e) => setDraft((o) => ({ ...o, mediaUrl: e.target.value }))} className="rounded border border-white/10 bg-black/25 px-3 py-2" placeholder="/assets/news/..." />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-white/55">วิดีโอ URL</span>
                  <input value={draft.videoUrl} onChange={(e) => setDraft((o) => ({ ...o, videoUrl: e.target.value }))} className="rounded border border-white/10 bg-black/25 px-3 py-2" placeholder="/assets/video/..." />
                </label>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button disabled={busy} onClick={saveNews} className="rounded border border-amber-300 bg-amber-300 px-5 py-2 text-sm font-semibold text-black disabled:opacity-45">บันทึกข่าว</button>
              <button onClick={() => setDraft(emptyDraft())} className="rounded border border-white/10 px-4 py-2 text-sm text-white/65">ล้างฟอร์ม</button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-white/[.035] p-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Ticket แจ้งปัญหา</h2>
              <p className="mt-1 text-xs text-white/45">รายการล่าสุด 100 รายการจากหน้า support</p>
            </div>
            <button onClick={load} className="rounded border border-white/10 px-3 py-1.5 text-sm text-white/65 hover:border-amber-300/35">รีเฟรช</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,.75fr)_minmax(0,1.25fr)]">
            <div className="grid content-start gap-2 lg:max-h-[720px] lg:overflow-auto lg:pr-1">
              {reports.length ? reports.map((row) => (
                <button key={row.id} type="button" onClick={() => openReport(row.id)} className={`w-full rounded-lg border p-3 text-left ${selectedReportId === row.id ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-black/20 hover:border-white/25"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                      <span>#{row.id}</span><span>{row.category}</span><span>{row.status}</span>
                    </div>
                    {Number(row.unread_count || 0) > 0 ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{row.unread_count}</span> : null}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-5 text-white/75">{row.message}</div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/35"><span>{row.email || "no email"}</span><span>{new Date(row.last_message_at || row.created_at).toLocaleString("th-TH")}</span></div>
                </button>
              )) : <div className="rounded border border-dashed border-white/15 p-6 text-center text-sm text-white/40">ยังไม่มี ticket</div>}
            </div>

            <div className="min-h-[360px] rounded-lg border border-white/10 bg-black/20 p-4">
              {selectedReportId ? (() => {
                const row = reports.find((item) => item.id === selectedReportId);
                if (!row) return <div className="text-sm text-white/40">ไม่พบ ticket</div>;
                return <div>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <div className="text-xs text-white/40">Ticket #{row.id} · {row.email || "no email"}</div>
                      <div className="mt-1 text-sm text-white/75">{row.category} · {row.locale || "n/a"}</div>
                      {row.page_path ? <a href={row.page_path} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-xs text-cyan-200/65">{row.page_path}</a> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy} onClick={() => reportAction("assign_report", { assigneeId: row.assignee_id ? null : currentAdminId })} className="rounded border border-white/10 px-3 py-1.5 text-xs text-white/65">{row.assignee_id ? `ยกเลิกผู้รับผิดชอบ · ${row.assignee_email || "admin"}` : "รับผิดชอบ ticket นี้"}</button>
                      <select value={row.status} onChange={(e) => reportAction("update_report", { status: e.target.value })} className="rounded border border-white/10 bg-black/40 px-3 py-1.5 text-xs">
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid max-h-[390px] gap-2 overflow-auto pr-1">
                    {messages.map((message) => (
                      <div key={message.id} className={`max-w-[88%] rounded-lg border px-3 py-2 ${message.visibility === "internal" ? "mx-auto w-full max-w-full border-violet-300/25 bg-violet-400/10" : message.author_type === "user" ? "ml-auto border-cyan-300/25 bg-cyan-400/10" : "mr-auto border-amber-300/25 bg-amber-300/10"}`}>
                        <div className="mb-1 flex justify-between gap-3 text-[10px] text-white/35"><span>{message.visibility === "internal" ? "Internal note" : message.author_type} · {message.author_email || "system"}</span><span>{new Date(message.created_at).toLocaleString("th-TH")}</span></div>
                        <div className="whitespace-pre-wrap break-words text-sm leading-6 text-white/78">{message.body.startsWith("status:") ? `สถานะ → ${message.body.slice(7)}` : message.body}</div>
                      </div>
                    ))}
                    {!messages.length ? <div className="p-6 text-center text-sm text-white/35">ยังไม่มีข้อความ</div> : null}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="ตอบผู้ใช้" className="w-full rounded border border-amber-300/20 bg-black/30 px-3 py-2 text-sm leading-6" />
                      <button disabled={busy || !reply.trim()} onClick={() => reportAction("reply_report", { message: reply })} className="mt-2 rounded border border-amber-300 bg-amber-300 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">ส่งถึงผู้ใช้</button>
                    </div>
                    <div>
                      <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={4} placeholder="โน้ตภายใน · ผู้ใช้มองไม่เห็น" className="w-full rounded border border-violet-300/20 bg-black/30 px-3 py-2 text-sm leading-6" />
                      <button disabled={busy || !internalNote.trim()} onClick={() => reportAction("add_internal_note", { message: internalNote })} className="mt-2 rounded border border-violet-300/30 px-4 py-2 text-sm text-violet-100 disabled:opacity-40">บันทึกโน้ตภายใน</button>
                    </div>
                  </div>
                  {row.user_agent ? <div className="mt-3 line-clamp-2 text-[11px] text-white/30">{row.user_agent}</div> : null}
                </div>;
              })() : <div className="flex min-h-[330px] items-center justify-center text-sm text-white/35">เลือก ticket เพื่อเปิดบทสนทนา</div>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
