"use client";

import * as React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Champs de formulaire communs à tout le produit (site public et espace fondateur). */
const control =
  "w-full rounded-[10px] border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10";

export function Field({ label, htmlFor, hint, error, optional, children, className }: { label: string; htmlFor: string; hint?: string; error?: string; optional?: boolean | string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-muted">{typeof optional === "string" ? optional : "Facultatif"}</span>}
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

export type SelectOption = { value: string; label: string; hint?: string };

// Radix interdit la valeur vide : elle est remplacée en interne par ce marqueur.
const EMPTY = "__vide__";
const enc = (v: string) => (v === "" ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? "" : v);

/**
 * Liste déroulante du produit (Radix Select) : menu ancré sous le champ, à la largeur du champ,
 * navigable au clavier, identique sur ordinateur et sur mobile.
 */
export function Select({ id, value, onValueChange, options, placeholder, disabled, className, name, ...aria }: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const hasValue = options.some((o) => o.value === value);
  return (
    <RadixSelect.Root value={hasValue ? enc(value) : undefined} onValueChange={(v) => onValueChange(dec(v))} disabled={disabled} name={name}>
      <RadixSelect.Trigger
        id={id}
        {...aria}
        className={cn(
          control,
          "flex h-11 cursor-pointer items-center justify-between gap-3 text-left data-[placeholder]:text-muted/80 data-[state=open]:border-brand data-[state=open]:ring-2 data-[state=open]:ring-brand/15 [&>span:first-child]:truncate",
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon asChild>
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="tf-pop z-50 max-h-[min(var(--radix-select-content-available-height),22rem)] w-[var(--radix-select-trigger-width)] min-w-[11rem] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(32_42_38/0.06),0_16px_40px_-12px_rgb(32_42_38/0.22)]"
        >
          <RadixSelect.Viewport className="p-1.5">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={enc(o.value)}
                className="relative flex min-h-10 cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-9 text-sm leading-5 text-ink !outline-none data-[highlighted]:bg-canvas data-[state=checked]:font-medium data-[state=checked]:text-brand-dark"
              >
                <span className="min-w-0">
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  {o.hint && <span className="mt-0.5 block text-xs font-normal text-muted">{o.hint}</span>}
                </span>
                <RadixSelect.ItemIndicator className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Check aria-hidden className="h-4 w-4 text-brand" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
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
