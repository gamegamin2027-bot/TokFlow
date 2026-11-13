"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n-provider";

/** Choix de la langue : enregistré dans un cookie, appliqué sans changer de page. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  function choose(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t.nav.language} : ${LOCALE_NAMES[locale]}`}
        data-testid="language-switcher"
        className="flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-white px-2.5 text-sm font-medium text-ink transition-colors hover:border-[#c9d0c8] sm:px-3"
      >
        <Globe className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
        <span className="hidden sm:inline">{LOCALE_NAMES[locale]}</span>
        <span className="uppercase sm:hidden">{locale}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="tf-pop absolute right-0 top-[calc(100%+6px)] z-50 w-44 rounded-xl border border-line bg-white p-1 shadow-[0_1px_2px_rgb(32_42_38/0.06),0_16px_40px_-12px_rgb(32_42_38/0.22)]">
          {LOCALES.map((code) => (
            <li key={code}>
              <button
                type="button"
                lang={code}
                aria-current={code === locale ? "true" : undefined}
                onClick={() => choose(code)}
                className={cn("flex h-10 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-left text-sm text-ink hover:bg-canvas", code === locale && "font-medium text-brand-dark")}
              >
                {LOCALE_NAMES[code]}
                {code === locale && <Check className="h-4 w-4 text-brand" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
