"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_COLORS, THEME_COOKIE, type Theme } from "@/lib/theme";
import { useI18n } from "./i18n-provider";

/**
 * Bascule clair / sombre. L'apparence est posée sur <html> par le serveur (cookie) : aucune couleur ne clignote au chargement.
 * Les deux icônes sont rendues ; la feuille de style n'en montre qu'une, selon l'apparence en cours.
 */
export function ThemeToggle() {
  const { t } = useI18n();

  function toggle() {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[next]);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t.nav.theme}
      title={t.nav.theme}
      data-testid="theme-toggle"
      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-line-strong"
    >
      <Moon className="theme-light-only h-4 w-4" aria-hidden />
      <Sun className="theme-dark-only h-4 w-4" aria-hidden />
    </button>
  );
}
