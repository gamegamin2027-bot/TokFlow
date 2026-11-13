import Link from "next/link";
import { Logo } from "./logo";

const cols = [
  {
    title: "Produit",
    links: [
      { href: "/#fonctionnalites", label: "Fonctionnalités" },
      { href: "/#comment-ca-marche", label: "Comment ça marche" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Société",
    links: [
      { href: "/a-propos", label: "À propos" },
      { href: "/assistance", label: "Assistance" },
    ],
  },
  {
    title: "Légal",
    links: [
      { href: "/confidentialite", label: "Confidentialité" },
      { href: "/conditions", label: "Conditions d'utilisation" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-5 py-14 sm:grid-cols-3 sm:px-8 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div className="col-span-2 sm:col-span-3 md:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
            Téléchargez des vidéos TikTok publiques sans filigrane, en vidéo, en audio ou en bannières, simplement et dans le respect des créateurs.
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
          <p>© {new Date().getFullYear()} TokFlow. Tous droits réservés.</p>
          <p>TokFlow est un service indépendant, non affilié à TikTok ni à ByteDance Ltd.</p>
        </div>
      </div>
    </footer>
  );
}
