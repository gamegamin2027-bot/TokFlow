import type { ReactNode } from "react";
import { getDictionary } from "@/lib/i18n/server";

/** Gabarit commun des pages secondaires : même en-tête, même largeur, même rythme. Leur texte est rédigé en français. */
export async function PageShell({ eyebrow, title, intro, children, bare }: { eyebrow: string; title: string; intro?: string; children: ReactNode; bare?: boolean }) {
  const { locale, t } = await getDictionary();
  return (
    <main lang="fr" className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
      {locale !== "fr" && (
        <p lang={locale} className="mb-6 rounded-lg border border-line bg-white px-4 py-2.5 text-sm text-muted">
          {t.common.frenchOnly}
        </p>
      )}
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h1 className="mt-2 text-balance text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink sm:text-[40px]">{title}</h1>
      {intro && <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-[17px] sm:leading-8">{intro}</p>}
      {bare ? <div className="mt-10">{children}</div> : <div className="prose-tf mt-10 rounded-card border border-line bg-white p-6 sm:p-10">{children}</div>}
    </main>
  );
}
