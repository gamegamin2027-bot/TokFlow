import type { Metadata } from "next";

export const metadata: Metadata = { title: "Espace fondateur", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
