import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "Conditions d'utilisation", description: "Conditions d'utilisation de TokFlow." };

export default function Terms() {
  return (
    <PageShell eyebrow="Légal" title="Conditions d'utilisation" intro="En utilisant TokFlow, vous acceptez les conditions ci-dessous. Dernière mise à jour : 13 novembre 2026.">
      <h2>1. Le service</h2>
      <p>TokFlow permet de coller le lien d'une vidéo TikTok publique, d'en afficher un aperçu, et d'en obtenir une copie sans filigrane incrusté au format MP4, ou sa piste audio en MP3. TokFlow récupère le flux de lecture d'origine et ne retouche jamais l'image. Il permet aussi de récupérer les bannières d'un carrousel public (animation en MP4 lorsqu'elle existe, image sinon), telles que TikTok les conserve, et de convertir un fichier importé depuis votre appareil.</p>
      <h2>2. Contenus accessibles</h2>
      <p>TokFlow n'accède qu'aux contenus consultables publiquement, sans authentification. Le service ne permet pas d'accéder aux vidéos privées, réservées, supprimées ou soumises à une restriction d'accès, et ne contourne aucune mesure technique de protection. Les animations des bannières, que TikTok n'expose pas sur ses pages publiques, sont obtenues par l'intermédiaire d'un service tiers indépendant et non officiel (TikWM), sans lien avec TikTok ; lorsqu'il ne répond pas, seules les images sont proposées.</p>
      <h2>3. Votre responsabilité</h2>
      <ul>
        <li>Les vidéos et musiques appartiennent à leurs créateurs et ayants droit.</li>
        <li>Vous vous engagez à n'utiliser les fichiers obtenus que dans un cadre licite : usage personnel et privé, ou réutilisation avec l'autorisation du titulaire des droits.</li>
        <li>L'absence de filigrane ne vous confère aucun droit sur le contenu : citez toujours le créateur lorsque vous partagez sa vidéo.</li>
        <li>Toute republication, exploitation commerciale ou suppression de la mention de l'auteur sans autorisation est interdite.</li>
        <li>Vous êtes également tenu de respecter les conditions d'utilisation de TikTok qui vous sont applicables.</li>
      </ul>
      <h2>4. Usages interdits</h2>
      <ul>
        <li>Automatiser massivement les requêtes ou tenter de surcharger le service.</li>
        <li>Utiliser TokFlow pour harceler, usurper une identité ou porter atteinte à la vie privée d'autrui.</li>
        <li>Tenter de contourner les limitations techniques du service.</li>
      </ul>
      <h2>5. Signalement</h2>
      <p>Les créateurs et ayants droit peuvent nous signaler tout usage abusif via le <Link href="/assistance">Centre d'assistance</Link>. Nous pouvons bloquer le traitement de certains contenus.</p>
      <h2>6. Disponibilité et garantie</h2>
      <p>Le service est fourni « en l'état », sans garantie de disponibilité. Le traitement d'un lien dépend de la disponibilité publique du contenu sur TikTok et peut échouer ; la raison est alors indiquée.</p>
      <h2>7. Indépendance</h2>
      <p>TokFlow n'est ni affilié, ni approuvé par TikTok ou ByteDance Ltd. TikTok est une marque de ByteDance Ltd.</p>
      <h2>8. Évolution des conditions</h2>
      <p>Ces conditions peuvent être mises à jour. La poursuite de l'utilisation du service vaut acceptation de la version en vigueur.</p>
    </PageShell>
  );
}
