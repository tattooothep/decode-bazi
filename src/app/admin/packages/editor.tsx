"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Pkg = {
  id?: string; code: string; name_th: string; name_en?: string; name_zh?: string;
  kind: string; price_thb: number; yam: number; bonus_yam: number;
  duration_days?: number | null; grants_tier?: string | null; sort: number; badge?: string | null; active: boolean;
};
type Coupon = { id?: string; code: string; kind: string; value: number; max_uses?: number | null; used_count?: number; expires_at?: string | null; active: boolean };

const blankPkg: Pkg = { code: "", name_th: "", kind: "topup", price_thb: 0, yam: 0, bonus_yam: 0, sort: 0, active: true };
const blankCoupon: Coupon = { code: "", kind: "bonus_yam", value: 0, active: true };
const baht = (n: number) => "฿" + (n || 0).toLocaleString();

export default function PackagesAdmin() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [editP, setEditP] = useState<Pkg | null>(null);
  const [editC, setEditC] = useState<Coupon | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/packages").then((x) => x.json());
    if (r.ok) { setPackages(r.packages); setCoupons(r.coupons); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setMsg("กำลังบันทึก…");
    const r = await fetch("/api/admin/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setMsg("✓ สำเร็จ"); setEditP(null); setEditC(null); await load(); }
    else setMsg("✗ " + (r?.error || "ผิดพลาด"));
  };

  return (
    <div className="min-h-screen px-5 py-8 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="font-serif text-2xl">แพ็คเกจ &amp; คูปอง</h1>
        <Link href="/admin" className="text-sm opacity-60 hover:opacity-100">← หลังบ้าน</Link>
      </div>
      {msg && <div className="text-sm opacity-70 mb-3">{msg}</div>}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider opacity-50">แพ็คเกจ ({packages.length})</h2>
        <button onClick={() => setEditP({ ...blankPkg })} className="text-sm border border-foreground/30 px-3 py-1 hover:bg-foreground/10">+ เพิ่มแพ็ค</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {packages.map((p) => (
          <div key={p.id} className={`border p-4 ${p.active ? "border-foreground/20" : "border-foreground/10 opacity-50"}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-serif text-lg">{p.name_th} {p.badge && <span className="text-xs bg-foreground/15 px-1.5 py-0.5 align-middle">{p.badge}</span>}</div>
                <div className="text-xs opacity-50">{p.code} · {p.kind}</div>
              </div>
              <button onClick={() => setEditP(p)} className="text-xs opacity-60 hover:opacity-100">แก้</button>
            </div>
            <div className="mt-2 text-sm flex gap-4">
              <span className="font-serif text-xl">{baht(p.price_thb)}</span>
              <span className="opacity-70">{p.yam}{p.bonus_yam ? `+${p.bonus_yam}` : ""} ยาม</span>
              {p.duration_days && <span className="opacity-50 text-xs self-center">{p.duration_days} วัน</span>}
            </div>
          </div>
        ))}
        {!packages.length && <div className="opacity-40 text-sm col-span-2 border border-foreground/10 p-6 text-center">ยังไม่มีแพ็คเกจ — กด “+ เพิ่มแพ็ค”</div>}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider opacity-50">คูปอง ({coupons.length})</h2>
        <button onClick={() => setEditC({ ...blankCoupon })} className="text-sm border border-foreground/30 px-3 py-1 hover:bg-foreground/10">+ เพิ่มคูปอง</button>
      </div>
      <div className="border border-foreground/15">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase opacity-50 border-b border-foreground/15"><tr><th className="text-left p-2">โค้ด</th><th className="p-2">ชนิด</th><th className="p-2">ค่า</th><th className="p-2">ใช้แล้ว</th><th className="p-2">หมดอายุ</th><th className="p-2"></th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-b border-foreground/8">
                <td className="p-2 font-mono">{c.code}</td>
                <td className="p-2 text-center text-xs opacity-70">{c.kind}</td>
                <td className="p-2 text-center">{c.value}</td>
                <td className="p-2 text-center opacity-60">{c.used_count ?? 0}{c.max_uses ? `/${c.max_uses}` : ""}</td>
                <td className="p-2 text-center text-xs opacity-50">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("th-TH") : "—"}</td>
                <td className="p-2 text-right"><button onClick={() => setEditC(c)} className="text-xs opacity-60 hover:opacity-100">แก้</button></td>
              </tr>
            ))}
            {!coupons.length && <tr><td colSpan={6} className="p-5 text-center opacity-40">ยังไม่มีคูปอง</td></tr>}
          </tbody>
        </table>
      </div>

      {editP && <PkgModal p={editP} onClose={() => setEditP(null)} onSave={(p) => post({ action: "save_package", ...p })} onDelete={editP.id ? () => post({ action: "delete_package", id: editP.id }) : undefined} />}
      {editC && <CouponModal c={editC} onClose={() => setEditC(null)} onSave={(c) => post({ action: "save_coupon", ...c })} onDelete={editC.id ? () => post({ action: "delete_coupon", id: editC.id }) : undefined} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs opacity-60 block mb-0.5">{label}</span>{children}</label>;
}
const inp = "bg-transparent border border-foreground/20 px-2 py-1 w-full text-sm";

function PkgModal({ p, onClose, onSave, onDelete }: { p: Pkg; onClose: () => void; onSave: (p: Pkg) => void; onDelete?: () => void }) {
  const [f, setF] = useState<Pkg>(p);
  const set = (k: keyof Pkg, v: any) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal onClose={onClose} title={p.id ? "แก้แพ็คเกจ" : "เพิ่มแพ็คเกจ"}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="code (unique)"><input className={inp} value={f.code} onChange={(e) => set("code", e.target.value)} /></Field>
        <Field label="ชนิด"><select className={inp} value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="topup">เติมยาม</option><option value="subscription">สมาชิก</option></select></Field>
        <Field label="ชื่อ (ไทย)"><input className={inp} value={f.name_th} onChange={(e) => set("name_th", e.target.value)} /></Field>
        <Field label="ชื่อ (EN)"><input className={inp} value={f.name_en || ""} onChange={(e) => set("name_en", e.target.value)} /></Field>
        <Field label="ราคา (บาท)"><input type="number" className={inp} value={f.price_thb} onChange={(e) => set("price_thb", +e.target.value)} /></Field>
        <Field label="ชื่อ (中文)"><input className={inp} value={f.name_zh || ""} onChange={(e) => set("name_zh", e.target.value)} /></Field>
        <Field label="ยามที่ได้"><input type="number" className={inp} value={f.yam} onChange={(e) => set("yam", +e.target.value)} /></Field>
        <Field label="ยามโบนัส"><input type="number" className={inp} value={f.bonus_yam} onChange={(e) => set("bonus_yam", +e.target.value)} /></Field>
        <Field label="อายุ (วัน · ว่าง=ไม่หมด)"><input type="number" className={inp} value={f.duration_days ?? ""} onChange={(e) => set("duration_days", e.target.value ? +e.target.value : null)} /></Field>
        <Field label="ปลดล็อก tier (ว่าง=ไม่เปลี่ยน)"><input className={inp} value={f.grants_tier || ""} onChange={(e) => set("grants_tier", e.target.value)} placeholder="pro / vip" /></Field>
        <Field label="ลำดับ"><input type="number" className={inp} value={f.sort} onChange={(e) => set("sort", +e.target.value)} /></Field>
        <Field label="ป้าย (badge)"><input className={inp} value={f.badge || ""} onChange={(e) => set("badge", e.target.value)} placeholder="คุ้มสุด" /></Field>
      </div>
      <label className="flex items-center gap-2 mt-3 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> เปิดขาย</label>
      <ModalActions onSave={() => onSave(f)} onDelete={onDelete} onClose={onClose} />
    </Modal>
  );
}

function CouponModal({ c, onClose, onSave, onDelete }: { c: Coupon; onClose: () => void; onSave: (c: Coupon) => void; onDelete?: () => void }) {
  const [f, setF] = useState<Coupon>(c);
  const set = (k: keyof Coupon, v: any) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal onClose={onClose} title={c.id ? "แก้คูปอง" : "เพิ่มคูปอง"}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="โค้ด"><input className={inp} value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
        <Field label="ชนิด"><select className={inp} value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="bonus_yam">โบนัสยาม</option><option value="percent_off">ลด %</option><option value="fixed_off">ลดบาท</option></select></Field>
        <Field label="ค่า"><input type="number" className={inp} value={f.value} onChange={(e) => set("value", +e.target.value)} /></Field>
        <Field label="ใช้ได้สูงสุด (ว่าง=ไม่จำกัด)"><input type="number" className={inp} value={f.max_uses ?? ""} onChange={(e) => set("max_uses", e.target.value ? +e.target.value : null)} /></Field>
        <Field label="หมดอายุ"><input type="date" className={inp} value={f.expires_at ? String(f.expires_at).slice(0, 10) : ""} onChange={(e) => set("expires_at", e.target.value || null)} /></Field>
      </div>
      <label className="flex items-center gap-2 mt-3 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> เปิดใช้</label>
      <ModalActions onSave={() => onSave(f)} onDelete={onDelete} onClose={onClose} />
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 overflow-auto z-50" onClick={onClose}>
      <div className="bg-background border border-foreground/20 max-w-lg w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif text-xl mb-4">{title}</div>
        {children}
      </div>
    </div>
  );
}
function ModalActions({ onSave, onDelete, onClose }: { onSave: () => void; onDelete?: () => void; onClose: () => void }) {
  return (
    <div className="flex justify-between mt-5">
      <div>{onDelete && <button onClick={() => { if (confirm("ลบรายการนี้?")) onDelete(); }} className="text-sm text-rose-500 border border-rose-500/30 px-3 py-1.5 hover:bg-rose-500/10">ลบ</button>}</div>
      <div className="flex gap-2">
        <button onClick={onClose} className="text-sm border border-foreground/20 px-3 py-1.5">ยกเลิก</button>
        <button onClick={onSave} className="text-sm border border-foreground/40 px-4 py-1.5 hover:bg-foreground/10">บันทึก</button>
      </div>
    </div>
  );
}
