"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/lib/i18n";

const LINKS = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/categories", key: "nav.categories" },
  { href: "/accounts", key: "nav.accounts" },
];

export function NavLinks({ role }: { role?: string }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const links = role === "owner" ? [...LINKS, { href: "/users", key: "nav.users" }] : LINKS;

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto rounded-full border border-border bg-muted/40 px-1.5 py-1 text-xs sm:text-sm"
      aria-label={t("nav.aria")}
    >
      {links.map(({ href, key }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-full px-3 py-1.5 whitespace-nowrap transition-colors " +
              (active
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}