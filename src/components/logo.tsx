import { cn } from "@/lib/utils";

/** Monogramme TokFlow : un « T » dont le fût devient une flèche de flux. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden="true">
      <defs>
        <linearGradient id="tf-logo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1D7A62" />
          <stop offset="1" stopColor="#14604C" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8.5" fill="url(#tf-logo)" />
      <path d="M9.25 9.75h13.5M16 9.75V22M10.5 16.5 16 22l5.5-5.5" fill="none" stroke="#fff" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
        Tok<span className="text-brand">Flow</span>
      </span>
    </span>
  );
}
