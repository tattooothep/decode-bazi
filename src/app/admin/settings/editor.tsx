"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type S = Record<string, string>;

const META: { key: string; label: string; hint: string; type: "num" | "toggle" | "text" }[] = [
  { key: "credit_start", label: "ยามเริ่มต้นผู้ใช้ใหม่", hint: "จำนวนยามที่ user ได้ตอนสมัคร", type: "num" },
  { key: "credit_chars_per_yam", label: "ตัวอักษร / 1 ยาม", hint: "คำตอบ AI กี่ตัวอักษร = หัก 1 ยาม", type: "num" },
  { key: "maintenance_mode", label: "โหมดปิดปรับปรุง", hint: "เปิด = ผู้ใช้เข้าไม่ได้ชั่วคราว", type: "toggle" },
  { key: "signup_open", label: "เปิดรับสมัคร", hint: "ปิด = สมัครใหม่ไม่ได้", type: "toggle" },
  { key: "feature_vision", label: "เปิด VLM (แปลนบ้าน)", hint: "ให้ AI เห็นภาพแปลนบ้าน", type: "toggle" },
  { key: "feature_fusion", label: "เปิด Fusion", hint: "ฟีเจอร์รวมดวง", type: "toggle" },
  { key: "announcement", label: "แบนเนอร์ประกาศ", hint: "ข้อความบนหัวเว็บ (ว่าง = ไม่แสดง)", type: "text" },
];

export default function SettingsAdmin() {
  const [s, setS] = useState<S>({});
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { fetch("/api/admin/settings").then((r) => r.json()).then((r) => r.ok && setS(r.settings)); }, []);
  const set = (k: string, v: string) => { setS((o) => ({ ...o, [k]: v })); setDirty(true); };

  const save = async () => {
    setMsg("กำลังบันทึก…");
    const r = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setMsg(`✓ บันทึก ${r.saved.length} ค่า`); setDirty(false); }
    else setMsg("✗ " + (r?.error || "ผิดพลาด"));
  };

  return (
    <div className="min-h-screen px-5 py-8 max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="font-serif text-2xl">ตั้งค่าเว็บ</h1>
        <Link href="/admin" className="text-sm opacity-60 hover:opacity-100">← หลังบ้าน</Link>
      </div>

      <div className="space-y-1">
        {META.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-4 border-b border-foreground/10 py-3">
            <div className="flex-1">
              <div className="text-sm">{m.label}</div>
              <div className="text-xs opacity-50">{m.hint}</div>
            </div>
            <div className="w-44 text-right">
              {m.type === "toggle" ? (
                <button onClick={() => set(m.key, s[m.key] === "on" ? "off" : "on")} className={`px-4 py-1 border text-sm ${s[m.key] === "on" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500" : "border-foreground/20 opacity-60"}`}>{s[m.key] === "on" ? "เปิด" : "ปิด"}</button>
              ) : m.type === "num" ? (
                <input type="number" value={s[m.key] ?? ""} onChange={(e) => set(m.key, e.target.value)} className="bg-transparent border border-foreground/20 px-2 py-1 w-24 text-sm text-right" />
              ) : (
                <input value={s[m.key] ?? ""} onChange={(e) => set(m.key, e.target.value)} className="bg-transparent border border-foreground/20 px-2 py-1 w-44 text-sm" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button disabled={!dirty} onClick={save} className="border border-foreground/40 px-5 py-2 text-sm hover:bg-foreground/10 disabled:opacity-30">บันทึก</button>
        {msg && <span className="text-sm opacity-70">{msg}</span>}
      </div>
      <p className="text-xs opacity-40 mt-4">หมายเหตุ: อัตราเครดิตจะใช้ค่า env ก่อน ถ้ามี (CREDIT_CHARS_PER_YAM) · ตั้งค่านี้เป็น fallback กลางที่อ่านจากฐานข้อมูล</p>
    </div>
  );
}
