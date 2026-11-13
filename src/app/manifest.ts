import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TokFlow",
    short_name: "TokFlow",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F4F0",
    theme_color: "#176B55",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
