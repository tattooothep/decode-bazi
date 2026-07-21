"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

export default function SupportClient({ lang }: { lang: string }) {
  const { dict, locale } = useAdminDict();
  const [rows, setRows] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    const r = await fetch(`/api/admin/support?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setRows(r.rows || []);
      setReports(r.reports || []);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setMsg("…");
    const r = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", subject, body, user_id: userId || null }),
    }).then((x) => x.json()).catch(() => null);
    setMsg(r?.ok ? dict["ok"] : `${dict["err"]}: ${r?.error}`);
    setBody("");
    await load();
  };

  const setSt = async (id: string, st: string) => {
    await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", ticket_id: id, status: st }),
    });
    await load();
  };

  return (
    <AdminShell title={dict["nav.support"] || "Support"} locale={lang}>
      <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-2 text-sm font-medium">New ticket</div>
        <div className="flex flex-wrap gap-2">
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user uuid (optional)" className="min-w-[200px] flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="subject" className="min-w-[160px] rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm" />
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="message" className="min-w-[200px] flex-[2] rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm" />
          <button type="button" onClick={create} className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100">{dict["action.save"]}</button>
        </div>
        {msg && <div className="mt-2 text-xs text-cyan-200">{msg}</div>}
      </div>

      <div className="mb-3 flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-white/15 bg-black/20 px-2 py-1 text-sm">
          <option value="">all</option>
          <option value="open">open</option>
          <option value="pending">pending</option>
          <option value="resolved">resolved</option>
          <option value="closed">closed</option>
        </select>
      </div>

      <div className="space-y-2">
        {rows.map((t) => (
          <div key={t.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{t.subject}</div>
                <div className="text-xs text-white/40">
                  {t.user_email ? (
                    <Link href={`/admin/users/${t.user_id}?lang=${locale}`} className="text-cyan-200 hover:underline">{t.user_email}</Link>
                  ) : "—"}{" "}
                  · {t.status} · {t.priority}
                </div>
              </div>
              <div className="flex gap-1">
                {["open", "pending", "resolved", "closed"].map((st) => (
                  <button key={st} type="button" onClick={() => setSt(t.id, st)} className="rounded border border-white/10 px-2 py-0.5 text-[10px] uppercase text-white/50 hover:text-white">
                    {st}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 text-white/70">{t.body}</div>
          </div>
        ))}
        {!rows.length && <div className="text-white/40">{dict["empty"]}</div>}
      </div>

      {!!reports.length && (
        <div className="mt-8">
          <h2 className="mb-2 font-serif text-lg">User reports</h2>
          <div className="space-y-2 text-sm">
            {reports.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 p-3">
                <div className="text-xs text-white/40">{r.category} · {r.severity} · {r.status}</div>
                <div>{r.message}</div>
                {r.user_id && (
                  <Link href={`/admin/users/${r.user_id}?lang=${locale}`} className="text-xs text-cyan-200">→ user</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
