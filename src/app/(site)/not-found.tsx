import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getDictionary();
  return (
    <main className="mx-auto max-w-xl px-5 py-28 text-center">
      <p className="font-mono text-sm text-brand">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">{t.notFound.title}</h1>
      <p className="mt-3 text-muted">{t.notFound.text}</p>
      <Link href="/" className={buttonClass("primary", "md", "mt-8")}>
        {t.notFound.back}
      </Link>
    </main>
  );
}
