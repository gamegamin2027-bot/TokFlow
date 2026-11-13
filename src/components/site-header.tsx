import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "./logo";
import { buttonClass } from "./ui/button";

const nav = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#comment-ca-marche", label: "Comment ça marche" },
  { href: "/#faq", label: "FAQ" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="TokFlow — accueil">
          <Logo />
        </Link>
        <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/#analyser" className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>
            Analyser un lien
          </Link>
          <details className="group relative lg:hidden">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-white text-ink [&::-webkit-details-marker]:hidden" aria-label="Ouvrir le menu">
              <Menu className="h-4.5 w-4.5" />
            </summary>
            <nav aria-label="Navigation mobile" className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-card">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-canvas">
                  {n.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
