import { FounderAuth } from "@/components/founder-auth";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/lib/i18n/server";
import { needsFounderSetup } from "@/lib/server/auth";

// L'état « fondateur créé ou non » est lu à chaque requête tant qu'il est faux.
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Première visite du site : seule la création du compte fondateur est proposée.
  if (await needsFounderSetup()) return <FounderAuth mode="setup" />;
  const { locale, t } = await getDictionary();

  return (
    <I18nProvider locale={locale}>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm">
        {t.common.skip}
      </a>
      <SiteHeader />
      <div id="contenu" className="flex-1">
        {children}
      </div>
      <SiteFooter />
    </I18nProvider>
  );
}
