"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Row = {
  id: string; email: string; name: string | null; tier: string;
  hour_balance: number; sub_expires_at: string | null; is_active: boolean;
  created_at: string; last_active_at: string | null;
};
type Detail = {
  user: Record<string, any>; profiles: number; chats: number;
  txns: { delta: number; reason: string; balance_after: number; ref_feature: string | null; note: string | null; created_at: string }[];
  orders: any[];
};

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("th-TH", { year: "2-digit", month: "short", day: "numeric" }) : "—";
const fmtDt = (d: string) => new Date(d).toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function MembersAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [active, setActive] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("");
  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ search, tier, active, sort, page: String(page), limit: String(limit) });
    const r = await fetch(`/api/admin/members?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setRows(r.rows); setTotal(r.total); }
    setLoading(false);
  }, [search, tier, active, sort, page]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setMsg("");
    const r = await fetch(`/api/admin/members?id=${id}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setSel(r);
  };

  const act = async (id: string, action: string, extra: Record<string, unknown>) => {
    setMsg("กำลังทำ…");
    const r = await fetch(`/api/admin/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, ...extra }) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setMsg("✓ สำเร็จ"); await openDetail(id); await load(); }
    else setMsg("✗ " + (r?.error || "ผิดพลาด"));
  };

  return (
    <div className="min-h-screen px-5 py-8 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="font-serif text-2xl">สมาชิก <span className="text-sm opacity-50">({total})</span></h1>
        <Link href="/admin" className="text-sm opacity-60 hover:opacity-100">← หลังบ้าน</Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="ค้น email / ชื่อ / เบอร์" className="bg-transparent border border-foreground/20 px-3 py-1.5 flex-1 min-w-[200px]" />
        <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} className="bg-transparent border border-foreground/20 px-2 py-1.5">
          <option value="">ทุก tier</option><option value="free">free</option><option value="pro">pro</option><option value="vip">vip</option>
        </select>
        <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} className="bg-transparent border border-foreground/20 px-2 py-1.5">
          <option value="">ทุกสถานะ</option><option value="1">active</option><option value="0">ระงับ</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-transparent border border-foreground/20 px-2 py-1.5">
          <option value="created">ใหม่สุด</option><option value="balance">ยามมากสุด</option><option value="active">ใช้ล่าสุด</option>
        </select>
      </div>

      <div className="border border-foreground/15 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase opacity-50 border-b border-foreground/15">
            <tr><th className="text-left p-2">email</th><th className="text-left p-2">ชื่อ</th><th className="p-2">tier</th><th className="p-2">ยาม</th><th className="p-2">สมัคร</th><th className="p-2">สถานะ</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => openDetail(r.id)} className="border-b border-foreground/8 hover:bg-foreground/5 cursor-pointer">
                <td className="p-2">{r.email}</td>
                <td className="p-2 opacity-70">{r.name || "—"}</td>
                <td className="p-2 text-center">{r.tier}</td>
                <td className="p-2 text-center font-mono">{r.hour_balance}</td>
                <td className="p-2 text-center opacity-60 text-xs">{fmt(r.created_at)}</td>
                <td className="p-2 text-center">{r.is_active ? "🟢" : "🔴"}</td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={6} className="p-6 text-center opacity-50">ไม่พบสมาชิก</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-3 text-sm">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30 px-3 py-1 border border-foreground/20">← ก่อน</button>
        <span className="opacity-60">หน้า {page} / {Math.max(1, Math.ceil(total / limit))}</span>
        <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30 px-3 py-1 border border-foreground/20">ถัดไป →</button>
      </div>

      {sel && <DetailModal d={sel} onClose={() => setSel(null)} onAct={act} msg={msg} />}
    </div>
  );
}

function DetailModal({ d, onClose, onAct, msg }: { d: Detail; onClose: () => void; onAct: (id: string, a: string, e: Record<string, unknown>) => void; msg: string }) {
  const u = d.user;
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("30");
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 overflow-auto z-50" onClick={onClose}>
      <div className="bg-background border border-foreground/20 max-w-2xl w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-serif text-xl">{u.email}</div>
            <div className="text-sm opacity-60">{u.name || "—"} · {u.phone || "ไม่มีเบอร์"}</div>
          </div>
          <button onClick={onClose} className="opacity-50 hover:opacity-100 text-xl">✕</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
          <Stat label="ยามคงเหลือ" value={u.hour_balance} />
          <Stat label="tier" value={u.tier} />
          <Stat label="ดวงที่บันทึก" value={d.profiles} />
          <Stat label="แชทซินแส" value={d.chats} />
          <Stat label="สมัคร" value={fmt(u.created_at)} />
          <Stat label="ใช้ล่าสุด" value={fmt(u.last_active_at)} />
          <Stat label="สมาชิกหมด" value={fmt(u.sub_expires_at)} />
          <Stat label="สถานะ" value={u.is_active ? "🟢 active" : "🔴 ระงับ"} />
        </div>

        <div className="border-t border-foreground/15 pt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="opacity-60 w-20">เติม/หักยาม</span>
            <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+100 หรือ -50" className="bg-transparent border border-foreground/20 px-2 py-1 w-28" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ" className="bg-transparent border border-foreground/20 px-2 py-1 flex-1 min-w-[120px]" />
            <button onClick={() => onAct(u.id, "adjust_credit", { delta: Number(delta), note })} className="border border-foreground/30 px-3 py-1 hover:bg-foreground/10">ปรับ</button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="opacity-60 w-20">tier</span>
            {["free", "pro", "vip"].map((t) => <button key={t} onClick={() => onAct(u.id, "set_tier", { tier: t })} className={`border px-3 py-1 ${u.tier === t ? "border-foreground/60 bg-foreground/10" : "border-foreground/20"}`}>{t}</button>)}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="opacity-60 w-20">สมาชิก</span>
            <input value={days} onChange={(e) => setDays(e.target.value)} className="bg-transparent border border-foreground/20 px-2 py-1 w-20" />
            <span className="opacity-60">วัน</span>
            <button onClick={() => onAct(u.id, "extend_sub", { days: Number(days) })} className="border border-foreground/30 px-3 py-1 hover:bg-foreground/10">ต่ออายุ</button>
          </div>
          <div className="flex gap-2 items-center">
            <span className="opacity-60 w-20">สถานะ</span>
            <button onClick={() => onAct(u.id, "set_active", { active: !u.is_active })} className="border border-foreground/30 px-3 py-1 hover:bg-foreground/10">{u.is_active ? "🔴 ระงับบัญชี" : "🟢 คืนสถานะ"}</button>
            {msg && <span className="opacity-70 text-xs">{msg}</span>}
          </div>
        </div>

        <div className="border-t border-foreground/15 pt-3 mt-4">
          <div className="text-xs uppercase opacity-50 mb-2">ประวัติยาม (50 ล่าสุด)</div>
          <div className="max-h-52 overflow-auto text-xs">
            {d.txns.map((t, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-foreground/8">
                <span className="opacity-60">{fmtDt(t.created_at)}</span>
                <span className="opacity-70 flex-1 px-2 truncate">{t.reason}{t.note ? ` · ${t.note}` : ""}</span>
                <span className={`font-mono ${t.delta >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{t.delta >= 0 ? "+" : ""}{t.delta}</span>
                <span className="font-mono opacity-50 w-14 text-right">{t.balance_after}</span>
              </div>
            ))}
            {!d.txns.length && <div className="opacity-50 py-2">ยังไม่มีประวัติ</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="border border-foreground/10 p-2"><div className="text-xs opacity-50">{label}</div><div className="font-mono">{value}</div></div>;
}
