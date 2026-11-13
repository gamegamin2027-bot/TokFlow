import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";
import { Logo } from "./logo";

export async function SiteFooter() {
  const { t } = await getDictionary();
  const cols = [
    { title: t.footer.product, links: [{ href: "/#fonctionnalites", label: t.nav.features }, { href: "/#comment-ca-marche", label: t.nav.how }, { href: "/#faq", label: t.nav.faq }] },
    { title: t.footer.company, links: [{ href: "/a-propos", label: t.nav.about }, { href: "/assistance", label: t.nav.support }] },
    { title: t.footer.legal, links: [{ href: "/confidentialite", label: t.footer.privacy }, { href: "/conditions", label: t.footer.terms }] },
  ];
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-5 py-14 sm:grid-cols-3 sm:px-8 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div className="col-span-2 sm:col-span-3 md:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
            {t.footer.tagline}
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink">{c.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-6 items-center text-sm text-muted transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs leading-5 text-muted sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>{t.footer.rights(new Date().getFullYear())}</p>
          <p>{t.footer.independent}</p>
        </div>
      </div>
    </footer>
  );
}
