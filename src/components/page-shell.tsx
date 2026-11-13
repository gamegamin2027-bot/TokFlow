import type { ReactNode } from "react";

export function PageShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-[40px] sm:leading-[1.1]">{title}</h1>
      {intro && <p className="mt-5 text-lg leading-8 text-muted">{intro}</p>}
      <div className="prose-tf mt-10 rounded-card border border-line bg-white p-6 sm:p-10">{children}</div>
    </main>
  );
}
