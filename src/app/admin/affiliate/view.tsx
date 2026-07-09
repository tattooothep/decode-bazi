"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

type Dash = {
  settings: Record<string, unknown>;
  totals: Record<string, number>;
  members: any[];
  rewards: any[];
  attributions: any[];
  audit: any[];
};

const baht = (n: number) => "฿" + Number(n || 0).toLocaleString("th-TH");
const fmtDt = (d?: string | null) => d ? new Date(d).toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AffiliateAdmin() {
  const [tab, setTab] = useState<"members" | "rewards" | "signups" | "audit">("members");
  const [data, setData] = useState<Dash | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/affiliate", { cache: "no-store" }).then((x) => x.json());
    if (r.ok) { setData(r); setErr(""); } else setErr(r.error || "load failed");
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>) {
    setBusy(String(body.action || "action"));
    setErr("");
    const r = await fetch("/api/admin/affiliate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    setBusy("");
    if (!r.ok) { setErr(r.error || "action failed"); return; }
    await load();
  }

  const totals = data?.totals || {};
  return (
    <div className="min-h-screen px-5 py-8 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <div>
          <h1 className="font-serif text-2xl">Affiliate Pilot</h1>
          <p className="text-sm opacity-55 mt-1">direct only · pending hold · manual approval/payout · refund reversal guard</p>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="/api/admin/affiliate?format=csv" className="border border-foreground/20 px-3 py-1.5 hover:bg-foreground/10">Export CSV</a>
          <Link href="/admin" className="border border-foreground/20 px-3 py-1.5 hover:bg-foreground/10">← หลังบ้าน</Link>
        </div>
      </div>

      {err && <div className="mb-4 border border-red-500/35 bg-red-500/10 text-red-300 px-3 py-2 text-sm">{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        <Card label="active" value={String(totals.active_members || 0)} />
        <Card label="requested" value={String(totals.requested_members || 0)} />
        <Card label="signups" value={String(totals.signups || 0)} sub={`${totals.flagged_signups || 0} flagged`} />
        <Card label="pending" value={baht(totals.pending_thb || 0)} />
        <Card label="approved" value={baht(totals.approved_thb || 0)} />
        <Card label="paid" value={baht(totals.paid_thb || 0)} />
      </div>

      <div className="border border-foreground/15 p-3 mb-5 flex flex-col md:flex-row gap-2 md:items-center">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email ของเพื่อนที่จะ approve" className="bg-transparent border border-foreground/20 px-3 py-2 text-sm min-w-0 md:w-80" />
        <button disabled={!email || !!busy} onClick={() => act({ action: "approve_member", email })} className="border border-emerald-500/40 text-emerald-300 px-4 py-2 text-sm disabled:opacity-40">Approve member</button>
        <span className="text-xs opacity-45">Pilot allowlist: ไม่ approve = code ไม่ active</span>
      </div>

      <div className="flex gap-1 mb-4 text-sm flex-wrap">
        {([["members", "Members"], ["rewards", "Rewards"], ["signups", "Signups"], ["audit", "Audit"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 border ${tab === k ? "border-foreground/50 bg-foreground/10" : "border-foreground/15"}`}>{label}</button>
        ))}
      </div>

      {tab === "members" && (
        <Table heads={["email", "code", "status", "signups", "pending", "approved", "paid", "action"]}>
          {(data?.members || []).map((m) => (
            <tr key={m.user_id} className="border-b border-foreground/8">
              <td className="p-2">{m.email}</td>
              <td className="p-2 font-mono text-xs">{m.code}</td>
              <td className="p-2">{m.status}</td>
              <td className="p-2 text-center">{m.signups}</td>
              <td className="p-2 text-center">{baht(m.pending_thb)}</td>
              <td className="p-2 text-center">{baht(m.approved_thb)}</td>
              <td className="p-2 text-center">{baht(m.paid_thb)}</td>
              <td className="p-2 flex gap-1 flex-wrap">
                {m.status !== "active" && <button className="mini good" onClick={() => act({ action: "approve_member", userId: m.user_id })}>approve</button>}
                {m.status === "active" && <button className="mini warn" onClick={() => act({ action: "suspend_member", userId: m.user_id })}>suspend</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "rewards" && (
        <Table heads={["created", "referrer", "referred", "package", "order", "status", "hold", "commission", "action"]}>
          {(data?.rewards || []).map((r) => (
            <tr key={r.id} className="border-b border-foreground/8">
              <td className="p-2 text-xs opacity-60">{fmtDt(r.created_at)}</td>
              <td className="p-2">{r.referrer_email}</td>
              <td className="p-2">{r.referred_email}</td>
              <td className="p-2">{r.package_code || "—"}</td>
              <td className="p-2 font-mono text-[11px]">{r.order_id}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2 text-xs">{fmtDt(r.hold_until)}</td>
              <td className="p-2 text-center">{baht(r.commission_thb)}</td>
              <td className="p-2 flex gap-1 flex-wrap">
                {r.status === "pending" && <button className="mini good" onClick={() => act({ action: "approve_reward", rewardId: r.id, overrideHold: true })}>approve</button>}
                {r.status === "approved" && <button className="mini good" onClick={() => act({ action: "mark_paid", rewardId: r.id, payoutRef: prompt("payout ref") || "" })}>paid</button>}
                {["pending", "approved", "paid"].includes(r.status) && <button className="mini warn" onClick={() => act({ action: "reverse_order", orderId: r.order_id, reason: "admin_reverse" })}>reverse</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "signups" && (
        <Table heads={["created", "referrer", "referred", "code", "status", "flags", "action"]}>
          {(data?.attributions || []).map((a) => (
            <tr key={a.id} className="border-b border-foreground/8">
              <td className="p-2 text-xs opacity-60">{fmtDt(a.created_at)}</td>
              <td className="p-2">{a.referrer_email}</td>
              <td className="p-2">{a.referred_email}</td>
              <td className="p-2 font-mono text-xs">{a.code}</td>
              <td className="p-2">{a.status}</td>
              <td className="p-2 text-xs opacity-70">{JSON.stringify(a.fraud_flags || [])}</td>
              <td className="p-2 flex gap-1 flex-wrap">
                {a.status !== "active" && <button className="mini good" onClick={() => act({ action: "approve_signup", attributionId: a.id })}>approve</button>}
                {a.status !== "rejected" && <button className="mini warn" onClick={() => act({ action: "block_signup", attributionId: a.id, reason: "admin_block" })}>block</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "audit" && (
        <Table heads={["time", "event", "payload"]}>
          {(data?.audit || []).map((a, i) => (
            <tr key={i} className="border-b border-foreground/8">
              <td className="p-2 text-xs opacity-60">{fmtDt(a.created_at)}</td>
              <td className="p-2">{a.event_type}</td>
              <td className="p-2 font-mono text-[11px] opacity-70">{JSON.stringify(a.payload)}</td>
            </tr>
          ))}
        </Table>
      )}

      <style jsx>{`
        .mini{border:1px solid rgba(255,255,255,.18);padding:3px 7px;font-size:11px}
        .mini.good{border-color:rgba(16,185,129,.45);color:#7ee0b0}
        .mini.warn{border-color:rgba(245,158,11,.45);color:#f3c36b}
      `}</style>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="border border-foreground/15 p-3"><div className="text-xs opacity-50">{label}</div><div className="font-serif text-xl mt-1">{value}</div>{sub && <div className="text-xs opacity-40">{sub}</div>}</div>;
}

function Table({ heads, children }: { heads: string[]; children: ReactNode }) {
  return (
    <div className="border border-foreground/15 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase opacity-50 border-b border-foreground/15"><tr>{heads.map((h) => <th key={h} className="text-left p-2">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
