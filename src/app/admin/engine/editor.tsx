"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type EngineConfig = {
  id: number;
  module: string;
  group_name: string;
  param_key: string;
  param_value: unknown;
  param_type: string;
  min_value: number | null;
  max_value: number | null;
  default_value: unknown;
  description_en: string | null;
  description_th: string | null;
  description_zh: string | null;
  reasoning_en: string | null;
  reasoning_th: string | null;
  reasoning_zh: string | null;
  last_changed_by: string | null;
  last_changed_at: string | null;
  is_active: boolean;
  version: string;
  updated_at: string;
};

type AuditEntry = {
  id: number;
  module: string;
  group_name: string;
  param_key: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_at: string;
  source: string;
  reason: string | null;
};

const MODULE_LABEL: Record<string, string> = {
  // เดิม 14 modules (relabel ให้ตรง § ใน /chart-v2)
  dm_strength: "§1 旺衰 · DM Strength · ความแกร่ง",
  voytek_css: "§2 五行 · §9 十神 · F-VOYTEK-CSS",
  yongshen: "§3 用神 · Yongshen ranks",
  interactions: "§7 9 Interactions · 三合/六合/沖/破",
  luck_cycles: "§10 大運 · §19 流月日時 · §34 月運",
  symbolic_stars: "§20 神煞 62 · polarity",
  annual_stars: "§33 流年神煞 · activation",
  fan_fu_yin: "§35 反吟/伏吟 · severity",
  border_case: "§38 Border Case · thresholds",
  chart_overview_39: "§39 Chart Overview · strength tiers",
  qimen_scoring: "§30·§31·§32 QiMen · scoring",
  network_scoring: "Network · 4-component asymmetric",
  today_verdict: "Today · verdict 5-tier",
  heluo_hex: "易經 · HeLuoHex lines",
  // ใหม่ 9 modules (Phase 19)
  "§5_tou_gan": "§5 透干 · Tou Gan weights",
  "§6_hidden_stems": "§6 藏干 · Hidden Stems priority",
  "§8_kong_wang": "§8 空亡 · Kong Wang thresholds",
  "§13_day_view": "§13 十二時辰 · Day View 12 hours",
  "§14_tongshu": "§14 黃曆 · Tongshu yi/ji",
  "§22_storage_tomb": "§22 庫墓 · Storage unlock",
  "§28_five_structure_types": "§28 五型格 · 5 Structure Types",
  "§29_ten_profiles": "§29 十神格 · 10 Profiles ranking",
  "§36_stem_combos": "§36 五合 · Stem Combos triggers",
};

