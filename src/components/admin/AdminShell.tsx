"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ADMIN_LOCALES, adminDict, normalizeAdminLocale, type AdminLocale } from "@/lib/admin-i18n";

const NAV = [
  { href: "/admin", key: "nav.dashboard" },
  { href: "/admin/members", key: "nav.members" },
  { href: "/admin/orders", key: "nav.orders" },
  { href: "/admin/support", key: "nav.support" },
  { href: "/admin/community", key: "nav.community" },
  { href: "/admin/finance", key: "nav.finance" },
  { href: "/admin/ai-cost", key: "nav.aicost" },
  { href: "/admin/packages", key: "nav.packages" },
  { href: "/admin/iam", key: "nav.iam" },
  { href: "/admin/affiliate", key: "nav.affiliate" },
  { href: "/admin/research", key: "nav.chatmon" },
  { href: "/admin/notify", key: "nav.notify" },
  { href: "/admin/settings", key: "nav.settings" },
];

export function AdminShell({
  titleKey,
  title,
  children,
  locale: localeProp,
}: {
  titleKey?: string;
  title?: string;
  children: React.ReactNode;
  locale?: string;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = normalizeAdminLocale(
    localeProp ||
      sp.get("lang") ||
      (typeof window !== "undefined" ? localStorage.getItem("hk_locale") : null) ||
      "th"
  );
  const dict = adminDict(locale);
  const heading = title || (titleKey ? dict[titleKey] : dict["title.admin"]);

  const setLang = (l: AdminLocale) => {
    try {
      localStorage.setItem("hk_locale", l);
      localStorage.setItem("hk_lang", l);
    } catch {
      /* noop */
    }
    const p = new URLSearchParams(sp.toString());
    p.set("lang", l);
    router.replace(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="hk-admin-frame">
      <aside className="hk-admin-aside">
        <div className="hk-admin-navcard">
          <div className="hk-admin-brand">{dict["title.admin"]}</div>
          <div className="hk-admin-brand-sub">時 hourkey</div>
          <nav className="hk-admin-nav">
            {NAV.map((n) => {
              const active =
                pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={`${n.href}?lang=${locale}`}
                  className={active ? "is-active" : undefined}
                >
                  {dict[n.key] || n.key}
                </Link>
              );
            })}
          </nav>
          <div className="hk-admin-lang-label">Language</div>
          <div className="hk-admin-langs">
            {ADMIN_LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={locale === l ? "is-on" : undefined}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="hk-admin-main">
        <div className="hk-admin-title-row">
          <h1 className="hk-admin-title">{heading}</h1>
          <div className="hk-admin-langs md-only-hide" style={{ display: "flex" }}>
            {ADMIN_LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={locale === l ? "is-on" : undefined}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export function useAdminDict() {
  const sp = useSearchParams();
  const locale = normalizeAdminLocale(
    sp.get("lang") ||
      (typeof window !== "undefined" ? localStorage.getItem("hk_locale") : null) ||
      "th"
  );
  return { locale, dict: adminDict(locale), t: (k: string) => adminDict(locale)[k] || k };
}
