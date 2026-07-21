"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

export default function AiCostClient({ lang }: { lang: string }) {
  const { dict, locale } = useAdminDict();
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/ai-cost?days=30").then((x) => x.json()).catch(() => null);
    if (r?.ok) setData(r);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, on: boolean) => {
    setMsg("…");
    const r = await fetch("/api/admin/ai-cost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: on ? "on" : "off" }),
    }).then((x) => x.json()).catch(() => null);
    setMsg(r?.ok ? dict["ok"] : `${dict["err"]}: ${r?.error}`);
    await load();
  };

  const flags = data?.flags || {};

  return (
    <AdminShell title={dict["nav.aicost"] || "AI cost"} locale={lang}>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card label="Cost 30d" value={`฿${data?.totals?.cost_thb ?? 0}`} />
        <Card label="Tokens" value={data?.totals?.tokens ?? 0} />
        <Card label="Calls" value={data?.totals?.calls ?? 0} />
      </div>

      <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
        <div className="mb-2 text-sm font-medium">Kill switches</div>
        <div className="flex flex-wrap gap-2">
          {[
            ["ai_kill_switch", "Global AI kill"],
            ["feature_sifu", "Sifu"],
            ["feature_fusion", "Fusion"],
            ["feature_vision", "Vision"],
            ["feature_qimen_sifu", "Qi Men Sifu"],
            ["feature_palmistry", "Palmistry"],
          ].map(([k, label]) => {
            const on = flags[k] === "on";
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k, !on)}
                className={`rounded-full border px-3 py-1 text-xs ${on ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-white/15 text-white/50"}`}
              >
                {label}: {on ? "ON" : "OFF"}
              </button>
            );
          })}
        </div>
        {msg && <div className="mt-2 text-xs text-cyan-200">{msg}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-serif text-lg">By feature</h2>
          <div className="space-y-1 text-sm">
            {(data?.byFeature || []).map((f: any) => (
              <div key={f.feature} className="flex justify-between border-b border-white/5 py-1">
                <span>{f.feature}</span>
                <span className="font-mono text-white/60">฿{Math.round((f.cost_cents || 0) / 100)} · {f.n}x</span>
              </div>
            ))}
            {!data?.byFeature?.length && <div className="text-white/40">{dict["empty"]}</div>}
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-serif text-lg">Top users</h2>
          <div className="space-y-1 text-sm">
            {(data?.topUsers || []).map((u: any) => (
              <div key={u.user_id || u.email} className="flex justify-between border-b border-white/5 py-1">
                {u.user_id ? (
                  <Link href={`/admin/users/${u.user_id}?lang=${locale}`} className="text-cyan-200 hover:underline">{u.email || u.user_id?.slice?.(0, 8)}</Link>
                ) : (
                  <span>{u.email || "—"}</span>
                )}
                <span className="font-mono text-white/60">฿{Math.round((u.cost_cents || 0) / 100)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Card({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="text-[11px] uppercase text-white/40">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  );
}
