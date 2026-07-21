"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

type Row = {
  id: string; email: string; name: string | null; tier: string;
  hour_balance: number; sub_expires_at: string | null; is_active: boolean;
  created_at: string; last_active_at: string | null;
};

const TIERS = ["free", "premium", "master"] as const;

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("th-TH", { year: "2-digit", month: "short", day: "numeric" }) : "—";

export default function MembersAdmin() {
  const { dict, locale } = useAdminDict();
  const sp = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [active, setActive] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ search, tier, active, sort, page: String(page), limit: String(limit) });
    const r = await fetch(`/api/admin/members?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setRows(r.rows); setTotal(r.total); }
    setLoading(false);
  }, [search, tier, active, sort, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminShell titleKey="title.members" locale={locale}>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={dict["search.placeholder"]}
          className="min-w-[200px] flex-1 rounded-xl border border-white/15 bg-black/20 px-3 py-2 backdrop-blur"
        />
        <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} className="rounded-xl border border-white/15 bg-black/20 px-2 py-2">
          <option value="">{dict["filter.all_tiers"]}</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} className="rounded-xl border border-white/15 bg-black/20 px-2 py-2">
          <option value="">{dict["filter.all_status"]}</option>
          <option value="1">{dict["filter.active"]}</option>
          <option value="0">{dict["filter.suspended"]}</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-xl border border-white/15 bg-black/20 px-2 py-2">
          <option value="created">newest</option>
          <option value="balance">balance</option>
          <option value="active">last active</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 backdrop-blur">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
            <tr>
              <th className="p-3 text-left">{dict["col.email"]}</th>
              <th className="p-3 text-left">{dict["col.name"]}</th>
              <th className="p-3">{dict["col.tier"]}</th>
              <th className="p-3">{dict["col.yam"]}</th>
              <th className="p-3">{dict["col.joined"]}</th>
              <th className="p-3">{dict["col.status"]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3">
                  <Link href={`/admin/users/${r.id}?lang=${sp.get("lang") || locale}`} className="text-cyan-200 hover:underline">
                    {r.email}
                  </Link>
                </td>
                <td className="p-3 text-white/70">{r.name || "—"}</td>
                <td className="p-3 text-center">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs">{r.tier}</span>
                </td>
                <td className="p-3 text-center font-mono">{r.hour_balance}</td>
                <td className="p-3 text-center text-xs text-white/50">{fmt(r.created_at)}</td>
                <td className="p-3 text-center">{r.is_active ? "🟢" : "🔴"}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={6} className="p-8 text-center text-white/40">{dict["empty"]}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-white/60">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-white/15 px-3 py-1 disabled:opacity-30">←</button>
        <span>{page} / {Math.max(1, Math.ceil(total / limit))} · {total}</span>
        <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-white/15 px-3 py-1 disabled:opacity-30">→</button>
      </div>
    </AdminShell>
  );
}
