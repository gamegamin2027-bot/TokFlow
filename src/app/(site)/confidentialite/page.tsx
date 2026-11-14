import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { RichBlocks } from "@/components/rich-blocks";
import { getPages } from "@/lib/i18n/pages";

export async function generateMetadata(): Promise<Metadata> {
  return (await getPages()).privacy.meta;
}

export default async function Privacy() {
  const page = (await getPages()).privacy;
  return (
    <PageShell eyebrow={page.eyebrow} title={page.title} intro={page.intro}>
      <RichBlocks blocks={page.blocks} />
    </PageShell>
  );
}
