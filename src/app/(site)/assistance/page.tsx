import type { Metadata } from "next";
import { Database } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { SupportForm } from "@/components/support-form";
import { Notice } from "@/components/ui/field";
import { getPages } from "@/lib/i18n/pages";
import { getLocale } from "@/lib/i18n/server";
import { databaseConfigured } from "@/lib/server/db";

export async function generateMetadata(): Promise<Metadata> {
  return (await getPages()).support.meta;
}

export default async function Assistance() {
  const page = (await getPages()).support;
  return (
    <PageShell bare eyebrow={page.eyebrow} title={page.title} intro={page.intro}>
      {databaseConfigured() ? (
        <SupportForm t={page.form} french={(await getLocale()) === "fr"} />
      ) : (
        <Notice tone="warn" title={page.unavailableTitle} icon={<Database className="h-4.5 w-4.5" />}>
          {page.unavailableText}
        </Notice>
      )}
    </PageShell>
  );
}
