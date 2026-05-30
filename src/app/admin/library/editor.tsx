"use client";
import { useEffect, useState, useCallback, useRef } from "react";

type Scripture = { id: number; title: string; category: string; lang: string; source: string; memo?: string; created_at: string; page_count?: number; has_memo?: boolean };
type Page = { id: number; page_no: number; mime: string };

const LANGS = [
  { v: "zh", t: "จีน 中文" }, { v: "th", t: "ไทย" }, { v: "en", t: "อังกฤษ" }, { v: "jp", t: "ญี่ปุ่น" },
];

export default function LibraryAdmin({ email }: { email: string }) {
  const [list, setList] = useState<Scripture[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ scripture: Scripture; pages: Page[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [cur, setCur] = useState(0); // reader: index หน้า

  // create form
  const [title, setTitle] = useState(""); const [category, setCategory] = useState("");
  const [lang, setLang] = useState("zh"); const [source, setSource] = useState("");

  // memo
  const [memo, setMemo] = useState(""); const [memoDirty, setMemoDirty] = useState(false);

  // upload progress
  const [upBusy, setUpBusy] = useState(false); const [upDone, setUpDone] = useState(0); const [upTotal, setUpTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    const r = await fetch("/api/admin/library"); const j = await r.json();
    if (j.ok) setList(j.scriptures);
  }, []);
  const loadDetail = useCallback(async (id: number) => {
    const r = await fetch(`/api/admin/library?id=${id}`); const j = await r.json();
    if (j.ok) { setDetail(j); setMemo(j.scripture.memo || ""); setMemoDirty(false); setCur(0); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (sel != null) loadDetail(sel); else setDetail(null); }, [sel, loadDetail]);

  // สร้างเล่มใหม่ (metadata) แล้วเลือกเลย
  async function createScripture(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setMsg("ใส่ชื่อคัมภีร์ก่อน"); return; }
    const r = await fetch("/api/admin/library", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", title, category, lang, source }) });
    const j = await r.json();
    if (j.ok) { setMsg("✓ สร้างเล่มแล้ว · อัพรูปได้เลย"); setTitle(""); setCategory(""); setSource(""); await loadList(); setSel(j.id); }
    else setMsg("ผิดพลาด: " + (j.error || "?"));
  }

  // อัพทีละรูป (sequential · เหมือน claude web) เข้าเล่มที่เลือก
  async function uploadFiles(files: FileList | null) {
    if (!files || !detail) return;
    const arr = Array.from(files);
    setUpBusy(true); setUpTotal(arr.length); setUpDone(0); setMsg("");
    let ok = 0;
    for (let i = 0; i < arr.length; i++) {
      const fd = new FormData();
      fd.set("scriptureId", String(detail.scripture.id));
      fd.append("files", arr[i]);
      try { const r = await fetch("/api/admin/library", { method: "POST", body: fd }); const j = await r.json(); if (j.ok) ok += j.added; }
      catch { /* ข้ามรูปที่พลาด · ไปต่อ */ }
      setUpDone(i + 1);
    }
    setUpBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    setMsg(`✓ อัพเสร็จ ${ok}/${arr.length} รูป`);
    await loadDetail(detail.scripture.id); await loadList();
  }

  async function saveMemo() {
    if (!detail) return;
    await fetch("/api/admin/library", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-memo", scriptureId: detail.scripture.id, memo }) });
    setMemoDirty(false); setMsg("✓ บันทึก memo แล้ว"); loadList();
  }
  async function delPage(pageId: number) {
    if (!detail) return;
    await fetch("/api/admin/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-page", pageId }) });
    loadDetail(detail.scripture.id); loadList();
  }
  async function delScripture(id: number) {
    if (!confirm("ลบคัมภีร์ทั้งเล่ม (ภาพ+memo)?")) return;
    await fetch("/api/admin/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-scripture", scriptureId: id }) });
    setSel(null); loadList();
  }

  const pages = detail?.pages || [];
  const curPage = pages[cur];

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-serif">
      <div className="max-w-6xl mx-auto">
        <header className="mb-5 flex items-baseline justify-between gap-3 border-b border-foreground/15 pb-3">
          <h1 className="text-2xl">📚 หอสมุดคัมภีร์ <span className="text-foreground/40 text-sm">· อัพภาพทีละรูป + memo · admin</span></h1>
          <span className="text-xs text-foreground/40">{email}</span>
        </header>
        {msg && <div className="mb-4 text-sm text-amber-500">{msg}</div>}

        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          {/* ซ้าย: สร้างเล่ม + รายการ */}
          <div>
            <form onSubmit={createScripture} className="border border-foreground/15 rounded-lg p-4 mb-5 space-y-2.5">
              <div className="text-sm font-semibold mb-1">➕ สร้างเล่มใหม่ (กรอกข้อมูล → อัพรูปทีหลัง)</div>
              <input className="w-full bg-transparent border border-foreground/20 rounded px-2.5 py-1.5 text-sm" placeholder="ชื่อคัมภีร์ * (เช่น 阳宅爱众篇 卷四)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="w-full bg-transparent border border-foreground/20 rounded px-2.5 py-1.5 text-sm" placeholder="หมวด (選擇 · ฮวงจุ้ย)" value={category} onChange={(e) => setCategory(e.target.value)} />
              <select className="w-full bg-background border border-foreground/20 rounded px-2 py-1.5 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
                {LANGS.map((l) => <option key={l.v} value={l.v}>{l.t}</option>)}
              </select>
              <input className="w-full bg-transparent border border-foreground/20 rounded px-2.5 py-1.5 text-sm" placeholder="ที่มา (光緒六年扫叶山房 / NLC)" value={source} onChange={(e) => setSource(e.target.value)} />
              <button className="w-full bg-foreground/90 text-background rounded py-1.5 text-sm font-semibold">สร้างเล่ม</button>
            </form>

            <div className="text-sm font-semibold mb-2 text-foreground/60">คัมภีร์ ({list.length})</div>
            <div className="space-y-1.5 max-h-[60vh] overflow-auto pr-1">
              {list.map((s) => (
                <button key={s.id} onClick={() => setSel(s.id)} className={`w-full text-left border rounded px-3 py-2 text-sm transition ${sel === s.id ? "border-amber-500/60 bg-amber-500/5" : "border-foreground/15 hover:border-foreground/30"}`}>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-[11px] text-foreground/40">{s.category || "—"} · {s.lang} · 📄{s.page_count ?? 0} {s.has_memo ? "· 📝" : ""}</div>
                </button>
              ))}
              {list.length === 0 && <div className="text-xs text-foreground/40">ยังไม่มีคัมภีร์</div>}
            </div>
          </div>

          {/* ขวา: เล่มที่เลือก */}
          <div>
            {!detail && <div className="text-foreground/40 text-sm pt-10 text-center">← เลือก/สร้างคัมภีร์</div>}
            {detail && (
              <div>
                <div className="flex items-baseline justify-between border-b border-foreground/15 pb-2 mb-3">
                  <div>
                    <h2 className="text-xl">{detail.scripture.title}</h2>
                    <div className="text-xs text-foreground/40">{detail.scripture.category} · {detail.scripture.lang} · ที่มา: {detail.scripture.source || "—"} · {pages.length} หน้า</div>
                  </div>
                  <button onClick={() => delScripture(detail.scripture.id)} className="text-xs text-red-400/70 hover:text-red-400">ลบเล่ม</button>
                </div>

                {/* อัพรูป (ทีละรูปอัตโนมัติ) */}
                <div className="border border-foreground/15 rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap">
                  <input ref={fileRef} type="file" multiple accept="image/*,.pdf" disabled={upBusy} onChange={(e) => uploadFiles(e.target.files)}
                    className="text-xs text-foreground/70 file:mr-2 file:rounded file:border-0 file:bg-foreground/10 file:px-3 file:py-1.5 file:text-sm" />
                  <span className="text-[11px] text-foreground/40">เลือกได้ 60-70 รูป · ระบบอัพ<b>ทีละรูปเอง</b> (ไม่ชนลิมิต)</span>
                  {upBusy && <span className="text-sm text-amber-500">อัพ {upDone}/{upTotal}… <span className="inline-block w-24 h-1.5 bg-foreground/15 rounded align-middle ml-1"><span className="block h-full bg-amber-500 rounded" style={{ width: `${Math.round((upDone / Math.max(upTotal,1)) * 100)}%` }} /></span></span>}
                </div>

                {/* memo เดียวต่อเล่ม */}
                <div className="border border-foreground/15 rounded-lg p-4 mb-5">
                  <div className="text-sm font-semibold mb-2 flex items-center justify-between">📝 Memo (1 ช่อง/คัมภีร์)
                    {memoDirty && <button onClick={saveMemo} className="bg-foreground/90 text-background rounded px-3 py-1 text-xs font-semibold">บันทึก</button>}
                  </div>
                  <textarea className="w-full bg-transparent border border-foreground/20 rounded px-2.5 py-2 text-sm min-h-[120px]" placeholder="ถอดความ口訣 / ตีความ / โน้ตคัมภีร์เล่มนี้…" value={memo}
                    onChange={(e) => { setMemo(e.target.value); setMemoDirty(true); }} onBlur={() => memoDirty && saveMemo()} />
                </div>

                {/* reader: ทีละหน้า + แถบเลขหน้า */}
                {pages.length > 0 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0} className="border border-foreground/20 rounded px-3 py-1 text-sm disabled:opacity-30">◀</button>
                      <span className="text-sm text-foreground/60">หน้า {curPage?.page_no} / {pages.length}</span>
                      <button onClick={() => setCur((c) => Math.min(pages.length - 1, c + 1))} disabled={cur >= pages.length - 1} className="border border-foreground/20 rounded px-3 py-1 text-sm disabled:opacity-30">▶</button>
                      <button onClick={() => delPage(curPage.id)} className="ml-auto text-xs text-red-400/60 hover:text-red-400">ลบหน้านี้</button>
                    </div>
                    {/* แถบเลขหน้า กดข้าม */}
                    <div className="flex flex-wrap gap-1 mb-3 max-h-24 overflow-auto">
                      {pages.map((p, i) => (
                        <button key={p.id} onClick={() => setCur(i)} className={`w-7 h-7 text-[11px] rounded border ${i === cur ? "border-amber-500 bg-amber-500/15 text-amber-500" : "border-foreground/15 text-foreground/50 hover:border-foreground/40"}`}>{p.page_no}</button>
                      ))}
                    </div>
                    {/* หน้าปัจจุบัน (โหลดเฉพาะหน้านี้) */}
                    <div className="border border-foreground/15 rounded-lg overflow-hidden">
                      {curPage && (curPage.mime === "application/pdf"
                        ? <a className="block px-3 py-6 text-sm text-amber-500 underline" href={`/api/admin/library/file?pageId=${curPage.id}`} target="_blank" rel="noreferrer">เปิด PDF หน้า {curPage.page_no}</a>
                        : <img key={curPage.id} src={`/api/admin/library/file?pageId=${curPage.id}`} alt={`หน้า ${curPage.page_no}`} className="w-full" />)}
                    </div>
                  </div>
                ) : <div className="text-xs text-foreground/40">ยังไม่มีภาพ — เลือกไฟล์ด้านบนเพื่ออัพ</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
