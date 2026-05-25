"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PFile = { name: string; label: string; note: string; page: string; flow: string; step: number; content: string; size: number; mtime: string };

export default function SifuPromptsAdmin({ email }: { email: string }) {
  const [files, setFiles] = useState<PFile[]>([]);
  const [active, setActive] = useState<string>("");
  const [activePage, setActivePage] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true); setMsg("");
    try {
      const r = await fetch("/api/admin/sifu-prompts", { credentials: "include" });
      if (!r.ok) { setMsg("โหลดไม่ได้: " + r.status); setLoading(false); return; }
      const d = await r.json();
      setFiles(d.files || []);
      if (d.files?.length) { setActive(d.files[0].name); setActivePage(d.files[0].page || ""); setDraft(d.files[0].content); }
    } catch (e) { setMsg("error: " + (e as Error).message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // กลุ่มหน้า (เรียงตาม API) + จำนวน prompt ต่อหน้า
  const pages: string[] = [];
  const countByPage: Record<string, number> = {};
  for (const f of files) { if (!pages.includes(f.page)) pages.push(f.page); countByPage[f.page] = (countByPage[f.page] || 0) + 1; }
  const shown = files.filter((f) => f.page === activePage);
  const flowsInPage: string[] = [];
  for (const f of shown) if (!flowsInPage.includes(f.flow)) flowsInPage.push(f.flow);

  function pickPage(p: string) {
    if (p === activePage) return;
    setActivePage(p);
    const first = files.find((f) => f.page === p);
    if (first) pick(first.name);
  }

  const cur = files.find((f) => f.name === active);
  const dirty = cur && draft !== cur.content;

  function pick(name: string) {
    if (dirty && !confirm("ยังไม่บันทึก จะทิ้งการแก้ไขไหม?")) return;
    const f = files.find((x) => x.name === name);
    setActive(name); setDraft(f?.content || ""); setMsg("");
  }

  async function save() {
    if (!cur) return;
    setSaving(true); setMsg("");
    try {
      const r = await fetch("/api/admin/sifu-prompts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: active, content: draft }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg("❌ " + (d.error || r.status)); }
      else {
        setMsg(`✅ บันทึกแล้ว (${d.bytes} ตัวอักษร) · ${d.hint}`);
        setFiles((fs) => fs.map((f) => f.name === active ? { ...f, content: draft } : f));
      }
    } catch (e) { setMsg("❌ " + (e as Error).message); }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-serif text-2xl">📜 แก้ System Prompt ซินแส</h1>
          <Link href="/admin" className="text-sm opacity-60 hover:opacity-100">← Admin</Link>
        </div>
        <p className="text-sm opacity-60 mb-4">ผู้ดูแล: {email} · แก้ live ทันที (เขียนลงรีลีสที่รันอยู่) · ⚠️ จะหายเมื่อ cut release ใหม่ — ควร backport เข้า git</p>

        {loading ? <div className="opacity-60">กำลังโหลด…</div> : (
          <>
            {/* แถบเลือกหน้าเว็บ — กดหน้าแล้วเห็นเฉพาะ prompt ของหน้านั้น */}
            <div className="flex flex-wrap gap-2 mb-3">
              {pages.map((p) => (
                <button key={p} onClick={() => pickPage(p)}
                  className={`text-sm px-3 py-1.5 rounded-full border ${activePage === p ? "border-foreground bg-foreground text-background" : "border-foreground/25 hover:border-foreground/60"}`}>
                  {p} <span className="opacity-60">({countByPage[p]})</span>
                </button>
              ))}
            </div>

            <div className="text-xs opacity-50 mb-2">หน้า <b>{activePage}</b> · มี {shown.length} prompt</div>

            {/* รายการ prompt ในหน้าที่เลือก · แยกชุดย่อยตามลำดับการประกอบ (① ถาม-ตอบ / ② เปิดดวง) */}
            {flowsInPage.map((fl) => (
              <div key={fl || "_"} className="mb-3">
                {fl && <div className="text-sm font-semibold opacity-80 mt-2 mb-1.5">{fl} <span className="text-xs font-normal opacity-50">· เรียงตามลำดับที่ AI ต่อ prompt</span></div>}
                <div className="flex flex-wrap gap-2">
                  {shown.filter((f) => f.flow === fl).map((f) => (
                    <button key={f.name} onClick={() => pick(f.name)}
                      className={`text-left text-sm px-3 py-2 border rounded ${active === f.name ? "border-foreground bg-foreground/10" : "border-foreground/20 hover:border-foreground/50"}`}>
                      <div className="font-medium">{fl && f.step < 99 ? <span className="opacity-50">{f.step}. </span> : null}{f.label}</div>
                      <div className="text-xs opacity-50 font-mono">{f.name} · {(f.size / 1024).toFixed(1)}KB</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {cur && (
              <div className="text-xs opacity-60 mb-2">{cur.note} · แก้ล่าสุด {cur.mtime?.slice(0, 16).replace("T", " ")}</div>
            )}

            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false}
              className="w-full h-[60vh] font-mono text-xs leading-relaxed bg-background border border-foreground/20 rounded p-3 focus:outline-none focus:border-foreground/60"
            />

            <div className="flex items-center gap-3 mt-3">
              <button onClick={save} disabled={saving || !dirty}
                className={`px-5 py-2 rounded text-sm font-medium ${dirty && !saving ? "bg-foreground text-background" : "bg-foreground/20 text-foreground/50 cursor-not-allowed"}`}>
                {saving ? "กำลังบันทึก…" : dirty ? "💾 บันทึก" : "ไม่มีการแก้ไข"}
              </button>
              <button onClick={() => cur && setDraft(cur.content)} disabled={!dirty}
                className="px-4 py-2 rounded text-sm border border-foreground/20 disabled:opacity-40">ย้อนกลับ</button>
              {dirty && <span className="text-xs text-amber-500">● ยังไม่บันทึก</span>}
              {msg && <span className="text-sm">{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
