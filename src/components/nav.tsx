"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type MessageKey } from "@/lib/i18n";

const TABS: { href: string; label: MessageKey }[] = [
  { href: "/", label: "nav.overview" },
  { href: "/portfolio", label: "nav.portfolio" },
  { href: "/transactions", label: "nav.transactions" },
  { href: "/settings", label: "nav.settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label={t("nav.sections")}>
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={(tab.href === "/" ? path === "/" : path.startsWith(tab.href)) ? "page" : undefined}>
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}
