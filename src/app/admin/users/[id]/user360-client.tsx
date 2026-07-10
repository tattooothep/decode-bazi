"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

type ProductAccess = {
  plan: string;
  in_trial: boolean;
  trial_ends_at: string | null;
  sub_active: boolean;
  house_limit: number;
  fusion_max_sciences: number;
  fusion_max_profiles: number;
  book_max_sciences: number;
  book_synthesis: boolean;
  luopan_vision_max: number;
  datepick_max_people: number;
  fusion_suite: boolean;
  network_multi: boolean;
};

type Detail = {
  user: Record<string, any>;
  product_access?: ProductAccess | null;
  product_constants?: { free_signup_yam: number; trial_days: number };
  profiles: any[];
  profile_count: number;
  chats: number;
  txns: any[];
  orders: any[];
  notes: any[];
  affiliate: any;
  signup_peers?: {
    same_device: { id: string; email: string; created_at: string }[];
    same_ip: { id: string; email: string; created_at: string }[];
    same_device_count: number;
    same_ip_count: number;
  };
  caps: Record<string, boolean>;
};

const TIERS = ["free", "premium", "master"] as const;
const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function User360Client({ userId, lang }: { userId: string; lang: string }) {
  const { dict, locale } = useAdminDict();
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState("overview");
  const [msg, setMsg] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("30");
  const [noteBody, setNoteBody] = useState("");
  const [devices, setDevices] = useState<any[]>([]);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [impReason, setImpReason] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/members?id=${userId}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [userId]);

  const loadDevices = useCallback(async () => {
    const r = await fetch(`/api/admin/users/${userId}/devices`).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setDevices(r.devices || []);
      setSessionVersion(r.session_version || 0);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "devices") loadDevices(); }, [tab, loadDevices]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setMsg("…");
    const r = await fetch(`/api/admin/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, action, ...extra }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setMsg(dict["ok"]); await load(); }
    else setMsg(`${dict["err"]}: ${r?.error || r?.message || "?"}`);
  };

  const refund = async (orderId: string) => {
    if (!confirm("Refund + clawback yam?")) return;
    setMsg("…");
    const r = await fetch(`/api/admin/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refund", order_id: orderId, reason: "admin_user360_refund" }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setMsg(dict["ok"]); await load(); }
    else setMsg(`${dict["err"]}: ${r?.error || "?"}`);
  };

  const u = d?.user;
  const caps = d?.caps || {};
  const pa = d?.product_access;
  const tabs = [
    ["overview", dict["tab.overview"]],
    ["billing", dict["tab.billing"]],
    ["yam", dict["tab.yam"]],
    ["profiles", dict["tab.profiles"]],
    ["notes", dict["tab.notes"]],
    ["devices", "Devices"],
    ["pdpa", "PDPA"],
    ["affiliate", dict["tab.affiliate"]],
  ] as const;
  const trialLeftDays =
    pa?.in_trial && pa.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(pa.trial_ends_at).getTime() - Date.now()) / 86400000))
      : null;

  const revokeAll = async () => {
    if (!confirm("Revoke ALL sessions for this user?")) return;
    const r = await fetch(`/api/admin/users/${userId}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke_all_sessions" }),
    }).then((x) => x.json()).catch(() => null);
    setMsg(r?.ok ? `sessions revoked · sv=${r.session_version}` : `${dict["err"]}: ${r?.error}`);
    await loadDevices();
  };

  const revokeDevice = async (deviceId: string) => {
    await fetch(`/api/admin/users/${userId}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke_device", device_id: deviceId }),
    });
    await loadDevices();
  };

  const pdpa = async (action: string) => {
    if (!confirm(`${action}?`)) return;
    setMsg("…");
    if (action === "export") {
      const r = await fetch(`/api/admin/users/${userId}/pdpa`).then((x) => x.json()).catch(() => null);
      if (r?.ok) {
        const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `pdpa-${userId.slice(0, 8)}.json`;
        a.click();
        setMsg(dict["ok"]);
      } else setMsg(`${dict["err"]}: ${r?.error}`);
      return;
    }
    const r = await fetch(`/api/admin/users/${userId}/pdpa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: "user360" }),
    }).then((x) => x.json()).catch(() => null);
    setMsg(r?.ok ? dict["ok"] : `${dict["err"]}: ${r?.error}`);
    await load();
  };

  const impersonate = async () => {
    if (!impReason.trim()) { setMsg(dict["note.required"]); return; }
    if (!confirm("Start impersonation? You will browse as this user.")) return;
    const r = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", user_id: userId, reason: impReason, minutes: 15 }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setMsg(`Impersonating ${r.as} · open /today`);
      window.open("/today", "_blank");
    } else setMsg(`${dict["err"]}: ${r?.error}`);
  };

  return (
    <AdminShell title={`${dict["title.user360"]} · ${u?.email || userId.slice(0, 8)}`} locale={lang}>
      <div className="mb-4">
        <Link href={`/admin/members?lang=${locale}`} className="text-sm text-white/50 hover:text-white">
          {dict["nav.back"]}
        </Link>
      </div>

      {!d && <div className="text-white/40">Loading…</div>}

      {u && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card label={dict["col.yam"]} value={u.hour_balance} />
            <Card label={dict["col.plan"] || "Plan"} value={(pa?.plan || u.tier || "free").toUpperCase()} />
            <Card label={dict["col.tier"]} value={`${u.tier}${pa?.sub_active ? " · sub✓" : ""}`} />
            <Card
              label={dict["col.trial"] || "Trial"}
              value={
                pa?.in_trial
                  ? `${trialLeftDays ?? "?"}d left`
                  : u.trial_ends_at
                    ? "ended"
                    : "—"
              }
            />
            <Card label={dict["tab.profiles"]} value={d.profile_count} />
            <Card label="Sifu" value={d.chats} />
            <Card label={dict["col.joined"]} value={fmt(u.created_at)} />
            <Card label="Last active" value={fmt(u.last_active_at)} />
            <Card label="Sub expires" value={fmt(u.sub_expires_at)} />
            <Card label="Trial ends" value={fmt(u.trial_ends_at || pa?.trial_ends_at)} />
            <Card label={dict["col.status"]} value={u.is_active ? "🟢" : "🔴"} />
          </div>

          {pa && (
            <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
              <div className="mb-2 text-xs uppercase tracking-wide text-white/40">
                Product caps · SoT product-entitlement
                {d.product_constants
                  ? ` · signup ${d.product_constants.free_signup_yam} yam / trial ${d.product_constants.trial_days}d`
                  : ""}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
                <div>house ≤ {pa.house_limit}</div>
                <div>fusion sci ≤ {pa.fusion_max_sciences} · profiles ≤ {pa.fusion_max_profiles}</div>
                <div>book sci ≤ {pa.book_max_sciences}{pa.book_synthesis ? " + synth" : ""}</div>
                <div>vision ≤ {pa.luopan_vision_max} · datepick people ≤ {pa.datepick_max_people}</div>
                <div>fusion_suite {pa.fusion_suite ? "on" : "off"}</div>
                <div>network_multi {pa.network_multi ? "on" : "off"}</div>
              </div>
              <div className="mt-2 text-[11px] text-white/40">
                tier อย่างเดียวไม่เปิดสิทธิ์ paid — ต้อง sub_expires_at ยังไม่หมด · trial ใช้ trial_ends_at
              </div>
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-full px-3 py-1 text-xs ${tab === k ? "bg-cyan-500/20 text-cyan-100" : "border border-white/10 text-white/50"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <Panel>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><span className="text-white/40">Email</span><div>{u.email}</div></div>
                <div><span className="text-white/40">Phone</span><div>{u.phone || "—"}</div></div>
                <div><span className="text-white/40">Google</span><div>{u.google_user_id ? "linked" : "—"}</div></div>
                <div><span className="text-white/40">LINE</span><div>{u.line_user_id ? "linked" : "—"}</div></div>
                <div><span className="text-white/40">Verified</span><div>{u.email_verified ? "email✓" : ""} {u.phone_verified ? "phone✓" : ""}</div></div>
                <div><span className="text-white/40">Locale</span><div>{u.locale || "th"}</div></div>
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="mb-2 text-xs uppercase tracking-wide text-white/40">Signup fingerprint (ดูอย่างเดียว · ไม่บล็อก)</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-white/40">Device hash</span>
                    <div className="font-mono text-xs break-all">{u.signup_device_hash ? String(u.signup_device_hash).slice(0, 16) + "…" : "—"}</div>
                    <div className="text-xs text-amber-200/80">
                      บัญชีอื่นเครื่องเดียวกัน: {d?.signup_peers?.same_device_count ?? 0}
                    </div>
                  </div>
                  <div>
                    <span className="text-white/40">IP hash</span>
                    <div className="font-mono text-xs break-all">{u.signup_ip_hash || "—"}</div>
                    <div className="text-xs text-amber-200/80">
                      บัญชีอื่น IP เดียวกัน: {d?.signup_peers?.same_ip_count ?? 0}
                    </div>
                  </div>
                </div>
                {!!d?.signup_peers?.same_device?.length && (
                  <div className="mt-2 text-xs text-white/60">
                    <div className="text-white/40 mb-1">same device →</div>
                    {d.signup_peers.same_device.map((p) => (
                      <div key={p.id}>
                        <Link href={`/admin/users/${p.id}?lang=${locale}`} className="text-cyan-200 hover:underline">{p.email}</Link>
                      </div>
                    ))}
                  </div>
                )}
                {!!d?.signup_peers?.same_ip?.length && (
                  <div className="mt-2 text-xs text-white/60">
                    <div className="text-white/40 mb-1">same IP →</div>
                    {d.signup_peers.same_ip.map((p) => (
                      <div key={p.id}>
                        <Link href={`/admin/users/${p.id}?lang=${locale}`} className="text-cyan-200 hover:underline">{p.email}</Link>
                      </div>
                    ))}
                  </div>
                )}
                {u.signup_ua && (
                  <div className="mt-2 text-[10px] text-white/35 break-all">UA: {String(u.signup_ua).slice(0, 160)}</div>
                )}
              </div>
              <div className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm">
                {caps.can_credit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-white/50">{dict["action.adjust"]}</span>
                    <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+100 / -50" className="w-28 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={dict["note.required"]} className="min-w-[140px] flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
                    <button type="button" onClick={() => act("adjust_credit", { delta: Number(delta), note })} className="rounded-lg border border-white/20 px-3 py-1 hover:bg-white/10">{dict["action.save"]}</button>
                  </div>
                )}
                {caps.can_tier && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-white/50">{dict["col.tier"]}</span>
                    {TIERS.map((t) => (
                      <button key={t} type="button" onClick={() => act("set_tier", { tier: t })} className={`rounded-lg border px-3 py-1 ${u.tier === t ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/15"}`}>{t}</button>
                    ))}
                  </div>
                )}
                {caps.can_extend && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-white/50">{dict["action.extend"]}</span>
                    <input value={days} onChange={(e) => setDays(e.target.value)} className="w-20 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
                    <button type="button" onClick={() => act("extend_sub", { days: Number(days) })} className="rounded-lg border border-white/20 px-3 py-1 hover:bg-white/10">{dict["action.extend"]}</button>
                    <button type="button" onClick={() => act("extend_trial", { days: Number(days) })} className="rounded-lg border border-amber-400/30 px-3 py-1 text-amber-100 hover:bg-amber-500/10" title="trial_ends_at">
                      {dict["action.extend_trial"] || "ต่อ trial"}
                    </button>
                  </div>
                )}
                {caps.can_suspend && (
                  <div className="flex items-center gap-2">
                    <span className="w-24 text-white/50">{dict["col.status"]}</span>
                    <button type="button" onClick={() => act("set_active", { active: !u.is_active, note: "user360" })} className="rounded-lg border border-white/20 px-3 py-1 hover:bg-white/10">
                      {u.is_active ? dict["action.suspend"] : dict["action.restore"]}
                    </button>
                  </div>
                )}
                {msg && <div className="text-xs text-cyan-200/80">{msg}</div>}
              </div>
            </Panel>
          )}

          {tab === "billing" && (
            <Panel>
              <div className="space-y-2 text-sm">
                {(d.orders || []).map((o: any) => (
                  <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2">
                    <div>
                      <div className="font-mono text-xs text-white/40">{o.id?.slice?.(0, 8)}</div>
                      <div>{o.package_code} · ฿{o.amount_thb} · {o.yam_granted} yam</div>
                      <div className="text-xs text-white/40">{o.status} · {o.pay_method || "—"} · {fmt(o.paid_at || o.created_at)}</div>
                    </div>
                    {caps.can_refund && o.status === "paid" && (
                      <button type="button" onClick={() => refund(o.id)} className="rounded-lg border border-rose-400/30 px-2 py-1 text-xs text-rose-200">
                        {dict["action.refund"]}
                      </button>
                    )}
                  </div>
                ))}
                {!d.orders?.length && <div className="text-white/40">{dict["empty"]}</div>}
              </div>
            </Panel>
          )}

          {tab === "yam" && (
            <Panel>
              <div className="max-h-96 space-y-1 overflow-auto text-xs">
                {(d.txns || []).map((t: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-white/5 py-1.5">
                    <span className="text-white/40">{fmt(t.created_at)}</span>
                    <span className="flex-1 truncate text-white/70">{t.reason}{t.note ? ` · ${t.note}` : ""}</span>
                    <span className={`font-mono ${t.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{t.delta >= 0 ? "+" : ""}{t.delta}</span>
                    <span className="w-14 text-right font-mono text-white/40">{t.balance_after}</span>
                  </div>
                ))}
                {!d.txns?.length && <div className="text-white/40">{dict["empty"]}</div>}
              </div>
            </Panel>
          )}

          {tab === "profiles" && (
            <Panel>
              <div className="space-y-2 text-sm">
                {(d.profiles || []).map((p: any) => (
                  <div key={p.id} className="rounded-xl border border-white/10 px-3 py-2">
                    <div className="font-medium">{p.name || p.nickname || p.id.slice(0, 8)}</div>
                    <div className="text-xs text-white/50">{p.relationship_type || "—"} · DM {p.day_master || "—"} · {p.is_archived ? "archived" : "active"}</div>
                  </div>
                ))}
                {!d.profiles?.length && <div className="text-white/40">{dict["empty"]}</div>}
              </div>
            </Panel>
          )}

          {tab === "notes" && (
            <Panel>
              {caps.can_notes && (
                <div className="mb-3 flex gap-2">
                  <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} className="flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-sm" placeholder="Internal note…" />
                  <button type="button" onClick={() => { act("add_note", { body: noteBody }); setNoteBody(""); }} className="rounded-lg border border-white/20 px-3 py-1 text-sm">{dict["action.save"]}</button>
                </div>
              )}
              <div className="space-y-2 text-sm">
                {(d.notes || []).map((n: any) => (
                  <div key={n.id} className="rounded-xl border border-white/10 px-3 py-2">
                    <div className="text-xs text-white/40">{n.admin_email} · {fmt(n.created_at)}</div>
                    <div>{n.body}</div>
                  </div>
                ))}
                {!d.notes?.length && <div className="text-white/40">{dict["empty"]}</div>}
              </div>
            </Panel>
          )}

          {tab === "devices" && (
            <Panel>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-white/50">session_version = {sessionVersion}</span>
                <button type="button" onClick={revokeAll} className="rounded-lg border border-rose-400/30 px-3 py-1 text-xs text-rose-200">
                  Revoke all sessions
                </button>
              </div>
              <div className="space-y-2 text-sm">
                {devices.map((dev) => (
                  <div key={dev.id} className="flex justify-between gap-2 rounded-xl border border-white/10 px-3 py-2">
                    <div>
                      <div className="truncate text-xs text-white/70">{dev.ua || "—"}</div>
                      <div className="text-[10px] text-white/40">{fmt(dev.last_seen)}</div>
                    </div>
                    <button type="button" onClick={() => revokeDevice(dev.id)} className="text-xs text-rose-300">remove</button>
                  </div>
                ))}
                {!devices.length && <div className="text-white/40">{dict["empty"]}</div>}
              </div>
              {caps.can_suspend && (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <div className="mb-1 text-xs text-white/50">Impersonate (15m · audit)</div>
                  <div className="flex gap-2">
                    <input value={impReason} onChange={(e) => setImpReason(e.target.value)} placeholder="reason required" className="flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-sm" />
                    <button type="button" onClick={impersonate} className="rounded-lg border border-amber-400/30 px-3 py-1 text-xs text-amber-100">Start</button>
                  </div>
                </div>
              )}
              {msg && <div className="mt-2 text-xs text-cyan-200">{msg}</div>}
            </Panel>
          )}

          {tab === "pdpa" && (
            <Panel>
              <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" onClick={() => pdpa("export")} className="rounded-lg border border-white/20 px-3 py-1.5">Export JSON</button>
                <button type="button" onClick={() => pdpa("soft_delete")} className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-rose-200">Soft-delete</button>
                <button type="button" onClick={() => pdpa("restore")} className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-emerald-200">Restore</button>
              </div>
              <p className="mt-3 text-xs text-white/40">Restore window 30 days · soft-delete archives profiles</p>
              {msg && <div className="mt-2 text-xs text-cyan-200">{msg}</div>}
            </Panel>
          )}

          {tab === "affiliate" && (
            <Panel>
              <p className="mb-3 text-xs text-amber-200/80">{dict["affiliate.readonly"]}</p>
              <pre className="overflow-auto rounded-xl bg-black/40 p-3 text-xs text-white/70">
                {JSON.stringify(d.affiliate, null, 2) || "null"}
              </pre>
              <Link href={`/admin/affiliate?lang=${locale}`} className="mt-3 inline-block text-sm text-cyan-200 hover:underline">
                → {dict["nav.affiliate"]}
              </Link>
            </Panel>
          )}
        </>
      )}
    </AdminShell>
  );
}

function Card({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 backdrop-blur">
      <div className="text-[11px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-1 font-mono text-lg">{value ?? "—"}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur">{children}</div>;
}
