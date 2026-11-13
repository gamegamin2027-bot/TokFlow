/** Types partagés entre le serveur et l'interface du mode Bannières. */
export type ClipStatus = "ok" | "partial" | "none" | "disabled" | "unavailable";

export type BannerItem = { n: number; animated: boolean; width?: number; height?: number; clipBytes?: number };

export type BannerSet = {
  id: string;
  postId: string;
  author: string;
  title: string;
  count: number;
  animatedCount: number;
  clipStatus: ClipStatus;
  /** Message à afficher lorsque tout ou partie des animations manque. */
  notice?: string;
  /** Cause technique de l'absence d'animations (diagnostic). */
  clipIssue?: string;
  /** Présent lorsque le navigateur du visiteur peut demander lui-même les animations au service tiers. */
  clipFallback?: { api: string; url: string };
  items: BannerItem[];
};
