"use client";
import { useEffect, useState, useCallback } from "react";

type Scripture = { id: number; title: string; category: string; lang: string; source: string; created_by: string; created_at: string; page_count?: number; memo_count?: number };
type Page = { id: number; page_no: number; mime: string };
type Memo = { id: number; page_no: number | null; body: string; created_by: string; created_at: string };

const LANGS = [
  { v: "zh", t: "จีน 中文" },
  { v: "th", t: "ไทย" },
  { v: "en", t: "อังกฤษ" },
  { v: "jp", t: "ญี่ปุ่น" },
];

export default function LibraryAdmin({ email }: { email: string }) {
  const [list, setList] = useState<Scripture[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ scripture: Scripture; pages: Page[]; memos: Memo[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // upload form
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [lang, setLang] = useState("zh");
  const [source, setSource] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  // memo form
  const [memoBody, setMemoBody] = useState("");
  const [memoPage, setMemoPage] = useState("");

  const loadList = useCallback(async () => {
    const r = await fetch("/api/admin/library");
    const j = await r.json();
    if (j.ok) setList(j.scriptures);
  }, []);
  const loadDetail = useCallback(async (id: number) => {
    const r = await fetch(`/api/admin/library?id=${id}`);
    const j = await r.json();
    if (j.ok) setDetail(j);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (sel != null) loadDetail(sel); else setDetail(null); }, [sel, loadDetail]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setMsg("ใส่ชื่อคัมภีร์ก่อน"); return; }
    setBusy(true); setMsg("กำลังอัพโหลด…");
    const fd = new FormData();
    fd.set("title", title); fd.set("category", category); fd.set("lang", lang); fd.set("source", source);
    if (files) Array.from(files).forEach((f) => fd.append("files", f));
    const r = await fetch("/api/admin/library", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    if (j.ok) {
      setMsg(`✓ บันทึกแล้ว (${j.pages} หน้า)`);
      setTitle(""); setCategory(""); setSource(""); setFiles(null);
      (document.getElementById("lib-files") as HTMLInputElement).value = "";
      await loadList(); setSel(j.id);
    } else setMsg("ผิดพลาด: " + (j.error || "?"));
  }

  async function addMemo() {
    if (!detail || !memoBody.trim()) return;
    setBusy(true);
    const r = await fetch("/api/admin/library", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "memo", scriptureId: detail.scripture.id, pageNo: memoPage, body: memoBody }),
    });
    const j = await r.json(); setBusy(false);
    if (j.ok) { setMemoBody(""); setMemoPage(""); loadDetail(detail.scripture.id); loadList(); }
  }
  async function delMemo(id: number) {
    if (!detail) return;
    await fetch("/api/admin/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-memo", memoId: id }) });
    loadDetail(detail.scripture.id); loadList();
  }
  async function delScripture(id: number) {
    if (!confirm("ลบคัมภีร์นี้ทั้งเล่ม (ภาพ+memo)?")) return;
    await fetch("/api/admin/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-scripture", scriptureId: id }) });
    setSel(null); loadList();
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-serif">
      <div className="max-w-6xl mx-auto">
        <header className="mb-5 flex items-baseline justify-between gap-3 border-b border-foreground/15 pb-3">
          <h1 className="text-2xl">📚 หอสมุดคัมภีร์ <span className="text-foreground/40 text-sm">· อัพโหลดภาพ + memo · admin</span></h1>
          <span className="text-xs text-foreground/40">{email}</span>
        </header>
        {msg && <div className="mb-4 text-sm text-amber-500">{msg}</div>}

        <div className="grid md:grid-cols-[340px_1fr] gap-6">
          {/* ซ้าย: อัพโหลด + รายการ */}
          <div>
            <form onSubmit={upload} className="border border-foreground/15 rounded-lg p-4 mb-5 space-y-2.5">
              <div className="text-sm font-semibold mb-1">➕ เพิ่มคัมภีร์ใหม่</div>
              <input className="w-full bg-transparent border border-foreground/20 rounded px-2.5 py-1.5 text-sm" placeholder="ชื่อคัมภีร์ * (เช่น 阳宅爱众篇 卷四)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="w-full bg-transparent border border-foreground/20 rounded px-2.5 py-1.5 text-sm" placeholder="หมวด (เช่น 選擇 · ฮวงจุ้ย)" value={category} onChange={(e) => setCategory(e.target.value)} />
              <div className="flex gap-2">
                <select className="bg-background border border-foreground/20 rounded px-2 py-1.5 text-sm flex-1" value={lang} onChange={(e) => setLang(e.target.value)}>
                  {LANGS.map((l) => <option key={l.v} value={l.v}>{l.t}</option>)}
                </select>
              </div>
              <input className="w-full bg-transparent border border-foreground/20 rounded px-2.5 py-1.5 text-sm" placeholder="ที่มา (เช่น 光緒六年扫叶山房 / NLC)" value={source} onChange={(e) => setSource(e.target.value)} />
              <input id="lib-files" type="file" multiple accept="image/*,.pdf" onChange={(e) => setFiles(e.target.files)} className="w-full text-xs text-foreground/70 file:mr-2 file:rounded file:border-0 file:bg-foreground/10 file:px-3 file:py-1.5 file:text-sm" />
              <div className="text-[11px] text-foreground/40">เลือกภาพได้หลายหน้า (jpg/png/webp/pdf · ≤25MB/ไฟล์)</div>
              <button disabled={busy} className="w-full bg-foreground/90 text-background rounded py-1.5 text-sm font-semibold disabled:opacity-50">อัพโหลด</button>
            </form>

            <div className="text-sm font-semibold mb-2 text-foreground/60">คัมภีร์ทั้งหมด ({list.length})</div>
            <div className="space-y-1.5">
              {list.map((s) => (
                <button key={s.id} onClick={() => setSel(s.id)} className={`w-full text-left border rounded px-3 py-2 text-sm transition ${sel === s.id ? "border-amber-500/60 bg-amber-500/5" : "border-foreground/15 hover:border-foreground/30"}`}>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-[11px] text-foreground/40">{s.category || "—"} · {s.lang} · 📄{s.page_count ?? 0} · 📝{s.memo_count ?? 0}</div>
                </button>
              ))}
              {list.length === 0 && <div className="text-xs text-foreground/40">ยังไม่มีคัมภีร์</div>}
            </div>
          </div>

          {/* ขวา: รายละเอียด เล่มที่เลือก */}
          <div>
            {!detail && <div className="text-foreground/40 text-sm pt-10 text-center">← เลือกคัมภีร์เพื่อดูภาพ + เขียน memo</div>}
            {detail && (
              <div>
                <div className="flex items-baseline justify-between border-b border-foreground/15 pb-2 mb-3">
                  <div>
                    <h2 className="text-xl">{detail.scripture.title}</h2>
                    <div className="text-xs text-foreground/40">{detail.scripture.category} · {detail.scripture.lang} · ที่มา: {detail.scripture.source || "—"}</div>
                  </div>
                  <button onClick={() => delScripture(detail.scripture.id)} className="text-xs text-red-400/70 hover:text-red-400">ลบเล่ม</button>
                </div>

                {/* memo */}
                <div className="border border-foreground/15 rounded-lg p-4 mb-5">
                  <div className="text-sm font-semibold mb-2">📝 Memo (ต่อท้ายคัมภีร์)</div>
                  <div className="space-y-2 mb-3">
                    {detail.memos.map((m) => (
                      <div key={m.id} className="border-l-2 border-amber-500/40 pl-3 py-1 text-sm group">
                        <div className="whitespace-pre-wrap">{m.body}</div>
                        <div className="text-[11px] text-foreground/40 flex gap-2 items-center mt-0.5">
                          {m.page_no ? `หน้า ${m.page_no} · ` : ""}{m.created_by} · {new Date(m.created_at).toLocaleString("th-TH")}
                          <button onClick={() => delMemo(m.id)} className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400">ลบ</button>
                        </div>
                      </div>
                    ))}
                    {detail.memos.length === 0 && <div className="text-xs text-foreground/40">ยังไม่มี memo</div>}
                  </div>
                  <div className="flex gap-2 items-start">
                    <input className="w-16 bg-transparent border border-foreground/20 rounded px-2 py-1.5 text-sm" placeholder="หน้า" value={memoPage} onChange={(e) => setMemoPage(e.target.value)} />
                    <textarea className="flex-1 bg-transparent border border-foreground/20 rounded px-2.5 py-1.5 text-sm" rows={2} placeholder="เขียน memo / ถอดความ / ตีความ…" value={memoBody} onChange={(e) => setMemoBody(e.target.value)} />
                    <button onClick={addMemo} disabled={busy} className="bg-foreground/90 text-background rounded px-3 py-1.5 text-sm font-semibold disabled:opacity-50">เพิ่ม</button>
                  </div>
                </div>

                {/* ภาพหน้าคัมภีร์ */}
                <div className="text-sm font-semibold mb-2 text-foreground/60">หน้าคัมภีร์ ({detail.pages.length})</div>
                <div className="space-y-3">
                  {detail.pages.map((p) => (
                    <div key={p.id} className="border border-foreground/15 rounded-lg overflow-hidden">
                      <div className="text-[11px] text-foreground/40 px-3 py-1 border-b border-foreground/10">หน้า {p.page_no}</div>
                      {p.mime === "application/pdf"
                        ? <a className="block px-3 py-4 text-sm text-amber-500 underline" href={`/api/admin/library/file?pageId=${p.id}`} target="_blank" rel="noreferrer">เปิด PDF หน้า {p.page_no}</a>
                        : <img src={`/api/admin/library/file?pageId=${p.id}`} alt={`หน้า ${p.page_no}`} className="w-full" loading="lazy" />}
                    </div>
                  ))}
                  {detail.pages.length === 0 && <div className="text-xs text-foreground/40">ไม่มีภาพ</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
