import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";

/**
 * Drapeaux dessinés en SVG : les drapeaux « emoji » ne s'affichent pas sous Windows (Chrome et Edge montrent « FR », « GB »).
 * Tous sont ramenés à un cadre commun de 60 × 42 ; les armoiries, illisibles à cette taille, sont simplifiées.
 */
const FLAGS: Record<Locale, ReactNode> = {
  fr: (
    <>
      <rect width="20" height="42" fill="#000091" />
      <rect x="20" width="20" height="42" fill="#fff" />
      <rect x="40" width="20" height="42" fill="#E1000F" />
    </>
  ),
  en: (
    <svg viewBox="0 0 60 30" width="60" height="42" preserveAspectRatio="none">
      <clipPath id="tf-flag-en">
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <path d="M0 0v30h60V0z" fill="#012169" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0l60 30M60 0L0 30" clipPath="url(#tf-flag-en)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  ),
  es: (
    <>
      <rect width="60" height="42" fill="#AA151B" />
      <rect y="10.5" width="60" height="21" fill="#F1BF00" />
    </>
  ),
  de: (
    <>
      <rect width="60" height="14" fill="#000" />
      <rect y="14" width="60" height="14" fill="#DD0000" />
      <rect y="28" width="60" height="14" fill="#FFCE00" />
    </>
  ),
  pt: (
    <>
      <rect width="24" height="42" fill="#046A38" />
      <rect x="24" width="36" height="42" fill="#DA291C" />
      <circle cx="24" cy="21" r="8" fill="#FFE900" />
      <circle cx="24" cy="21" r="4.2" fill="#fff" stroke="#DA291C" strokeWidth="2" />
    </>
  ),
  it: (
    <>
      <rect width="20" height="42" fill="#009246" />
      <rect x="20" width="20" height="42" fill="#fff" />
      <rect x="40" width="20" height="42" fill="#CE2B37" />
    </>
  ),
};

export function Flag({ locale }: { locale: Locale }) {
  return (
    <svg viewBox="0 0 60 42" className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-ink/10" aria-hidden="true" preserveAspectRatio="none">
      {FLAGS[locale]}
    </svg>
  );
}
