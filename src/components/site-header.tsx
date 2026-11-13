"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n-provider";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";

export function SiteHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const nav = [
    { href: "/#comment-ca-marche", label: t.nav.how },
    { href: "/#fonctionnalites", label: t.nav.features },
    { href: "/#faq", label: t.nav.faq },
    { href: "/a-propos", label: t.nav.about },
    { href: "/assistance", label: t.nav.support },
  ];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
        {/* Trois zones de largeur égale : la navigation reste centrée sur la page. */}
        <div className="flex flex-1">
          <Link href="/" aria-label={t.nav.home} onClick={() => setOpen(false)} className="rounded-lg">
            <Logo />
          </Link>
        </div>
        <nav aria-label={t.nav.main} className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-1 items-center justify-end gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? t.nav.close : t.nav.open}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-white text-ink transition-colors hover:border-[#c9d0c8] lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div id="menu-mobile" hidden={!open} className={cn("border-t border-line bg-white shadow-card lg:hidden", open && "tf-rise")}>
        <nav aria-label={t.nav.mobile} className="mx-auto max-w-6xl px-3 py-2 sm:px-6">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-lg px-3 text-[15px] font-medium text-ink hover:bg-canvas">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
