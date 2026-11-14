import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { THEME_COLORS, THEME_COOKIE, pickTheme } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    metadataBase: new URL(siteUrl),
    title: { default: t.meta.title, template: "%s — TokFlow" },
    description: t.meta.description,
    openGraph: { title: t.meta.title, description: t.meta.ogDescription, type: "website", url: "/", locale: t.meta.ogLocale, siteName: "TokFlow" },
    appleWebApp: { capable: true, title: "TokFlow", statusBarStyle: "default" },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.ogDescription },
  };
}

const currentTheme = async () => pickTheme((await cookies()).get(THEME_COOKIE)?.value);

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: THEME_COLORS[await currentTheme()], width: "device-width", initialScale: 1 };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={await getLocale()} data-theme={await currentTheme()} className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
