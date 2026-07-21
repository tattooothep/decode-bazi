"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

export default function IamClient({ lang, acceptToken }: { lang: string; acceptToken: string }) {
  const { dict } = useAdminDict();
  const [data, setData] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("support");
  const [msg, setMsg] = useState("");
  const [inviteToken, setInviteToken] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/iam").then((x) => x.json()).catch(() => null);
    if (r?.ok) setData(r);
    else if (r?.error) setMsg(String(r.error));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!acceptToken) return;
    (async () => {
      const r = await fetch("/api/admin/iam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_invite", token: acceptToken }),
      }).then((x) => x.json()).catch(() => null);
      setMsg(r?.ok ? "Invite accepted" : `Accept failed: ${r?.error}`);
      await load();
    })();
  }, [acceptToken, load]);

  const grant = async () => {
    setMsg("…");
    const r = await fetch("/api/admin/iam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant", email, role_key: roleKey }),
    }).then((x) => x.json()).catch(() => null);
    setMsg(r?.ok ? dict["ok"] : `${dict["err"]}: ${r?.error}`);
    await load();
  };

  const invite = async () => {
    setMsg("…");
    const r = await fetch("/api/admin/iam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invite", email, role_key: roleKey }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setInviteToken(r.token || "");
      setMsg(`${dict["ok"]} · share link: ${r.accept_path}`);
    } else setMsg(`${dict["err"]}: ${r?.error}`);
    await load();
  };

  const revoke = async (grantId: string) => {
    if (!confirm("Revoke role?")) return;
    await fetch("/api/admin/iam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", grant_id: grantId }),
    });
    await load();
  };

  return (
    <AdminShell titleKey="title.iam" locale={lang}>
      <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-100/90">
        Break-glass: ADMIN_EMAILS always full access · DB roles for multi-admin ·{" "}
        {data?.break_glass_emails?.join(", ") || "—"}
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-2 text-sm font-medium">{dict["action.grant"]} / {dict["action.invite"]}</div>
        <div className="flex flex-wrap gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@…" className="min-w-[200px] flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm" />
          <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className="rounded-xl border border-white/15 bg-black/30 px-2 py-2 text-sm">
            {(data?.roles || [{ key: "support" }, { key: "ops" }, { key: "finance" }, { key: "readonly" }]).map((r: any) => (
              <option key={r.key} value={r.key}>{r.key}{r.name_th ? ` · ${r.name_th}` : ""}</option>
            ))}
          </select>
          <button type="button" onClick={grant} className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100">{dict["action.grant"]}</button>
          <button type="button" onClick={invite} className="rounded-xl border border-white/20 px-3 py-2 text-sm">{dict["action.invite"]}</button>
        </div>
        {msg && <div className="mt-2 text-xs text-cyan-200/90">{msg}</div>}
        {inviteToken && <div className="mt-1 break-all font-mono text-[10px] text-white/40">token: {inviteToken}</div>}
      </div>

      <div className="mb-6">
        <h2 className="mb-2 font-serif text-lg">Staff</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 text-xs uppercase text-white/40">
              <tr><th className="p-2 text-left">email</th><th className="p-2">role</th><th className="p-2">granted</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {(data?.staff || []).map((s: any) => (
                <tr key={s.grant_id} className="border-b border-white/5">
                  <td className="p-2">{s.email}</td>
                  <td className="p-2 text-center">{s.role_key}</td>
                  <td className="p-2 text-center text-xs text-white/40">{s.granted_at ? new Date(s.granted_at).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-right">
                    <button type="button" onClick={() => revoke(s.grant_id)} className="text-xs text-rose-300">revoke</button>
                  </td>
                </tr>
              ))}
              {!data?.staff?.length && <tr><td colSpan={4} className="p-4 text-center text-white/40">{dict["empty"]}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-serif text-lg">Roles</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(data?.roles || []).map((r: any) => (
            <div key={r.id || r.key} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="font-medium">{r.key} {r.is_super ? "★" : ""}</div>
              <div className="text-xs text-white/50">{r.name_th} · {r.name_en}</div>
              <div className="mt-1 text-xs text-white/40">{r.description}</div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
