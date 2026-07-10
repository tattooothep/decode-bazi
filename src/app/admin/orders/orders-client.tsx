"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

export default function OrdersClient({ lang }: { lang: string }) {
  const { dict, locale } = useAdminDict();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (search) p.set("search", search);
    const r = await fetch(`/api/admin/orders?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setRows(r.rows || []);
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  const refund = async (id: string) => {
    if (!confirm("Refund + clawback yam + reverse affiliate?")) return;
    setMsg("…");
    const r = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refund", order_id: id, reason: "admin_orders_ui" }),
    }).then((x) => x.json()).catch(() => null);
    setMsg(r?.ok ? dict["ok"] : `${dict["err"]}: ${r?.error}`);
    await load();
  };

  return (
    <AdminShell titleKey="title.orders" locale={lang}>
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="email / pay_ref / package" className="min-w-[200px] flex-1 rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-white/15 bg-black/20 px-2 py-2 text-sm">
          <option value="">all</option>
          <option value="pending">pending</option>
          <option value="paid">paid</option>
          <option value="refunded">refunded</option>
          <option value="failed">failed</option>
        </select>
        <button type="button" onClick={() => load()} className="rounded-xl border border-white/20 px-3 py-2 text-sm">↻</button>
      </div>
      {msg && <div className="mb-2 text-xs text-cyan-200">{msg}</div>}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-xs uppercase text-white/45">
            <tr>
              <th className="p-2 text-left">email</th>
              <th className="p-2">package</th>
              <th className="p-2">฿</th>
              <th className="p-2">yam</th>
              <th className="p-2">status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-white/5">
                <td className="p-2">
                  <Link href={`/admin/users/${o.user_id}?lang=${locale}`} className="text-cyan-200 hover:underline">{o.email}</Link>
                  <div className="font-mono text-[10px] text-white/30">{o.pay_ref || o.id?.slice?.(0, 8)}</div>
                </td>
                <td className="p-2 text-center">{o.package_code}</td>
                <td className="p-2 text-center font-mono">{o.amount_thb}</td>
                <td className="p-2 text-center font-mono">{o.yam_granted}</td>
                <td className="p-2 text-center text-xs">{o.status}</td>
                <td className="p-2 text-right">
                  {o.status === "paid" && (
                    <button type="button" onClick={() => refund(o.id)} className="rounded border border-rose-400/30 px-2 py-0.5 text-xs text-rose-200">
                      {dict["action.refund"]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-white/40">{dict["empty"]}</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
