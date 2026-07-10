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
};

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
const STATUSES = ["new", "triaged", "in_progress", "resolved", "closed"];

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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const selectedLocale = useMemo(() => LOCALES.find((l) => l.key === activeLang) || LOCALES[0], [activeLang]);

  const load = async () => {
    const r = await fetch("/api/admin/community", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      setMsg("โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    setNews(r.news || []);
    setReports(r.reports || []);
    const nextNotes: Record<string, string> = {};
    for (const row of r.reports || []) nextNotes[row.id] = row.admin_note || "";
    setNotes(nextNotes);
  };

  useEffect(() => { load(); }, []);

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

  const updateReport = async (report: ReportRow, status = report.status) => {
    setBusy(true);
    const r = await fetch("/api/admin/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_report", id: report.id, status, adminNote: notes[report.id] || "" }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setReports(r.reports || []);
      setMsg("อัปเดต ticket แล้ว");
    } else {
      setMsg("อัปเดต ticket ไม่สำเร็จ");
    }
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
          <div className="grid gap-3">
            {reports.length ? reports.map((row) => (
              <div key={row.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/45">
                      <span className="rounded border border-white/10 px-2 py-0.5">#{row.id}</span>
                      <span>{row.category}</span>
                      <span>{row.locale || "n/a"}</span>
                      <span>{new Date(row.created_at).toLocaleString("th-TH")}</span>
                      <span>{row.email || "no email"}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-white/78">{row.message}</p>
                    {row.page_path ? <div className="mt-2 break-all font-mono text-xs text-cyan-100/55">{row.page_path}</div> : null}
                    {row.user_agent ? <div className="mt-1 line-clamp-1 text-xs text-white/35">{row.user_agent}</div> : null}
                  </div>
                  <div className="grid gap-2">
                    <select value={row.status} onChange={(e) => updateReport(row, e.target.value)} className="rounded border border-white/10 bg-black/25 px-3 py-2 text-sm">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <textarea value={notes[row.id] || ""} onChange={(e) => setNotes((o) => ({ ...o, [row.id]: e.target.value }))} rows={4} className="rounded border border-white/10 bg-black/25 px-3 py-2 text-sm leading-5" placeholder="admin note" />
                    <button disabled={busy} onClick={() => updateReport(row)} className="rounded border border-white/10 px-3 py-2 text-sm text-white/70 hover:border-amber-300/35 disabled:opacity-45">บันทึก note</button>
                  </div>
                </div>
              </div>
            )) : <div className="rounded border border-dashed border-white/15 p-6 text-center text-sm text-white/40">ยังไม่มี ticket</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
