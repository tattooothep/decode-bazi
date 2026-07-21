"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

const PAYMENT_BADGES: Record<string, { label: string; className: string }> = {
  paid: { label: "จ่ายแล้ว · PAID", className: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200" },
  unpaid: { label: "ยังไม่จ่าย · UNPAID", className: "border-amber-400/35 bg-amber-400/10 text-amber-100" },
  refunded: { label: "คืนเงินแล้ว · REFUNDED", className: "border-violet-400/35 bg-violet-400/10 text-violet-200" },
  failed: { label: "ล้มเหลว · FAILED", className: "border-rose-400/35 bg-rose-400/10 text-rose-200" },
};

const LINK_BADGES: Record<string, { label: string; className: string }> = {
  complete: { label: "เชื่อมครบ", className: "text-emerald-200" },
  broken: { label: "ข้อมูลไม่ครบ", className: "text-rose-200" },
  unpaid: { label: "ยังไม่เติมเครดิต", className: "text-white/45" },
  refunded: { label: "ย้อนรายการแล้ว", className: "text-violet-200" },
  failed: { label: "ไม่สำเร็จ", className: "text-rose-200" },
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
}

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
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-white/15 bg-black/20 px-2 py-2 text-sm">
          <option value="">ทุกสถานะ</option>
          <option value="pending">ยังไม่จ่าย</option>
          <option value="paid">จ่ายแล้ว</option>
          <option value="refunded">คืนเงินแล้ว</option>
          <option value="failed">ล้มเหลว</option>
        </select>
        <button type="button" onClick={() => load()} className="inline-flex size-9 items-center justify-center rounded-md border border-white/20" title="รีเฟรชรายการ">
          <RefreshCw size={15} />
        </button>
      </div>
      {msg && <div className="mb-2 text-xs text-cyan-200">{msg}</div>}
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
        <div className="divide-y divide-white/10 md:hidden">
          {rows.map((o) => {
            const payment = PAYMENT_BADGES[o.payment_state] || PAYMENT_BADGES.unpaid;
            const linkage = LINK_BADGES[o.link_state] || LINK_BADGES.unpaid;
            return (
              <div key={o.id} className="space-y-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/users/${o.user_id}?lang=${locale}`} className="min-w-0 truncate text-cyan-200 hover:underline">{o.email}</Link>
                  <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-semibold ${payment.className}`}>{payment.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs">{o.package_code}</span>
                  <span className="font-mono">฿{Number(o.amount_thb || 0).toLocaleString("th-TH")}</span>
                  <span className="font-mono text-white/55">{Number(o.yam_granted || 0).toLocaleString("th-TH")} ยาม</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={linkage.className}>{linkage.label}</span>
                  <span className="text-white/40">{o.payment_state === "paid" ? "จ่าย " : "สร้าง "}{fmt(o.paid_at || o.created_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-[10px] text-white/30">{o.pay_ref || o.id}</span>
                  {o.status === "paid" && (
                    <button type="button" onClick={() => refund(o.id)} className="shrink-0 rounded-md border border-rose-400/30 px-2 py-1 text-xs text-rose-200">
                      {dict["action.refund"]}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!rows.length && <div className="p-6 text-center text-white/40">{dict["empty"]}</div>}
        </div>
        <table className="hidden min-w-[940px] w-full text-sm md:table">
          <thead className="border-b border-white/10 text-xs uppercase text-white/45">
            <tr>
              <th className="p-2 text-left">ผู้ใช้ / เวลา</th>
              <th className="p-2 text-left">แพ็กเกจ</th>
              <th className="p-2 text-right">ยอดเงิน</th>
              <th className="p-2 text-right">ยาม</th>
              <th className="p-2 text-left">สถานะเงิน</th>
              <th className="p-2 text-left">การเชื่อมระบบ</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const payment = PAYMENT_BADGES[o.payment_state] || PAYMENT_BADGES.unpaid;
              const linkage = LINK_BADGES[o.link_state] || LINK_BADGES.unpaid;
              return (
              <tr key={o.id} className="border-b border-white/5 align-top">
                <td className="p-2">
                  <Link href={`/admin/users/${o.user_id}?lang=${locale}`} className="text-cyan-200 hover:underline">{o.email}</Link>
                  <div className="mt-1 text-[11px] text-white/45">{o.payment_state === "paid" ? "จ่าย " : "สร้าง "}{fmt(o.paid_at || o.created_at)}</div>
                  <div className="max-w-[230px] truncate font-mono text-[10px] text-white/30" title={o.pay_ref || o.id}>{o.pay_ref || o.id}</div>
                </td>
                <td className="p-2">
                  <div className="font-mono text-xs">{o.package_code}</div>
                  <div className="mt-1 text-[11px] text-white/40">tier ปัจจุบัน: {o.user_tier || "—"}</div>
                </td>
                <td className="p-2 text-right font-mono">฿{Number(o.amount_thb || 0).toLocaleString("th-TH")}</td>
                <td className="p-2 text-right font-mono">{Number(o.yam_granted || 0).toLocaleString("th-TH")}</td>
                <td className="p-2">
                  <span className={`inline-flex rounded border px-2 py-1 text-[11px] font-semibold ${payment.className}`}>{payment.label}</span>
                  <div className="mt-1 text-[10px] text-white/35">{o.pay_method || "ไม่ระบุช่องทาง"}</div>
                </td>
                <td className="p-2 text-xs">
                  <div className={linkage.className}>{linkage.label}</div>
                  {o.payment_state === "paid" && (
                    <div className="mt-1 space-y-0.5 text-[10px] text-white/40">
                      <div>เครดิต: {o.credit_linked ? "linked" : "missing"}</div>
                      {o.subscription_package && <div>สมาชิก: {o.subscription_id ? (o.subscription_status || "linked") : "missing"}</div>}
                      {!!o.affiliate_reward_count && <div>affiliate: {o.affiliate_reward_count}</div>}
                    </div>
                  )}
                </td>
                <td className="p-2 text-right">
                  {o.status === "paid" && (
                    <button type="button" onClick={() => refund(o.id)} className="rounded-md border border-rose-400/30 px-2 py-1 text-xs text-rose-200">
                      {dict["action.refund"]}
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-white/40">{dict["empty"]}</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
