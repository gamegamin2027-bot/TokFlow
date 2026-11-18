/**
 * Détecte le navigateur intégré d'une application (TikTok, Instagram, Facebook…).
 * Ces navigateurs n'ont pas de gestionnaire de téléchargement : le clic sur un fichier
 * ne produit rien du tout. Mieux vaut le dire au visiteur que le laisser attendre.
 */
const APPS: [RegExp, string][] = [
  [/TikTok|musical_ly|BytedanceWebview|trill_/i, "TikTok"],
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i, "Facebook"],
  [/Snapchat/i, "Snapchat"],
  [/Line\//i, "LINE"],
  [/Pinterest/i, "Pinterest"],
  [/Twitter/i, "X"],
];

export function inAppBrowser(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  for (const [pattern, name] of APPS) if (pattern.test(ua)) return name;
  // WebView Android générique : « ; wv) » dans la chaîne.
  if (/; wv\)/i.test(ua)) return "Android";
  return null;
}
