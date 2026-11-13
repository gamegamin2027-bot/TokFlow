import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "À propos", description: "La mission et les principes de TokFlow." };

export default function About() {
  return (
    <PageShell eyebrow="À propos" title="Un outil simple, honnête et bien construit." intro="TokFlow est né d'un constat : enregistrer une vidéo ou sa bande-son ne devrait demander ni publicité envahissante, ni installation, ni compte.">
      <h2>Notre mission</h2>
      <p>Offrir le chemin le plus court entre un lien TikTok public et un fichier propre, en MP4 ou en MP3, avec une interface claire et rapide sur tous les appareils.</p>
      <h2>Nos principes</h2>
      <ul>
        <li><strong>Transparence.</strong> TokFlow n'affiche que les formats et qualités réellement disponibles. Quand un lien ne peut pas être traité, la raison est indiquée et une alternative est proposée.</li>
        <li><strong>Respect des créateurs.</strong> Seules les vidéos publiques sont accessibles, sans compte ni contournement de restriction d'accès. Les contenus restent la propriété de leurs auteurs.</li>
        <li><strong>Sobriété.</strong> Pas de compte, pas d'historique, pas de traceur publicitaire. Les fichiers sont supprimés dès la fin du transfert.</li>
        <li><strong>Qualité.</strong> Le MP4 est livré sans ré-encodage ; le MP3 est encodé avec FFmpeg au débit que vous choisissez.</li>
      </ul>
      <h2>Comment ça fonctionne</h2>
      <p>Lorsque vous collez un lien, notre serveur le valide, interroge les informations publiques de la vidéo, puis récupère le flux public et le convertit si nécessaire avec FFmpeg. Le fichier est transmis à votre navigateur puis effacé.</p>
      <h2>Indépendance</h2>
      <p>TokFlow est un service indépendant, sans lien avec TikTok ni ByteDance Ltd.</p>
    </PageShell>
  );
}
