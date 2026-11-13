import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-28 text-center">
      <p className="font-mono text-sm text-brand">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Page introuvable</h1>
      <p className="mt-3 text-muted">Cette page n'existe pas ou a été déplacée.</p>
      <Link href="/" className={buttonClass("primary", "md", "mt-8")}>
        Retour à l'accueil
      </Link>
    </main>
  );
}
