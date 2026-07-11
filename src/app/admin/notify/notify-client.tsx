"use client";

/**
 * /admin/notify — การแจ้งเตือนหลังบ้านถึงมือถือแอดมิน (r497)
 * - subscribe เครื่องนี้: ใช้ window.hkPush เดิมจาก /js/hk-pwa.js (โหลด script แบบ lazy)
 * - toggle ต่อเหตุการณ์ → /api/admin/notify-prefs (ของตัวเองเท่านั้น)
 * - ปุ่มทดสอบ → /api/admin/notify-test ยิงถึงทุกเครื่องที่ subscribe ของตัวเอง
 * ผู้ส่งจริง: scripts/workers/admin-notify-watcher.mjs (poll ทุก 60 วิ)
 */
import { useCallback, useEffect, useState } from "react";
import { AdminShell, useAdminDict } from "@/components/admin/AdminShell";

type EventType = "user_signup" | "order_paid" | "job_fail_spike";
const EVENTS: EventType[] = ["user_signup", "order_paid", "job_fail_spike"];

type PushState = { supported: boolean; needsInstall: boolean; permission: string; subscribed: boolean };

declare global {
  interface Window {
    hkPush?: {
      enable: () => Promise<{ ok: boolean; reason?: string }>;
      state: () => Promise<PushState>;
    };
  }
}

/** โหลด /js/hk-pwa.js ครั้งเดียว (หน้า admin เป็น React ไม่มี hk-profile-sync) */
function loadHkPush(): Promise<Window["hkPush"] | undefined> {
  return new Promise((resolve) => {
    if (window.hkPush) return resolve(window.hkPush);
    const s = document.createElement("script");
    s.src = "/js/hk-pwa.js";
    s.onload = () => resolve(window.hkPush);
    s.onerror = () => resolve(undefined);
    document.head.appendChild(s);
  });
}

export default function NotifyClient({ lang }: { lang: string }) {
  const { dict } = useAdminDict();
  const [prefs, setPrefs] = useState<Record<EventType, boolean>>({
    user_signup: false, order_paid: false, job_fail_spike: false,
  });
  const [devices, setDevices] = useState(0);
  const [push, setPush] = useState<PushState | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshPushState = useCallback(async () => {
    const hk = await loadHkPush();
    if (hk?.state) setPush(await hk.state().catch(() => null));
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/notify-prefs", { cache: "no-store" })
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setPrefs(r.prefs);
      setDevices(r.devices || 0);
    }
    await refreshPushState();
  }, [refreshPushState]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (ev: EventType) => {
    const next = { ...prefs, [ev]: !prefs[ev] };
    setPrefs(next); // optimistic
    const r = await fetch("/api/admin/notify-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [ev]: next[ev] }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setPrefs(r.prefs);
    else { setPrefs(prefs); setMsg(dict["err"] || "error"); }
  };

  const subscribeDevice = async () => {
    setBusy(true);
    setMsg("…");
    const hk = await loadHkPush();
    if (!hk?.enable) { setMsg(dict["notify.unsupported"]); setBusy(false); return; }
    const r = await hk.enable().catch(() => ({ ok: false, reason: "subscribe" }));
    if (r.ok) setMsg(dict["notify.device_ok"]);
    else if (r.reason === "ios_install") setMsg(dict["notify.ios_install"]);
    else if (r.reason === "denied") setMsg(dict["notify.denied"]);
    else setMsg(`${dict["err"]}: ${r.reason || "?"}`);
    await load();
    setBusy(false);
  };

  const testPush = async () => {
    setBusy(true);
    setMsg("…");
    const r = await fetch("/api/admin/notify-test", { method: "POST" })
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      const rep = r.report || {};
      if (rep.sent > 0) setMsg(`${dict["notify.test_sent"]} (${rep.sent})`);
      else if (rep.skipped === "no_subscription") setMsg(dict["notify.no_sub"]);
      else if (rep.skipped === "no_vapid") setMsg(dict["notify.no_vapid"]);
      else setMsg(`${dict["err"]}: sent=${rep.sent} failed=${rep.failed} removed=${rep.removed}`);
    } else setMsg(dict["err"] || "error");
    setBusy(false);
  };

  const evLabel: Record<EventType, string> = {
    user_signup: dict["notify.ev.user_signup"],
    order_paid: dict["notify.ev.order_paid"],
    job_fail_spike: dict["notify.ev.job_fail_spike"],
  };
  const evDesc: Record<EventType, string> = {
    user_signup: dict["notify.ev.user_signup.desc"],
    order_paid: dict["notify.ev.order_paid.desc"],
    job_fail_spike: dict["notify.ev.job_fail_spike.desc"],
  };

  return (
    <AdminShell titleKey="title.notify" locale={lang}>
      <p className="mb-4 text-sm text-white/55">{dict["notify.hint"]}</p>

      {/* เครื่องนี้ */}
      <section className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <h2 className="mb-1 text-sm font-bold text-white/85">{dict["notify.device"]}</h2>
        <p className="mb-3 text-xs text-white/50">
          {push?.subscribed ? dict["notify.device_ok"] : dict["notify.device_off"]}
          {" · "}{dict["notify.devices"]}: {devices}
          {push && !push.supported ? ` · ${dict["notify.unsupported"]}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={subscribeDevice}
            disabled={busy}
            className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 disabled:opacity-50"
          >
            {dict["notify.enable_device"]}
          </button>
          <button
            type="button"
            onClick={testPush}
            disabled={busy}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/80 disabled:opacity-50"
          >
            {dict["notify.test"]}
          </button>
          {msg && <span className="text-xs text-cyan-200">{msg}</span>}
        </div>
      </section>

      {/* เหตุการณ์ */}
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h2 className="mb-3 text-sm font-bold text-white/85">{dict["notify.events"]}</h2>
        <div className="flex flex-col gap-3">
          {EVENTS.map((ev) => (
            <label key={ev} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3">
              <span>
                <span className="block text-sm text-white/85">{evLabel[ev]}</span>
                <span className="block text-xs text-white/45">{evDesc[ev]}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs[ev]}
                onChange={() => toggle(ev)}
                className="h-5 w-5 accent-emerald-400"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/40">{dict["notify.worker_note"]}</p>
      </section>
    </AdminShell>
  );
}
