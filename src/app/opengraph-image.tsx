import { ImageResponse } from "next/og";

/** Image affichée quand le lien du site est partagé (Discord, WhatsApp, X, iMessage…). */
export const alt = "TokFlow — Vos vidéos TikTok, sans filigrane";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#F5F4F0",
          backgroundImage: "radial-gradient(circle at 50% -10%, #DCEBE3 0%, #F5F4F0 62%)",
          color: "#202A26",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8.5" fill="#176B55" />
            <path d="M9.25 9.75h13.5M16 9.75V22M10.5 16.5 16 22l5.5-5.5" fill="none" stroke="#fff" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "flex", marginLeft: 20, fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            <span>Tok</span>
            <span style={{ color: "#176B55" }}>Flow</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 700, lineHeight: 1.04, letterSpacing: -3.5 }}>
            <span>Vos vidéos TikTok,</span>
            <span style={{ color: "#176B55" }}>sans filigrane.</span>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: "#69736D" }}>MP4 avec le son, MP3 ou bannières animées. Gratuit, sans inscription.</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: "#69736D" }}>
          {["Vidéo MP4", "Audio MP3", "Bannières animées"].map((label) => (
            <div key={label} style={{ display: "flex", marginRight: 14, padding: "10px 22px", borderRadius: 999, border: "2px solid #DFE3DD", backgroundColor: "#fff", color: "#202A26" }}>
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
