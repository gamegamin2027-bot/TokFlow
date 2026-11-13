import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "TokFlow — Vidéos TikTok sans filigrane, en MP4 ou MP3", template: "%s — TokFlow" },
  description: "Collez un lien TikTok public, prévisualisez la vidéo et téléchargez-la sans filigrane en MP4, ou extrayez l'audio en MP3. Simple, rapide, sans inscription.",
  openGraph: { title: "TokFlow", description: "Vidéos TikTok publiques en MP4 ou MP3, en quelques secondes.", type: "website", locale: "fr_FR", siteName: "TokFlow" },
};

export const viewport: Viewport = { themeColor: "#F5F4F0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm">
          Aller au contenu
        </a>
        <SiteHeader />
        <div id="contenu" className="flex-1">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
