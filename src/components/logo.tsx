import { cn } from "@/lib/utils";

/**
 * Monogramme TokFlow : un « T » dont le fût se termine en flèche de téléchargement.
 * Tracé sur une grille de 32 unités : marges égales de 8, trait de 3, signe centré optiquement.
 * Le même tracé sert à l'icône du site (src/app/icon.svg) et à l'icône d'écran d'accueil.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7 shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#176B55" />
      <path d="M9.5 9.5h13M16 9.5V22M10.5 16.5 16 22l5.5-5.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[18px] font-semibold leading-none tracking-[-0.02em] text-ink">
        Tok<span className="text-brand">Flow</span>
      </span>
    </span>
  );
}
