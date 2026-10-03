"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/categories", label: "Kategori" },
  { href: "/accounts", label: "Akun" },
];

export function NavLinks({ role }: { role?: string }) {
  const pathname = usePathname();
  const links = role === "owner" ? [...LINKS, { href: "/users", label: "User" }] : LINKS;

  return (
    <nav className="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm overflow-x-auto" aria-label="Navigasi utama">
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap " +
              (active
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
