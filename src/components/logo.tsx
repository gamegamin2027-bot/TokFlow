import { cn } from "@/lib/utils";

/** Monogramme TokFlow : un « T » dont le fût devient une flèche de flux. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#176B55" />
      <path d="M9.5 10h13M16 10v11.5M11 17l5 5 5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight text-ink">
        Tok<span className="text-brand">Flow</span>
      </span>
    </span>
  );
}
