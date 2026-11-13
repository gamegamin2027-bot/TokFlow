import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Champs de formulaire communs à tout le produit (site public et espace fondateur). */
const control =
  "w-full rounded-[10px] border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition-colors hover:border-[#c9d0c8] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10";

export function Field({ label, htmlFor, hint, error, optional, children, className }: { label: string; htmlFor: string; hint?: string; error?: string; optional?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-muted">Facultatif</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-[13px] leading-5 text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] leading-5 text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ref, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, "min-h-36 resize-y py-2.5 leading-6", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, "h-11 cursor-pointer appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Notice({ tone, title, children, className, id, icon }: { tone: "danger" | "warn" | "success" | "info"; title?: string; children?: React.ReactNode; className?: string; id?: string; icon: React.ReactNode }) {
  const tones = {
    danger: "border-danger/20 bg-danger-soft text-danger",
    warn: "border-warn/20 bg-warn-soft text-warn",
    success: "border-brand/20 bg-brand-soft text-brand-dark",
    info: "border-line bg-canvas text-ink",
  };
  return (
    <div id={id} role={tone === "danger" || tone === "warn" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4 text-sm leading-6", tones[tone], className)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
