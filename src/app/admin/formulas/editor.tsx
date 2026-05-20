"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: number;
  code: string;
  module: string;
  category: string | null;
  classical_source: string | null;
  title_en: string | null;
  title_th: string | null;
  title_zh: string | null;
  summary_en: string | null;
  summary_th: string | null;
  summary_zh: string | null;
  steps_en: string | null;
  steps_th: string | null;
  steps_zh: string | null;
  pseudo_code: string | null;
  math_formula: string | null;
  references_en: string | null;
  references_th: string | null;
  references_zh: string | null;
  inputs: unknown[] | null;
  outputs: unknown[] | null;
  related_configs: unknown[] | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  status: string;
  updated_at: string;
};

export default function FormulasAdmin({ session }: { session: { email: string } }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [modules, setModules] = useState<{ module: string; c: number }[]>([]);
  const [moduleFilter, setModuleFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [current, setCurrent] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [importBusy, setImportBusy] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState("");

  useEffect(() => {
    const t = (typeof window !== "undefined" && (localStorage.getItem("hk-admin-theme") as "light" | "dark")) || "dark";
    setTheme(t === "light" ? "light" : "dark");
  }, []);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
      localStorage.setItem("hk-admin-theme", theme);
    }
  }, [theme]);

  const fetchList = useCallback(async () => {
    const sp = new URLSearchParams();
    if (moduleFilter) sp.set("module", moduleFilter);
    const r = await fetch(`/api/admin/formulas?${sp.toString()}`);
    const j = await r.json();
    if (j.ok) { setRows(j.rows); setModules(j.modules); }
  }, [moduleFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!selectedId) { setCurrent(null); setDraft({}); return; }
    fetch(`/api/admin/formulas/${selectedId}`).then(r=>r.json()).then(j => {
      if (j.ok) { setCurrent(j.row); setDraft({}); setVerifyNotes(j.row.verification_notes || ""); }
    });
  }, [selectedId]);

  const handleSave = useCallback(async () => {
    if (!current) return;
    if (Object.keys(draft).length === 0) { setToast({ok:true,msg:"ไม่มีอะไรเปลี่ยน"}); setTimeout(()=>setToast(null),1500); return; }
    setBusy(true);
    const r = await fetch(`/api/admin/formulas/${current.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, source: "manual" }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) {
      setToast({ ok: true, msg: j.unchanged ? "ไม่มีการเปลี่ยน" : `บันทึก ${j.fields?.length || 0} ฟิลด์` });
      setSelectedId((id) => id); // trigger re-fetch
      fetchList();
      const rf = await fetch(`/api/admin/formulas/${current.id}`).then(x=>x.json());
      if (rf.ok) setCurrent(rf.row);
      setDraft({});
    } else setToast({ ok: false, msg: j.error || "ผิดพลาด" });
    setTimeout(()=>setToast(null),2500);
  }, [current, draft, fetchList]);

  const handleStatus = useCallback(async (action: "verify"|"dispute"|"draft") => {
    if (!current) return;
    setBusy(true);
    const r = await fetch(`/api/admin/formulas/${current.id}?action=${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: verifyNotes }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) {
      setToast({ ok: true, msg: `สถานะ → ${j.status}` });
      const rf = await fetch(`/api/admin/formulas/${current.id}`).then(x=>x.json());
      if (rf.ok) setCurrent(rf.row);
      fetchList();
    } else setToast({ ok: false, msg: j.error || "ผิดพลาด" });
    setTimeout(()=>setToast(null),2500);
  }, [current, verifyNotes, fetchList]);

  const handleImport = useCallback(async (file: File) => {
    setImportBusy(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const rows = json.rows || [];
      const r = await fetch("/api/admin/formulas/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, source: "import-json" }),
      });
      const j = await r.json();
      if (j.ok) { setToast({ ok: true, msg: `scanned ${j.scanned} · updated ${j.updated}` }); fetchList(); }
      else setToast({ ok: false, msg: j.error || "import failed" });
    } catch (e) { setToast({ ok: false, msg: String(e).slice(0, 100) }); }
    finally { setImportBusy(false); setTimeout(()=>setToast(null),3000); }
  }, [fetchList]);

  type Lang = "th" | "en" | "zh";
  const editField = (key: keyof Row, label: string, kind: "input"|"textarea"|"jsonbArr" = "input") => {
    const v = draft[key] !== undefined ? (draft[key] as unknown) : (current?.[key] as unknown);
    if (kind === "jsonbArr") {
      const text = v == null ? "" : Array.isArray(v) ? JSON.stringify(v) : String(v);
      return (
        <div>
          <label className="text-xs font-medium">{label}</label>
          <input type="text" value={text} onChange={(e)=>{
            try { setDraft((d)=>({...d, [key]: JSON.parse(e.target.value)})); }
            catch { setDraft((d)=>({...d, [key]: e.target.value as unknown})); }
          }} className="w-full px-2 py-1 mt-1 text-xs font-mono bg-background border border-foreground/15 outline-none focus:border-[var(--cinnabar)]" />
        </div>
      );
    }
    const Comp = kind === "textarea" ? "textarea" : "input";
    return (
      <div>
        <label className="text-xs font-medium">{label}</label>
        <Comp
          {...(kind==="textarea"?{rows:4}:{type:"text"})}
          value={String(v ?? "")}
          onChange={(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setDraft((d)=>({...d, [key]: e.target.value}))}
          className="w-full px-2 py-1 mt-1 text-sm bg-background border border-foreground/15 outline-none focus:border-[var(--cinnabar)] leading-relaxed"
        />
      </div>
    );
  };
  const trilingual = (base: string, label: string, kind: "input"|"textarea" = "textarea") => (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="grid md:grid-cols-3 gap-2">
        {(["th","en","zh"] as Lang[]).map((L) => (
          <div key={L} className="border border-foreground/10 p-2 bg-card/30">
            <div className="text-[10px] text-foreground/55 mb-1">{L==='th'?'🇹🇭 ไทย':L==='en'?'🇬🇧 EN':'🇨🇳 中文'}</div>
            {editField(`${base}_${L}` as keyof Row, "", kind)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10 px-4 py-3 flex items-center gap-3 sticky top-0 bg-background/90 backdrop-blur z-20">
        <Link href="/admin/paraphrase" className="text-foreground/60 hover:text-foreground text-sm">📚 Paraphrase</Link>
        <Link href="/admin/engine" className="text-foreground/60 hover:text-foreground text-sm">⚙ Engine</Link>
        <div className="font-serif text-xl tracking-wide">📐 Formulas</div>
        <span className="text-xs text-foreground/50">{session.email}</span>
        <div className="flex-1" />
        <a href={moduleFilter?`/api/admin/formulas/export?module=${moduleFilter}`:"/api/admin/formulas/export"} target="_blank" rel="noreferrer" download className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded">📥 Export</a>
        <label className={`px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded cursor-pointer ${importBusy?'opacity-50 pointer-events-none':''}`}>
          {importBusy?'⏳':'📤 Import'}
          <input type="file" accept="application/json,.json" hidden onChange={(e)=>{
            const f = e.target.files?.[0]; if (f && confirm(`Import "${f.name}"?`)) handleImport(f); e.target.value="";
          }} />
        </label>
        <button onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded">{theme==='dark'?'☾':'☀'}</button>
      </header>

      <div className="flex min-h-0">
        <aside className="w-72 border-r border-foreground/10 overflow-y-auto shrink-0">
          <div className="p-2 sticky top-0 bg-background/95 backdrop-blur border-b border-foreground/10">
            <select value={moduleFilter} onChange={(e)=>{setModuleFilter(e.target.value); setSelectedId(null);}} className="w-full px-2 py-1.5 text-xs bg-foreground/5 border border-foreground/15">
              <option value="">ทุก module ({rows.length})</option>
              {modules.map(m => <option key={m.module} value={m.module}>{m.module} ({m.c})</option>)}
            </select>
          </div>
          {rows.map(r => (
            <button key={r.id} onClick={()=>setSelectedId(r.id)} className={`w-full text-left px-3 py-2 text-xs border-b border-foreground/5 hover:bg-foreground/5 ${selectedId===r.id?'bg-foreground/10':''}`}>
              <div className="flex items-center gap-1 mb-0.5">
                {r.status === 'verified' && <span className="text-[9px] text-emerald-500">✓</span>}
                {r.status === 'disputed' && <span className="text-[9px] text-rose-500">⚠</span>}
                <code className="text-[10px] text-foreground/55">{r.module}</code>
              </div>
              <div className="font-medium">{r.title_th || r.title_en || r.code}</div>
              <div className="text-[10px] text-foreground/40 font-mono">{r.code}</div>
            </button>
          ))}
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          {!current ? (
            <div className="text-sm text-foreground/55 text-center mt-12">← เลือกสูตรทางซ้าย</div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-5">
              {/* Header */}
              <div className="border-b border-foreground/10 pb-3 flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap text-xs">
                    <code className="text-[10px] text-foreground/55">{current.module}</code>
                    <code className="text-[10px] text-foreground/40">{current.code}</code>
                    {current.status === 'verified' && <span className="text-[10px] px-1.5 py-0.5 border border-emerald-500 text-emerald-600">✓ Verified</span>}
                    {current.status === 'disputed' && <span className="text-[10px] px-1.5 py-0.5 border border-rose-500 text-rose-600">⚠ Disputed</span>}
                    {current.status === 'draft' && <span className="text-[10px] px-1.5 py-0.5 border border-foreground/30 text-foreground/50">● Draft</span>}
                  </div>
                  <h2 className="font-serif text-2xl">{current.title_th || current.title_en || current.code}</h2>
                </div>
                <button onClick={handleSave} disabled={busy || Object.keys(draft).length===0} className="px-4 py-2 text-sm bg-[var(--cinnabar)] text-background hover:opacity-90 disabled:opacity-30">💾 บันทึก</button>
              </div>

              {/* Verify panel */}
              <div className="border border-foreground/10 p-3 bg-card/30">
                <div className="text-xs font-medium mb-2">🔍 ซินแสตรวจสอบ</div>
                <textarea value={verifyNotes} onChange={(e)=>setVerifyNotes(e.target.value)} rows={2} placeholder="หมายเหตุการตรวจ (เช่น: 'สูตรถูกต้องตาม 子平真詮' หรือ 'phase mult ควรเปลี่ยน')" className="w-full px-2 py-1.5 text-xs bg-background border border-foreground/15 outline-none focus:border-[var(--cinnabar)] mb-2" />
                <div className="flex gap-2">
                  <button onClick={()=>handleStatus("verify")} disabled={busy} className="px-3 py-1.5 text-xs bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-300">✓ Verify (ถูกต้อง)</button>
                  <button onClick={()=>handleStatus("dispute")} disabled={busy} className="px-3 py-1.5 text-xs bg-rose-500/20 border border-rose-500/50 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300">⚠ Dispute (สงสัย)</button>
                  <button onClick={()=>handleStatus("draft")} disabled={busy} className="px-3 py-1.5 text-xs border border-foreground/20 hover:bg-foreground/5">● Draft</button>
                </div>
                {current.verified_by && (
                  <div className="text-[10px] text-foreground/50 mt-2">
                    last verify: {current.verified_by} · {current.verified_at ? new Date(current.verified_at).toLocaleString('th-TH') : ''}
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="grid md:grid-cols-3 gap-3 p-3 border border-foreground/10">
                {editField("module", "module", "input")}
                {editField("category", "category", "input")}
                {editField("classical_source", "classical_source · 古典出處", "input")}
              </div>

              {/* Titles 3 ภาษา */}
              {trilingual("title", "🪧 Title · ชื่อสูตร", "input")}
              {trilingual("summary", "📝 Summary · สรุป")}
              {trilingual("steps", "📋 Steps · ขั้นตอน")}

              {/* Pseudo + math */}
              <div className="grid md:grid-cols-2 gap-3">
                {editField("math_formula", "🧮 Math Formula (LaTeX-ish)", "input")}
                {editField("pseudo_code", "💻 Pseudo Code", "textarea")}
              </div>

              {/* IO + configs */}
              <div className="grid md:grid-cols-3 gap-3">
                {editField("inputs", "Inputs · จาก JSON array", "jsonbArr")}
                {editField("outputs", "Outputs · JSON array", "jsonbArr")}
                {editField("related_configs", "Related Engine Configs · JSON", "jsonbArr")}
              </div>

              {/* References 3 ภาษา */}
              {trilingual("references", "📚 References · อ้างอิงตำรา")}
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 border text-sm z-50 ${toast.ok?"border-emerald-500 bg-emerald-500/10":"border-rose-500 bg-rose-500/10"}`}>{toast.msg}</div>
      )}
    </div>
  );
}
