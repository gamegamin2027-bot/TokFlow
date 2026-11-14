import type { MetadataRoute } from "next";

/** Fiche d'installation : permet d'ajouter TokFlow à l'écran d'accueil (Android, iPhone) ou comme application sur ordinateur. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TokFlow",
    short_name: "TokFlow",
    description: "Vidéos TikTok sans filigrane, en MP4 ou MP3.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F5F4F0",
    theme_color: "#F5F4F0",
    categories: ["utilities", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
