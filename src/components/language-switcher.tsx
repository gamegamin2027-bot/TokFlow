"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { Flag } from "./flag";
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
        aria-label={`${t.nav.language} : ${t.nav.languages[locale]}`}
        data-testid="language-switcher"
        className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-sm font-medium text-ink transition-colors hover:border-[#c9d0c8] sm:px-3"
      >
        <Flag locale={locale} />
        <span className="hidden sm:inline">{t.nav.languages[locale]}</span>
        <span className="uppercase sm:hidden">{locale}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <MotionConfig reducedMotion="user">
      <AnimatePresence>
      {open && (
        <motion.ul
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="origin-top-right absolute right-0 top-[calc(100%+6px)] z-50 w-44 rounded-xl border border-line bg-white p-1 shadow-[0_1px_2px_rgb(32_42_38/0.06),0_16px_40px_-12px_rgb(32_42_38/0.22)]">
          {LOCALES.map((code) => (
            <li key={code}>
              <button
                type="button"
                aria-current={code === locale ? "true" : undefined}
                onClick={() => choose(code)}
                className={cn("flex h-10 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-left text-sm text-ink hover:bg-canvas", code === locale && "font-medium text-brand-dark")}
              >
                <span className="flex items-center gap-2.5">
                  <Flag locale={code} />
                  {t.nav.languages[code]}
                </span>
                {code === locale && <Check className="h-4 w-4 text-brand" aria-hidden />}
              </button>
            </li>
          ))}
        </motion.ul>
      )}
      </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
