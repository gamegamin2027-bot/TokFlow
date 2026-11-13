import { FounderAuth } from "@/components/founder-auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { needsFounderSetup } from "@/lib/server/auth";

// L'état « fondateur créé ou non » est lu à chaque requête tant qu'il est faux.
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Première visite du site : seule la création du compte fondateur est proposée.
  if (await needsFounderSetup()) return <FounderAuth mode="setup" />;

  return (
    <>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm">
        Aller au contenu
      </a>
      <SiteHeader />
      <div id="contenu" className="flex-1">
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