export default function EngineEditor({ session }: { session: { email: string } }) {
  const [grouped, setGrouped] = useState<Record<string, Record<string, EngineConfig[]>>>({});
  const [modules, setModules] = useState<{ module: string; c: number }[]>([]);
  const [activeModule, setActiveModule] = useState<string>("dm_strength");
  const [draft, setDraft] = useState<Record<number, unknown>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<number, { th?: string; en?: string; zh?: string }>>({});
  const [importBusy, setImportBusy] = useState(false);

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

  const fetchAll = useCallback(async () => {
    const r = await fetch("/api/admin/engine");
    const j = await r.json();
    if (j.ok) {
      setGrouped(j.grouped);
      setModules(j.modules);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSave = useCallback(
    async (cfg: EngineConfig) => {
      const newVal = draft[cfg.id];
      const reasoning = reasonDraft[cfg.id] || {};
      const hasValueChange = newVal !== undefined;
      const hasReasonChange =
        (reasoning.th !== undefined && reasoning.th !== (cfg.reasoning_th || "")) ||
        (reasoning.en !== undefined && reasoning.en !== (cfg.reasoning_en || "")) ||
        (reasoning.zh !== undefined && reasoning.zh !== (cfg.reasoning_zh || ""));
      if (!hasValueChange && !hasReasonChange) return;

      const payload: Record<string, unknown> = { source: "manual" };
      if (hasValueChange) {
        let value: unknown = newVal;
        if (cfg.param_type === "number") {
          const n = Number(newVal);
          if (Number.isNaN(n)) {
            setToast({ ok: false, msg: "ค่าต้องเป็นตัวเลข" });
            setTimeout(() => setToast(null), 2000);
            return;
          }
          value = n;
        }
        payload.value = value;
      }
      if (reasoning.th !== undefined) payload.reasoning_th = reasoning.th;
      if (reasoning.en !== undefined) payload.reasoning_en = reasoning.en;
      if (reasoning.zh !== undefined) payload.reasoning_zh = reasoning.zh;

      setBusyId(cfg.id);
      const r = await fetch(`/api/admin/engine/${cfg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      setBusyId(null);
      if (j.ok) {
        setToast({
          ok: true,
          msg: j.unchanged
            ? "ไม่มีการเปลี่ยน"
            : `บันทึก ${cfg.param_key} ${j.value_changed ? `= ${payload.value}` : ""}${j.reasoning_changed ? " + เหตุผล" : ""}`,
        });
        setDraft((d) => {
          const c = { ...d };
          delete c[cfg.id];
          return c;
        });
        setReasonDraft((d) => {
          const c = { ...d };
          delete c[cfg.id];
          return c;
        });
        fetchAll();
      } else {
        setToast({ ok: false, msg: j.error || "ผิดพลาด" });
      }
      setTimeout(() => setToast(null), 2500);
    },
    [draft, reasonDraft, fetchAll]
  );

  const handleImport = useCallback(
    async (file: File) => {
      setImportBusy(true);
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const rows = json.rows || [];
        const r = await fetch("/api/admin/engine/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows, source: "import-json" }),
        });
        const j = await r.json();
        if (j.ok) {
          setToast({
            ok: true,
            msg: `Import: scanned ${j.scanned} · updated ${j.updated} · fields ${j.fields_changed}${j.errors?.length ? ` · errors ${j.errors.length}` : ""}`,
          });
          fetchAll();
        } else {
          setToast({ ok: false, msg: j.error || "import failed" });
        }
      } catch (e) {
        setToast({ ok: false, msg: String(e).slice(0, 100) });
      } finally {
        setImportBusy(false);
        setTimeout(() => setToast(null), 4000);
      }
    },
    [fetchAll]
  );

  const handleRevert = useCallback(
    async (cfg: EngineConfig) => {
      if (!confirm(`Revert ${cfg.param_key} กลับเป็นค่าเดิม (${JSON.stringify(cfg.default_value)})?`)) return;
      setBusyId(cfg.id);
      const r = await fetch(`/api/admin/engine/${cfg.id}?action=revert`, { method: "POST" });
      const j = await r.json();
      setBusyId(null);
      if (j.ok) {
        setToast({ ok: true, msg: `Reverted ${cfg.param_key}` });
        fetchAll();
      } else {
        setToast({ ok: false, msg: j.error || "ผิดพลาด" });
      }
      setTimeout(() => setToast(null), 2500);
    },
    [fetchAll]
  );

  const openAudit = useCallback(async () => {
    const r = await fetch(`/api/admin/engine/audit?module=${activeModule}`);
    const j = await r.json();
    if (j.ok) {
      setAudit(j.entries);
      setAuditOpen(true);
    }
  }, [activeModule]);

  const moduleGroups = grouped[activeModule] || {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10 px-4 py-3 flex items-center gap-3 sticky top-0 bg-background/90 backdrop-blur z-20">
        <Link href="/admin/paraphrase" className="text-foreground/60 hover:text-foreground text-sm">
          📚 Paraphrase
        </Link>
        <span className="text-foreground/30">·</span>
        <div className="font-serif text-xl tracking-wide">⚙ Engine Formulas</div>
        <span className="text-xs text-foreground/50">{session.email}</span>
        <div className="flex-1" />
        <button
          onClick={openAudit}
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
        >
          📋 Activity
        </button>
        <a
          href={`/api/admin/engine/export?module=${activeModule}`}
          target="_blank"
          rel="noreferrer"
          download
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
          title={`Export configs · ${activeModule}`}
        >
          📥 Export
        </a>
        <a
          href="/api/admin/engine/export"
          target="_blank"
          rel="noreferrer"
          download
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
          title="Export ทุก module"
        >
          📥 All
        </a>
        <label
          className={`px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded cursor-pointer ${importBusy ? "opacity-50 pointer-events-none" : ""}`}
          title="Import JSON · update by id"
        >
          {importBusy ? "⏳ Import …" : "📤 Import"}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={importBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (confirm(`Import ไฟล์ "${f.name}" (${(f.size / 1024).toFixed(1)} KB)?`)) {
                  handleImport(f);
                }
                e.target.value = "";
              }
            }}
          />
        </label>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="px-3 py-1.5 text-xs border border-foreground/15 hover:bg-foreground/5 rounded"
        >
          {theme === "dark" ? "☾ Dark" : "☀ Light"}
        </button>
      </header>

      <div className="flex min-h-0">
        {/* Module sidebar */}
        <aside className="w-64 border-r border-foreground/10 p-2 space-y-1 shrink-0">
          {modules.map((m) => (
            <button
              key={m.module}
              onClick={() => setActiveModule(m.module)}
              className={`w-full text-left px-3 py-2 text-sm border ${
                activeModule === m.module
                  ? "border-[var(--cinnabar)] bg-foreground/5"
                  : "border-transparent hover:bg-foreground/5"
              }`}
            >
              <div className="font-medium leading-tight">{MODULE_LABEL[m.module] || m.module}</div>
              <div className="text-[10px] text-foreground/50 mt-0.5 font-mono">
                {m.module} · {m.c} configs
              </div>
            </button>
          ))}
        </aside>

        {/* Main editor */}
        <main className="flex-1 p-6 overflow-y-auto">
          <h2 className="font-serif text-2xl mb-1">{MODULE_LABEL[activeModule] || activeModule}</h2>
          <p className="text-xs text-foreground/50 mb-6">
            ปรับ weight / multiplier / threshold ของ engine · audit ทุก save · revert ได้ทันที
          </p>

          {Object.entries(moduleGroups).map(([group, configs]) => (
            <section key={group} className="mb-8">
              <h3 className="text-sm font-medium border-b border-foreground/10 pb-1 mb-3">
                <span className="zh text-[var(--cinnabar)]">⟐</span> {group}
                <span className="text-foreground/40 text-xs ml-2">({configs.length})</span>
              </h3>
              <div className="space-y-2">
                {configs.map((cfg) => {
                  const cur = draft[cfg.id] !== undefined ? draft[cfg.id] : cfg.param_value;
                  const changed = draft[cfg.id] !== undefined;
                  const reasoning = reasonDraft[cfg.id] || {};
                  const reasonChanged =
                    (reasoning.th !== undefined && reasoning.th !== (cfg.reasoning_th || "")) ||
                    (reasoning.en !== undefined && reasoning.en !== (cfg.reasoning_en || "")) ||
                    (reasoning.zh !== undefined && reasoning.zh !== (cfg.reasoning_zh || ""));
                  const isModified = JSON.stringify(cfg.param_value) !== JSON.stringify(cfg.default_value);
                  const isExpanded = expanded === cfg.id;
                  const hasReasoning = cfg.reasoning_th || cfg.reasoning_en || cfg.reasoning_zh;
                  return (
                    <div
                      key={cfg.id}
                      className={`border ${
                        changed || reasonChanged ? "border-[var(--cinnabar)] bg-foreground/5" : "border-foreground/10"
                      }`}
                    >
                      <div className="grid grid-cols-12 gap-3 items-center p-2">
                        <div className="col-span-3">
                          <div className="font-mono text-sm font-medium">{cfg.param_key}</div>
                          <div className="text-[10px] text-foreground/50">
                            {cfg.description_th || cfg.description_en || ""}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <input
                            type={cfg.param_type === "number" ? "number" : "text"}
                            step="0.01"
                            min={cfg.min_value ?? undefined}
                            max={cfg.max_value ?? undefined}
                            value={String(cur ?? "")}
                            onChange={(e) => {
                              setDraft((d) => ({ ...d, [cfg.id]: e.target.value }));
                            }}
                            className="w-full px-2 py-1 text-sm bg-background border border-foreground/15 outline-none focus:border-[var(--cinnabar)]"
                          />
                        </div>
                        <div className="col-span-2 text-[10px] text-foreground/55 font-mono">
                          {cfg.min_value != null && cfg.max_value != null
                            ? `min ${cfg.min_value} · max ${cfg.max_value}`
                            : "—"}
                        </div>
                        <div className="col-span-2 text-[10px] text-foreground/55 font-mono">
                          default: {JSON.stringify(cfg.default_value)}
                          {isModified && <span className="ml-1 text-amber-500">●</span>}
                        </div>
                        <div className="col-span-1 text-[10px] text-foreground/55">
                          {cfg.last_changed_at && (
                            <span title={`${cfg.last_changed_by} · ${cfg.last_changed_at}`}>
                              ⓘ {new Date(cfg.last_changed_at).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <div className="col-span-2 flex gap-1 justify-end">
                          <button
                            onClick={() => setExpanded(isExpanded ? null : cfg.id)}
                            className={`px-2 py-1 text-[11px] border hover:bg-foreground/5 ${
                              hasReasoning ? "border-[var(--cinnabar)]/40 text-[var(--cinnabar)]" : "border-foreground/15"
                            }`}
                            title={hasReasoning ? "มีเหตุผลแล้ว · ดูเพิ่ม/แก้" : "เพิ่มเหตุผล/methodology"}
                          >
                            📝 {isExpanded ? "▾" : hasReasoning ? "●" : "▸"}
                          </button>
                          <button
                            onClick={() => handleSave(cfg)}
                            disabled={(!changed && !reasonChanged) || busyId === cfg.id}
                            className="px-2 py-1 text-[11px] bg-[var(--cinnabar)] text-background hover:opacity-90 disabled:opacity-30"
                          >
                            💾
                          </button>
                          <button
                            onClick={() => handleRevert(cfg)}
                            disabled={!isModified || busyId === cfg.id}
                            className="px-2 py-1 text-[11px] border border-foreground/15 hover:bg-foreground/5 disabled:opacity-30"
                            title="Revert to default"
                          >
                            ↺
                          </button>
                        </div>
                      </div>

                      {/* Reasoning expansion */}
                      {isExpanded && (
                        <div className="border-t border-foreground/10 bg-card/30 p-3 space-y-2">
                          <div className="text-[10px] text-foreground/55 uppercase tracking-wider">
                            Methodology / เหตุผลที่เลือกค่านี้ · 3 ภาษา (ใส่อันใดอันหนึ่งก็ได้)
                          </div>
                          {(
                            [
                              { code: "th", flag: "🇹🇭", label: "ไทย" },
                              { code: "en", flag: "🇬🇧", label: "English" },
                              { code: "zh", flag: "🇨🇳", label: "中文" },
                            ] as const
                          ).map((L) => {
                            const cur =
                              reasoning[L.code] !== undefined
                                ? reasoning[L.code]
                                : ((cfg[`reasoning_${L.code}` as keyof EngineConfig] as string | null) || "");
                            return (
                              <div key={L.code}>
                                <div className="text-[10px] text-foreground/55 mb-1">
                                  {L.flag} {L.label}
                                </div>
                                <textarea
                                  value={cur || ""}
                                  rows={2}
                                  onChange={(e) =>
                                    setReasonDraft((d) => ({
                                      ...d,
                                      [cfg.id]: { ...d[cfg.id], [L.code]: e.target.value },
                                    }))
                                  }
                                  placeholder={
                                    L.code === "th"
                                      ? "เช่น: ใช้ 1.5 เพราะ 帝旺 = peak strength · ตำราคลาสสิก Z-Ze formula"
                                      : L.code === "en"
                                        ? "e.g. 1.5 because 帝旺 = peak strength per classical Z-Ze formula"
                                        : "例如: 1.5 因為 帝旺 為旺氣最盛 · 古典 Z-Ze 公式"
                                  }
                                  className="w-full px-2 py-1.5 text-xs bg-background border border-foreground/10 outline-none focus:border-[var(--cinnabar)] resize-y leading-relaxed"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </main>
      </div>

      {/* Audit modal */}
      {auditOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-stretch justify-end"
          onClick={() => setAuditOpen(false)}
        >
          <div
            className="bg-background border-l border-foreground/15 w-full max-w-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-foreground/10 p-4 flex items-center gap-3">
              <h3 className="font-serif text-xl">📋 Engine Activity · {activeModule}</h3>
              <div className="flex-1" />
              <button onClick={() => setAuditOpen(false)} className="text-2xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {audit.length === 0 ? (
                <div className="p-6 text-center text-sm text-foreground/55">ยังไม่มีกิจกรรม</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-foreground/55 border-b border-foreground/10">
                      <th className="p-2">เวลา</th>
                      <th>group · key</th>
                      <th>old → new</th>
                      <th>ผู้แก้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.id} className="border-b border-foreground/5">
                        <td className="p-2 font-mono text-[10px]">
                          {new Date(e.changed_at).toLocaleString("th-TH", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="p-2">
                          <div className="font-mono">{e.group_name}</div>
                          <div className="text-[10px] text-foreground/55">{e.param_key}</div>
                        </td>
                        <td className="p-2 font-mono text-[11px]">
                          <span className="text-rose-500">{JSON.stringify(e.old_value)}</span>
                          {" → "}
                          <span className="text-emerald-500">{JSON.stringify(e.new_value)}</span>
                        </td>
                        <td className="p-2 text-[10px]">{e.changed_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

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
