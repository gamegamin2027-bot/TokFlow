import type { ReactNode } from "react";

/** Gabarit commun des pages secondaires : même en-tête, même largeur, même rythme. */
export function PageShell({ eyebrow, title, intro, children, bare }: { eyebrow: string; title: string; intro?: string; children: ReactNode; bare?: boolean }) {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h1 className="mt-3 text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[44px]">{title}</h1>
      {intro && <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-lg sm:leading-8">{intro}</p>}
      {bare ? <div className="mt-10">{children}</div> : <div className="prose-tf mt-10 rounded-card border border-line bg-white p-6 sm:p-10">{children}</div>}
    </main>
  );
}
