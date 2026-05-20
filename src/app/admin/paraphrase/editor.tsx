"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

/* ─────────── types mirrored from src/lib/paraphrase-types.ts ─────────── */
type FieldKind = "varchar" | "text" | "jsonb";
type ParaphraseField = {
  key: string;
  label: string;
  kind: FieldKind;
  trilingual?: boolean;
  classical?: boolean;
  rows?: number;
};
type ParaphraseDef = {
  type: string;
  table: string;
  section: string;
  pkColumn: string;
  listColumns: string[];
  fields: ParaphraseField[];
  fixedColumns?: { key: string; label: string }[];
};
type TypeListItem = {
  type: string;
  table: string;
  section: string;
  fields: number;
};

type AuditEntry = {
  id: number;
  table_name: string;
  row_id: number;
  field_name: string;
  lang: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
  source: string;
  type_info?: { type: string; section: string } | null;
};

const LANGS = [
  { code: "th", label: "ไทย", flag: "🇹🇭" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
] as const;
type Lang = (typeof LANGS)[number]["code"];

/* ─────────── Editor ─────────── */
export default function ParaphraseEditor({
  session,
}: {
  session: { email: string; role: string };
}) {
  const [types, setTypes] = useState<TypeListItem[]>([]);
  const [activeType, setActiveType] = useState<string>("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [singleRow, setSingleRow] = useState<Record<string, unknown> | null>(null);
  const [activeDef, setActiveDef] = useState<ParaphraseDef | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [translateBusy, setTranslateBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<Record<string, { scanned: number; updated: number; fields_changed: number; errors: string[] }> | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditFilter, setAuditFilter] = useState<{ type?: string; lang?: string; source?: string; user?: string; field?: string; since?: string }>({});
  const [auditData, setAuditData] = useState<{ total: number; entries: AuditEntry[]; summary: { sources: { source: string; c: number }[]; tables: { table_name: string; c: number; type_info: { type: string; section: string } | null }[]; users: { changed_by: string; c: number }[] } } | null>(null);
  const [auditExpanded, setAuditExpanded] = useState<number | null>(null);

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("hk-admin-theme")) || "dark";
    setTheme(stored === "light" ? "light" : "dark");
  }, []);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
      localStorage.setItem("hk-admin-theme", theme);
    }
  }, [theme]);

  /* fetch types list */
  useEffect(() => {
    fetch("/api/admin/paraphrase/types")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setTypes(j.types);
          if (j.types.length && !activeType) setActiveType(j.types[0].type);
        }
      });
  }, []);

  /* fetch rows of active type */
  useEffect(() => {
    if (!activeType) return;
    setLoading(true);
    setSelectedId(null);
    setSingleRow(null);
    fetch(`/api/admin/paraphrase/${activeType}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setRows(j.rows || []);
        }
      })
      .finally(() => setLoading(false));
  }, [activeType]);

  /* fetch single row when selected */
  useEffect(() => {
    if (!selectedId || !activeType) return;
    setLoading(true);
    fetch(`/api/admin/paraphrase/${activeType}/${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setActiveDef(j.def);
          setSingleRow(j.row);
          setDraft({ ...j.row });
        }
      })
      .finally(() => setLoading(false));
  }, [selectedId, activeType]);

  const filteredRows = useMemo(() => {
    if (!filter.trim()) return rows;
    const f = filter.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(f))
    );
  }, [rows, filter]);

  const handleSave = useCallback(async () => {
    if (!singleRow || !activeDef || !selectedId) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    for (const f of activeDef.fields) {
      if (f.trilingual) {
        for (const lang of ["en", "th", "zh"]) {
          const k = `${f.key}_${lang}`;
          if (draft[k] !== singleRow[k]) updates[k] = draft[k];
        }
      } else {
        if (draft[f.key] !== singleRow[f.key]) updates[f.key] = draft[f.key];
      }
    }
    if (Object.keys(updates).length === 0) {
      setToast({ ok: true, msg: "ไม่มีอะไรเปลี่ยน" });
      setSaving(false);
      return;
    }
    const r = await fetch(`/api/admin/paraphrase/${activeType}/${encodeURIComponent(selectedId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, source: "manual" }),
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) {
      setSingleRow({ ...singleRow, ...updates });
      setToast({ ok: true, msg: `บันทึก ${Object.keys(updates).length} ฟิลด์` });
    } else {
      setToast({ ok: false, msg: `ผิดพลาด: ${j.error || "?"}` });
    }
    setTimeout(() => setToast(null), 2500);
  }, [singleRow, activeDef, selectedId, draft, activeType]);

  const fetchAudit = useCallback(async (filter?: typeof auditFilter) => {
    setAuditBusy(true);
    const f = filter ?? auditFilter;
    const params = new URLSearchParams();
    if (f.type) params.set("type", f.type);
    if (f.lang) params.set("lang", f.lang);
    if (f.source) params.set("source", f.source);
    if (f.user) params.set("user", f.user);
    if (f.field) params.set("field", f.field);
    if (f.since) params.set("since", f.since);
    params.set("limit", "300");
    try {
      const r = await fetch(`/api/admin/paraphrase/audit?${params.toString()}`);
      const j = await r.json();
      if (j.ok) setAuditData(j);
      else setToast({ ok: false, msg: `Audit failed: ${j.error || "?"}` });
    } catch (e) {
      setToast({ ok: false, msg: `Audit error: ${String(e).slice(0, 100)}` });
    } finally {
      setAuditBusy(false);
    }
  }, [auditFilter]);

  const openAudit = useCallback((presetType?: string) => {
    const filter = presetType ? { type: presetType } : {};
    setAuditFilter(filter);
    setAuditOpen(true);
    setAuditExpanded(null);
    fetchAudit(filter);
  }, [fetchAudit]);

  const handleImport = useCallback(async (file: File) => {
    setImportBusy(true);
    setImportReport(null);
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        setToast({ ok: false, msg: "ไฟล์ JSON ผิดรูปแบบ · parse ไม่ได้" });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const r = await fetch("/api/admin/paraphrase/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(json as object), source: "import-json" }),
      });
      const j = await r.json();
      if (j.ok) {
        setImportReport(j.by_type);
        const totalUpd = Object.values(j.by_type as Record<string, { updated: number }>).reduce(
          (s, x) => s + x.updated, 0
        );
        const totalFields = Object.values(j.by_type as Record<string, { fields_changed: number }>).reduce(
          (s, x) => s + x.fields_changed, 0
        );
        setToast({ ok: true, msg: `Import สำเร็จ · ${totalUpd} แถว · ${totalFields} ฟิลด์` });
        // Refresh current type list
        if (activeType) {
          const rr = await fetch(`/api/admin/paraphrase/${activeType}`);
          const jj = await rr.json();
          if (jj.ok) setRows(jj.rows || []);
        }
        // Re-fetch single row if selected
        if (selectedId) {
          const sr = await fetch(`/api/admin/paraphrase/${activeType}/${encodeURIComponent(selectedId)}`);
          const sj = await sr.json();
          if (sj.ok) {
            setSingleRow(sj.row);
            setDraft({ ...sj.row });
          }
        }
      } else {
        setToast({ ok: false, msg: `Import ผิดพลาด: ${j.error || "?"}` });
      }
    } catch (e) {
      setToast({ ok: false, msg: `Import error: ${String(e).slice(0, 100)}` });
    } finally {
      setImportBusy(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [activeType, selectedId]);

  const handleTranslate = useCallback(
    async (fieldKey: string, fromLang: Lang, toLang: Lang) => {
      const src = String(draft[`${fieldKey}_${fromLang}`] || "");
      if (!src.trim()) {
        setToast({ ok: false, msg: `ไม่มีข้อความ ${fromLang} ให้แปล` });
        setTimeout(() => setToast(null), 2000);
        return;
      }
      const ctxKey = `${fieldKey}_${toLang}__busy`;
      setTranslateBusy(ctxKey);
      const r = await fetch("/api/admin/paraphrase/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: src,
          sourceLang: fromLang,
          targetLang: toLang,
          context: `${activeDef?.section || ""} · field=${fieldKey}`,
        }),
      });
      const j = await r.json();
      setTranslateBusy(null);
      if (j.ok && j.translated) {
        setDraft((d) => ({ ...d, [`${fieldKey}_${toLang}`]: j.translated }));
        setToast({ ok: true, msg: `แปลแล้ว · ${fromLang}→${toLang}` });
      } else {
        setToast({ ok: false, msg: j.error || "translate failed" });
      }
      setTimeout(() => setToast(null), 2500);
    },
    [draft, activeDef]
  );

  const currentType = types.find((t) => t.type === activeType);

  /* ─────── render ─────── */
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="border-b border-foreground/10 bg-card/50 backdrop-blur px-4 py-3 flex items-center gap-4 sticky top-0 z-30">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-xl tracking-wide">Admin · Paraphrase</span>
          <span className="zh text-base text-[var(--cinnabar)]">譯</span>
        </div>
        <span className="text-xs text-foreground/50">
          39 หมวด · TH/EN/ZH · เข้าระบบเป็น <strong>{session.email}</strong>
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
          title="สลับ light/dark"
        >
          {theme === "dark" ? "☾ Dark" : "☀ Light"}
        </button>
        <button
          onClick={() => openAudit(activeType || undefined)}
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
          title={activeType ? `ดูประวัติแก้ไขหมวด ${activeType}` : "ดูประวัติแก้ไขทั้งหมด"}
        >
          📋 Activity {activeType ? "หมวดนี้" : ""}
        </button>
        <a
          href="/admin/engine"
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
          title="ปรับ weight / multiplier engine"
        >
          ⚙ Engine
        </a>
        <a
          href="/admin/formulas"
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
          title="สูตรศาสตร์ทั้งหมด · ซินแสตรวจ"
        >
          📐 Formulas
        </a>
        <a
          href={activeType ? `/api/admin/paraphrase/export?type=${activeType}` : "/api/admin/paraphrase/export"}
          target="_blank"
          rel="noreferrer"
          download
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
          title={activeType ? `Export หมวด ${activeType}` : "Export ทุกหมวด"}
        >
          📥 Export {activeType ? "หมวดนี้" : "ทั้งหมด"}
        </a>
        <label
          className={`px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded cursor-pointer ${importBusy ? "opacity-50 pointer-events-none" : ""}`}
          title="Import JSON · format เดียวกับ Export · จะ update ตาม id"
        >
          {importBusy ? "⏳ กำลัง Import …" : "📤 Import JSON"}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={importBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (confirm(`Import ไฟล์ "${f.name}" (${(f.size / 1024).toFixed(1)} KB)?\nจะอัพเดทแถวที่ id ตรงกัน · ฟิลด์ที่เปลี่ยนจะถูกบันทึกใน audit log`)) {
                  handleImport(f);
                }
                e.target.value = "";
              }
            }}
          />
        </label>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-64 border-r border-foreground/10 bg-card/30 overflow-y-auto p-2 space-y-1 shrink-0">
          {types.length === 0 ? (
            <div className="text-xs text-foreground/50 p-2">กำลังโหลดหมวด …</div>
          ) : (
            types.map((t) => (
              <button
                key={t.type}
                onClick={() => setActiveType(t.type)}
                className={`w-full text-left px-3 py-2 text-sm border ${
                  activeType === t.type
                    ? "border-[var(--cinnabar)] bg-foreground/5"
                    : "border-transparent hover:bg-foreground/5"
                }`}
              >
                <div className="font-medium leading-tight">{t.section}</div>
                <div className="text-[10px] text-foreground/50 mt-0.5">
                  {t.table} · {t.fields} fields
                </div>
              </button>
            ))
          )}
        </aside>

        {/* Middle: rows list */}
        <section className="w-80 border-r border-foreground/10 overflow-y-auto shrink-0">
          <div className="sticky top-0 bg-background/95 backdrop-blur p-3 border-b border-foreground/10">
            <input
              placeholder="ค้นหา … (search)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-foreground/5 border border-foreground/10 rounded outline-none focus:border-[var(--cinnabar)]"
            />
            <div className="text-[10px] text-foreground/50 mt-1">
              {filteredRows.length} / {rows.length} แถว
            </div>
          </div>
          {loading && !singleRow ? (
            <div className="p-4 text-sm text-foreground/50">กำลังโหลด …</div>
          ) : (
            filteredRows.map((r) => {
              const id = String(
                r[currentType?.type === "star_reading" ? "star_id" : (activeDef?.pkColumn || "id")] ?? ""
              );
              const realId =
                activeType === "star_reading"
                  ? `${r.star_id}__${r.pillar_position}`
                  : id;
              return (
                <button
                  key={realId}
                  onClick={() => setSelectedId(realId)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-foreground/5 hover:bg-foreground/5 ${
                    selectedId === realId ? "bg-foreground/10" : ""
                  }`}
                >
                  <div className="font-mono text-[10px] text-foreground/40">#{realId}</div>
                  <div className="font-medium mt-0.5">
                    {String(r[Object.keys(r).find((k) => k.endsWith("_th")) || Object.keys(r)[2]] || "—")}
                  </div>
                  <div className="text-[10px] text-foreground/50 truncate">
                    {String(r[Object.keys(r).find((k) => k.endsWith("_en")) || ""] || "")}
                  </div>
                </button>
              );
            })
          )}
        </section>

        {/* Right: editor */}
        <main className="flex-1 overflow-y-auto p-4">
          {!singleRow || !activeDef ? (
            <div className="text-sm text-foreground/50 mt-8 text-center">
              ← เลือกหมวดและรายการทางซ้ายเพื่อแก้ไข
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-5">
              {/* Header */}
              <div className="flex items-start gap-3 pb-3 border-b border-foreground/10">
                <div className="flex-1">
                  <div className="text-xs text-foreground/50">{activeDef.section}</div>
                  <h2 className="font-serif text-2xl mt-1">
                    #{selectedId} · {String(singleRow[
                      Object.keys(singleRow).find((k) => k.endsWith("_th")) || "id"
                    ] || "")}
                  </h2>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[var(--cinnabar)] text-background hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "กำลังบันทึก …" : "💾 บันทึก"}
                </button>
              </div>

              {/* Fixed columns (read-only) */}
              {activeDef.fixedColumns && activeDef.fixedColumns.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-foreground/5 border border-foreground/10 text-xs">
                  {activeDef.fixedColumns.map((f) => (
                    <div key={f.key}>
                      <div className="text-foreground/50">{f.label}</div>
                      <div className="font-mono mt-0.5">{String(singleRow[f.key] ?? "—")}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Fields */}
              {activeDef.fields.map((f) => (
                <FieldBlock
                  key={f.key}
                  field={f}
                  draft={draft}
                  setDraft={setDraft}
                  onTranslate={handleTranslate}
                  translateBusy={translateBusy}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Activity Log modal */}
      {auditOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-stretch justify-end"
          onClick={() => setAuditOpen(false)}
        >
          <div
            className="bg-background border-l border-foreground/15 w-full max-w-4xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-foreground/10 p-4 flex items-center gap-3">
              <h3 className="font-serif text-xl">📋 Activity Log</h3>
              <span className="text-xs text-foreground/50">
                {auditData ? `${auditData.total.toLocaleString()} กิจกรรมทั้งหมด` : ""}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setAuditOpen(false)}
                className="text-foreground/50 hover:text-foreground text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Filters */}
            <div className="p-3 border-b border-foreground/10 bg-card/30 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                <select
                  value={auditFilter.type || ""}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, type: e.target.value || undefined }))}
                  className="px-2 py-1.5 bg-foreground/5 border border-foreground/10 rounded"
                >
                  <option value="">ทุกหมวด</option>
                  {types.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.section.slice(0, 30)}
                    </option>
                  ))}
                </select>
                <select
                  value={auditFilter.lang || ""}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, lang: e.target.value || undefined }))}
                  className="px-2 py-1.5 bg-foreground/5 border border-foreground/10 rounded"
                >
                  <option value="">ทุกภาษา</option>
                  <option value="th">ไทย</option>
                  <option value="en">EN</option>
                  <option value="zh">中文</option>
                </select>
                <select
                  value={auditFilter.source || ""}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, source: e.target.value || undefined }))}
                  className="px-2 py-1.5 bg-foreground/5 border border-foreground/10 rounded"
                >
                  <option value="">ทุก source</option>
                  <option value="manual">manual (UI)</option>
                  <option value="import-json">import-json</option>
                  <option value="translate-ai">translate-ai</option>
                  <option value="smoke-test">smoke-test</option>
                  <option value="smoke-test-groupB">smoke-test-groupB</option>
                </select>
                <input
                  type="text"
                  placeholder="user email …"
                  value={auditFilter.user || ""}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, user: e.target.value || undefined }))}
                  className="px-2 py-1.5 bg-foreground/5 border border-foreground/10 rounded"
                />
                <input
                  type="text"
                  placeholder="field name …"
                  value={auditFilter.field || ""}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, field: e.target.value || undefined }))}
                  className="px-2 py-1.5 bg-foreground/5 border border-foreground/10 rounded"
                />
                <input
                  type="date"
                  value={auditFilter.since || ""}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, since: e.target.value || undefined }))}
                  className="px-2 py-1.5 bg-foreground/5 border border-foreground/10 rounded"
                  title="from date"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchAudit()}
                  disabled={auditBusy}
                  className="px-3 py-1.5 text-xs bg-[var(--cinnabar)] text-background hover:opacity-90 disabled:opacity-50 rounded"
                >
                  {auditBusy ? "กำลังโหลด …" : "🔍 Apply filter"}
                </button>
                <button
                  onClick={() => {
                    setAuditFilter({});
                    fetchAudit({});
                  }}
                  className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
                >
                  ล้าง filter
                </button>
              </div>
            </div>

            {/* Summary chips */}
            {auditData && (
              <div className="p-3 border-b border-foreground/10 grid md:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-foreground/50 mb-1 text-[10px] uppercase tracking-wide">Top sources</div>
                  <div className="flex flex-wrap gap-1">
                    {auditData.summary.sources.slice(0, 6).map((s) => (
                      <button
                        key={s.source}
                        onClick={() => {
                          setAuditFilter((f) => ({ ...f, source: s.source }));
                          fetchAudit({ ...auditFilter, source: s.source });
                        }}
                        className="px-2 py-0.5 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10"
                      >
                        {s.source} <span className="text-foreground/50">{s.c}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-foreground/50 mb-1 text-[10px] uppercase tracking-wide">Top tables</div>
                  <div className="flex flex-wrap gap-1">
                    {auditData.summary.tables.slice(0, 6).map((t) => (
                      <button
                        key={t.table_name}
                        onClick={() => {
                          const slug = t.type_info?.type;
                          if (slug) {
                            setAuditFilter((f) => ({ ...f, type: slug }));
                            fetchAudit({ ...auditFilter, type: slug });
                          }
                        }}
                        className="px-2 py-0.5 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10"
                      >
                        {t.type_info?.type || t.table_name} <span className="text-foreground/50">{t.c}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-foreground/50 mb-1 text-[10px] uppercase tracking-wide">Top users</div>
                  <div className="flex flex-wrap gap-1">
                    {auditData.summary.users.slice(0, 6).map((u) => (
                      <button
                        key={u.changed_by}
                        onClick={() => {
                          setAuditFilter((f) => ({ ...f, user: u.changed_by }));
                          fetchAudit({ ...auditFilter, user: u.changed_by });
                        }}
                        className="px-2 py-0.5 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10"
                      >
                        {u.changed_by} <span className="text-foreground/50">{u.c}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Entries list */}
            <div className="flex-1 overflow-y-auto">
              {!auditData ? (
                <div className="p-6 text-sm text-foreground/50 text-center">กำลังโหลด …</div>
              ) : auditData.entries.length === 0 ? (
                <div className="p-6 text-sm text-foreground/50 text-center">ไม่มีกิจกรรมตาม filter นี้</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b border-foreground/10">
                    <tr className="text-left text-foreground/55">
                      <th className="p-2 w-32">เวลา</th>
                      <th className="p-2">หมวด · ฟิลด์</th>
                      <th className="p-2 w-12">ภาษา</th>
                      <th className="p-2 w-32">ผู้แก้</th>
                      <th className="p-2 w-24">source</th>
                      <th className="p-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.entries.map((e) => (
                      <FragmentRow
                        key={e.id}
                        e={e}
                        expanded={auditExpanded === e.id}
                        onToggle={() => setAuditExpanded((x) => (x === e.id ? null : e.id))}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border-t border-foreground/10 p-2 text-[10px] text-foreground/50 text-center">
              💡 audit ถูกบันทึกทุกครั้งที่กด 💾 บันทึก หรือ Import JSON · ค้นย้อนหลังได้ตลอด
            </div>
          </div>
        </div>
      )}

      {/* Import report modal */}
      {importReport && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setImportReport(null)}
        >
          <div
            className="bg-background border border-foreground/15 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-xl">📤 Import Report</h3>
              <button
                onClick={() => setImportReport(null)}
                className="text-foreground/50 hover:text-foreground text-xl"
              >
                ✕
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-foreground/10 text-left text-foreground/55">
                  <th className="py-2">Type</th>
                  <th>Scanned</th>
                  <th>Updated</th>
                  <th>Fields</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(importReport).map(([t, r]) => (
                  <tr key={t} className="border-b border-foreground/5">
                    <td className="py-2 font-mono">{t}</td>
                    <td className="text-foreground/70">{r.scanned}</td>
                    <td className={r.updated > 0 ? "text-emerald-500 font-medium" : "text-foreground/40"}>
                      {r.updated}
                    </td>
                    <td className="text-foreground/70">{r.fields_changed}</td>
                    <td className={r.errors.length > 0 ? "text-rose-500" : "text-foreground/40"}>
                      {r.errors.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.values(importReport).some((r) => r.errors.length > 0) && (
              <div className="mt-4 border-t border-foreground/10 pt-3">
                <div className="text-xs text-rose-500 font-medium mb-2">Errors:</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Object.entries(importReport).map(([t, r]) =>
                    r.errors.map((err, i) => (
                      <div key={`${t}-${i}`} className="text-[11px] font-mono bg-rose-500/10 p-2 border border-rose-500/20">
                        <span className="text-rose-500/70">[{t}]</span> {err}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 text-[10px] text-foreground/50">
              💡 ทุกฟิลด์ที่เปลี่ยนถูกบันทึกใน <code>audit_paraphrase_log</code> · ตรวจประวัติย้อนหลังได้
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 border text-sm z-50 ${
            toast.ok ? "border-emerald-500 bg-emerald-500/10" : "border-rose-500 bg-rose-500/10"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ─────── Audit log row (collapsible diff) ─────── */
function FragmentRow({ e, expanded, onToggle }: { e: AuditEntry; expanded: boolean; onToggle: () => void }) {
  const langChip = e.lang
    ? e.lang === "th"
      ? "🇹🇭"
      : e.lang === "en"
        ? "🇬🇧"
        : e.lang === "zh"
          ? "🇨🇳"
          : "—"
    : "—";
  const dt = new Date(e.changed_at);
  const dtStr = `${dt.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" })} ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const typeShort = e.type_info?.type || e.table_name.replace("ref_", "");
  return (
    <>
      <tr className="border-b border-foreground/5 hover:bg-foreground/5 cursor-pointer" onClick={onToggle}>
        <td className="p-2 font-mono text-[11px] text-foreground/70">{dtStr}</td>
        <td className="p-2">
          <div className="font-medium">{typeShort} <span className="text-foreground/40">#{e.row_id}</span></div>
          <div className="text-[10px] text-foreground/55 font-mono">{e.field_name}</div>
        </td>
        <td className="p-2 text-center">{langChip}</td>
        <td className="p-2 text-[11px] text-foreground/70 truncate">{e.changed_by}</td>
        <td className="p-2 text-[10px] text-foreground/55 font-mono">{e.source}</td>
        <td className="p-2 text-center text-foreground/40">{expanded ? "▾" : "▸"}</td>
      </tr>
      {expanded && (
        <tr className="bg-foreground/[0.03] border-b border-foreground/10">
          <td colSpan={6} className="p-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-rose-500 uppercase tracking-wider mb-1">Old</div>
                <pre className="text-[11px] whitespace-pre-wrap break-words bg-rose-500/5 border border-rose-500/15 p-2 max-h-40 overflow-y-auto">
{e.old_value ?? <span className="italic text-foreground/40">∅ (NULL)</span>}
                </pre>
              </div>
              <div>
                <div className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1">New</div>
                <pre className="text-[11px] whitespace-pre-wrap break-words bg-emerald-500/5 border border-emerald-500/15 p-2 max-h-40 overflow-y-auto">
{e.new_value ?? <span className="italic text-foreground/40">∅ (NULL)</span>}
                </pre>
              </div>
            </div>
            <div className="text-[10px] text-foreground/50 mt-2 font-mono">
              audit_id={e.id} · table={e.table_name}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─────── FieldBlock: 3-col TH/EN/ZH editor for one field ─────── */
function FieldBlock({
  field,
  draft,
  setDraft,
  onTranslate,
  translateBusy,
}: {
  field: ParaphraseField;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onTranslate: (k: string, from: Lang, to: Lang) => void;
  translateBusy: string | null;
}) {
  if (!field.trilingual) {
    return (
      <div>
        <label className="text-sm font-medium block mb-1">{field.label}</label>
        <Input
          value={draft[field.key]}
          kind={field.kind}
          rows={field.rows}
          onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium block">{field.label}</label>
      <div className="grid md:grid-cols-3 gap-3">
        {LANGS.map((L) => {
          const k = `${field.key}_${L.code}`;
          const busyKey = `${field.key}_${L.code}__busy`;
          const otherLangs = LANGS.filter((x) => x.code !== L.code);
          return (
            <div key={L.code} className="border border-foreground/10 bg-card/40 p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">
                  {L.flag} {L.label}
                </span>
                <div className="flex gap-1">
                  {otherLangs.map((o) => (
                    <button
                      key={o.code}
                      onClick={() => onTranslate(field.key, o.code as Lang, L.code as Lang)}
                      disabled={translateBusy === busyKey}
                      title={`AI translate from ${o.label}`}
                      className="text-[10px] px-1.5 py-0.5 border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
                    >
                      {translateBusy === busyKey ? "…" : `← ${o.code.toUpperCase()}`}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                value={draft[k]}
                kind={field.kind}
                rows={field.rows}
                onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────── input control supporting varchar/text/jsonb ─────── */
function Input({
  value,
  kind,
  rows,
  onChange,
}: {
  value: unknown;
  kind: FieldKind;
  rows?: number;
  onChange: (v: unknown) => void;
}) {
  if (kind === "jsonb") {
    const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return (
      <textarea
        value={text}
        rows={rows || 5}
        onChange={(e) => {
          const raw = e.target.value;
          try {
            onChange(JSON.parse(raw));
          } catch {
            onChange(raw);
          }
        }}
        placeholder='["..."] หรือ {...} (JSON)'
        className="w-full px-2 py-1.5 text-xs font-mono bg-background border border-foreground/10 rounded outline-none focus:border-[var(--cinnabar)] resize-y"
      />
    );
  }
  if (kind === "text") {
    return (
      <textarea
        value={String(value ?? "")}
        rows={rows || 4}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm bg-background border border-foreground/10 rounded outline-none focus:border-[var(--cinnabar)] resize-y leading-relaxed"
      />
    );
  }
  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 text-sm bg-background border border-foreground/10 rounded outline-none focus:border-[var(--cinnabar)]"
    />
  );
}
