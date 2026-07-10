"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";

type Dash = {
  revenue: { paid_orders: number; total_thb: number; thb_30d: number; yam_sold: number };
  yam: { spent: number; given: number; outstanding: number };
  ai_cost: { total_thb: number; thb_30d: number; tokens: number };
  users: { total: number; paying: number; in_trial?: number; post_trial_free?: number };
  daily: { day: string; thb: number }[];
  byFeature: { feature: string; n: number; yam: number }[];
  margin?: {
    gross_thb: number;
    refunds_thb: number;
    net_revenue_thb: number;
    ai_cogs_thb: number;
    affiliate_paid_thb: number;
    affiliate_reserve_thb: number;
    gateway_fee_est_thb: number;
    contribution_thb: number;
  };
};
type Txn = { created_at: string; email: string; delta: number; reason: string; balance_after: number; ref_feature: string | null; note: string | null };

const baht = (n: number) => "฿" + (n || 0).toLocaleString("th-TH");
const fmtDt = (d: string) => new Date(d).toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function FinanceAdmin() {
  const [tab, setTab] = useState<"dash" | "txns" | "orders">("dash");
  const [dash, setDash] = useState<Dash | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [reason, setReason] = useState("");

  useEffect(() => { fetch("/api/admin/finance").then((r) => r.json()).then((r) => r.ok && setDash(r)); }, []);
  const loadTxns = useCallback(async () => {
    const p = new URLSearchParams({ view: "txns", reason });
    const r = await fetch(`/api/admin/finance?${p}`).then((x) => x.json());
    if (r.ok) setTxns(r.rows);
  }, [reason]);
  useEffect(() => { if (tab === "txns") loadTxns(); }, [tab, loadTxns]);
  useEffect(() => { if (tab === "orders") fetch("/api/admin/finance?view=orders").then((r) => r.json()).then((r) => r.ok && setOrders(r.rows)); }, [tab]);

  const maxDaily = Math.max(1, ...(dash?.daily || []).map((d) => d.thb));

  return (
    <AdminShell title="การเงิน · Finance">
      <div className="flex gap-1 mb-5 text-sm">
        {([["dash", "ภาพรวม"], ["txns", "ธุรกรรมยาม"], ["orders", "ออเดอร์"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 border ${tab === k ? "border-foreground/50 bg-foreground/10" : "border-foreground/15"}`}>{l}</button>
        ))}
      </div>

      {tab === "dash" && dash && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card label="รายได้รวม" value={baht(dash.revenue.total_thb)} sub={`${dash.revenue.paid_orders} ออเดอร์`} />
            <Card label="รายได้ 30 วัน" value={baht(dash.revenue.thb_30d)} />
            <Card label="ต้นทุน AI รวม" value={baht(dash.ai_cost.total_thb)} sub={`${dash.ai_cost.tokens.toLocaleString()} tokens`} />
            <Card label="ต้นทุน AI 30 วัน" value={baht(dash.ai_cost.thb_30d)} />
            <Card label="ยามที่ขาย" value={dash.revenue.yam_sold.toLocaleString()} />
            <Card label="ยามที่แจกฟรี" value={dash.yam.given.toLocaleString()} />
            <Card label="ยามที่ใช้ไป" value={dash.yam.spent.toLocaleString()} />
            <Card label="ยามคงค้าง (หนี้)" value={dash.yam.outstanding.toLocaleString()} sub={`${dash.users.total} user · ${dash.users.paying} จ่าย`} />
            <Card
              label="In trial"
              value={(dash.users.in_trial ?? 0).toLocaleString()}
              sub={`post-trial free ${(dash.users.post_trial_free ?? 0).toLocaleString()}`}
            />
            <Card label="Paying (sub active)" value={(dash.users.paying ?? 0).toLocaleString()} sub="premium/master + sub" />
          </div>
          {dash.margin && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Card label="Net revenue" value={baht(dash.margin.net_revenue_thb)} sub={`refunds ${baht(dash.margin.refunds_thb)}`} />
              <Card label="AI COGS" value={baht(dash.margin.ai_cogs_thb)} />
              <Card label="Affiliate paid" value={baht(dash.margin.affiliate_paid_thb)} sub={`reserve ${baht(dash.margin.affiliate_reserve_thb)}`} />
              <Card label="Contribution" value={baht(dash.margin.contribution_thb)} sub={`fee est ${baht(dash.margin.gateway_fee_est_thb)}`} />
            </div>
          )}

          <div className="border border-foreground/15 p-4 mb-6">
            <div className="text-xs uppercase opacity-50 mb-3">รายได้ 14 วัน</div>
            <div className="flex items-end gap-1 h-32">
              {dash.daily.length ? dash.daily.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end group">
                  <div className="w-full bg-foreground/30 group-hover:bg-foreground/50" style={{ height: `${(d.thb / maxDaily) * 100}%`, minHeight: d.thb ? "2px" : "0" }} title={baht(d.thb)} />
                  <div className="text-[9px] opacity-40 mt-1 rotate-45 origin-left">{d.day}</div>
                </div>
              )) : <div className="opacity-40 text-sm">ยังไม่มีรายได้</div>}
            </div>
          </div>

          <div className="border border-foreground/15 p-4">
            <div className="text-xs uppercase opacity-50 mb-3">ยามที่ใช้ แยกฟีเจอร์</div>
            {dash.byFeature.length ? dash.byFeature.map((f) => (
              <div key={f.feature} className="flex justify-between py-1 text-sm border-b border-foreground/8">
                <span className="opacity-70">{f.feature}</span>
                <span className="opacity-50 text-xs">{f.n} ครั้ง</span>
                <span className="font-mono">{f.yam.toLocaleString()} ยาม</span>
              </div>
            )) : <div className="opacity-40 text-sm">ยังไม่มีการใช้</div>}
          </div>
        </>
      )}

      {tab === "txns" && (
        <>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="กรอง reason (เช่น admin_adjust)" className="bg-transparent border border-foreground/20 px-3 py-1.5 text-sm mb-3 w-full max-w-xs" />
          <div className="border border-foreground/15">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase opacity-50 border-b border-foreground/15"><tr><th className="text-left p-2">เวลา</th><th className="text-left p-2">email</th><th className="text-left p-2">reason</th><th className="p-2">Δ</th><th className="p-2">คงเหลือ</th></tr></thead>
              <tbody>
                {txns.map((t, i) => (
                  <tr key={i} className="border-b border-foreground/8">
                    <td className="p-2 opacity-60 text-xs">{fmtDt(t.created_at)}</td>
                    <td className="p-2">{t.email}</td>
                    <td className="p-2 opacity-70 text-xs">{t.reason}{t.note ? ` · ${t.note}` : ""}</td>
                    <td className={`p-2 text-center font-mono ${t.delta >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{t.delta >= 0 ? "+" : ""}{t.delta}</td>
                    <td className="p-2 text-center font-mono opacity-60">{t.balance_after}</td>
                  </tr>
                ))}
                {!txns.length && <tr><td colSpan={5} className="p-6 text-center opacity-40">ไม่มีธุรกรรม</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "orders" && (
        <div className="border border-foreground/15">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase opacity-50 border-b border-foreground/15"><tr><th className="text-left p-2">เวลา</th><th className="text-left p-2">email</th><th className="text-left p-2">แพ็ค</th><th className="p-2">ราคา</th><th className="p-2">ยาม</th><th className="p-2">สถานะ</th></tr></thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={i} className="border-b border-foreground/8">
                  <td className="p-2 opacity-60 text-xs">{fmtDt(o.created_at)}</td>
                  <td className="p-2">{o.email}</td>
                  <td className="p-2 opacity-70">{o.package_code || "—"}</td>
                  <td className="p-2 text-center font-mono">{baht(o.amount_thb)}</td>
                  <td className="p-2 text-center font-mono">{o.yam_granted}</td>
                  <td className="p-2 text-center text-xs">{o.status}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={6} className="p-6 text-center opacity-40">ยังไม่มีออเดอร์</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-foreground/15 p-3">
      <div className="text-xs opacity-50">{label}</div>
      <div className="font-serif text-xl mt-1">{value}</div>
      {sub && <div className="text-xs opacity-40 mt-0.5">{sub}</div>}
    </div>
  );
}
