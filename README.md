# TokFlow

Application web pour télécharger des vidéos TikTok **publiques, sans filigrane**, en MP4 (vidéo + audio) ou en MP3 (audio seul), et convertir des fichiers vidéo locaux.

## Parcours

1. Coller un lien TikTok (`tiktok.com/@compte/video/…`, `vm.tiktok.com/…`, `vt.tiktok.com/…`).
2. La vidéo est récupérée aussitôt (sans étape intermédiaire) : miniature, lecteur, auteur, durée, qualités disponibles.
3. Choix du format (MP4 / MP3) et de la qualité.
4. Téléchargement direct sur l'appareil.

Si un lien ne peut pas être traité, la raison est affichée et une alternative est proposée (conversion d'un fichier local, ouverture sur TikTok).

## Comment le « sans filigrane » fonctionne

TokFlow **ne retouche jamais l'image** (ni flou, ni recadrage, ni effacement). TikTok n'incruste le logo et le nom du compte que dans son fichier d'export ; le flux de lecture public, lui, est intact. TokFlow ne retient que ce flux d'origine et écarte explicitement la variante avec filigrane (`src/lib/media/link-engine.ts`). Si seule cette variante existe, le lien est refusé avec une explication.

### À lire avant la mise en production

- TikTok ne propose **aucune API officielle** de téléchargement par lien. La récupération repose sur [yt-dlp](https://github.com/yt-dlp/yt-dlp), qui lit les pages et flux publics sans compte ni cookie. Aucune restriction d'accès n'est contournée (vidéos privées, réservées ou bloquées : refusées).
- Cette méthode n'est **pas couverte par les conditions d'utilisation de TikTok**, qui encadrent l'accès automatisé, et le téléchargement de contenus de tiers relève du droit d'auteur local. L'exploitant du service en porte la responsabilité : faites valider ce point juridiquement avant une exploitation commerciale.
- TikTok peut modifier ses pages ou bloquer des plages d'IP de datacenters. Gardez yt-dlp à jour (un redéploiement réinstalle la dernière version).
- `TOKFLOW_LINK_ENGINE=none` désactive la récupération par lien et ne conserve que la conversion de fichiers.

## Stack

Next.js 15 (App Router, sortie `standalone`) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI (accordéon) · Lucide · FFmpeg · yt-dlp · Vitest · Playwright.

## Architecture

```
src/
  app/
    page.tsx                 Landing (hero, fonctionnalités, étapes, FAQ)
    (site)/ a-propos|assistance|confidentialite|conditions ; fondateur/
    api/
      health/                GET  — health check (Render)
      analyze/               POST — validation du lien + métadonnées + qualités
      thumbnail/             GET  — proxy d'images (liste blanche CDN TikTok)
      download/              POST — lien → MP4 sans filigrane / MP3
      convert/               POST — fichier importé → MP4 / MP3
  components/                Analyzer (parcours complet), FAQ, header, footer, UI
  lib/
    tiktok/url.ts            Validation stricte des liens (anti-SSRF), liens courts
    tiktok/oembed.ts         oEmbed officiel TikTok
    media/link-engine.ts     yt-dlp : métadonnées, filtrage filigrane, téléchargement
    media/ffmpeg.ts          Sonde + arguments FFmpeg (MP3, remux, ré-encodage)
    media/jobs.ts            Concurrence, dossiers temporaires, streaming + nettoyage
    rate-limit.ts            Limitation par IP (en mémoire)
    errors.ts                Codes d'erreur et messages
    config.ts                Variables d'environnement
tests/                       Tests unitaires (Vitest)
e2e/                         Tests navigateur (Playwright)
```

Sécurité : hôtes TikTok en liste blanche, aucun shell (`spawn`/`execFile` avec arguments), limites de taille/durée/concurrence, limitation de débit, fichiers temporaires supprimés après transfert, aucun secret requis.

## Développement

Prérequis : Node 20+, `ffmpeg` et `yt-dlp` dans le PATH (ou `FFMPEG_PATH` / `YTDLP_PATH`).

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000
```

| Script | Rôle |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Tests unitaires |
| `npm run build` puis `npm run test:e2e` | Tests navigateur sur le build de production |
| `E2E_LIVE=1 npm run test:e2e` | Ajoute un test sur un vrai lien TikTok |
| `E2E_SHOTS=1 npm run test:e2e` | Captures dans `docs/screenshots` |
| `npm start` | Serveur de production (`.next/standalone`) |

## Déploiement sur Render

1. Pousser le dépôt sur GitHub.
2. Render → **New → Blueprint** → sélectionner le dépôt : `render.yaml` crée le service Docker avec le health check `/api/health`.
3. Renseigner `NEXT_PUBLIC_SITE_URL`, puis les variables de la section « Centre d'assistance et espace fondateur ».

Render fournit `PORT` ; l'image écoute sur `0.0.0.0`. Variables : voir `.env.example`.

## Avertissement

TokFlow est indépendant de TikTok et de ByteDance Ltd. Les contenus appartiennent à leurs créateurs.


## Centre d'assistance et espace fondateur

- **`/assistance`** — formulaire public (sans compte). Chaque demande est enregistrée en base avec un identifiant `TF-XXXXXXXX` ; la confirmation n'est affichée qu'après l'écriture.
- **`/fondateur`** — « Centre de support » : compteurs, liste, filtres (statut, catégorie), recherche, tri par date, détail, historique, changement de statut, réponse par e-mail.
- **Compte fondateur** — tant qu'aucun compte n'existe, toute page du site affiche la création du compte fondateur (e-mail + mot de passe). Dès qu'il est créé, l'inscription est fermée (contrainte en base : une seule ligne possible) et les visiteurs ne voient plus aucun écran de connexion. Le fondateur se reconnecte par l'adresse non référencée `/fondateur/connexion`.
- Pour repartir de zéro : vider les tables `founder`, `sessions`, `tickets`, `ticket_events` (ou recréer la base).

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | **Obligatoire en production.** Chaîne de connexion PostgreSQL (sur Render : « Internal Database URL »). Les tables sont créées au premier accès. |
| `RESEND_API_KEY` | Clé API [Resend](https://resend.com) pour envoyer les réponses. |
| `EMAIL_FROM` | Expéditeur, sur un domaine vérifié chez Resend. Ex. `TokFlow <support@votre-domaine.fr>`. |
| `EMAIL_REPLY_TO` | Facultatif : adresse recevant les réponses des utilisateurs. |

Sans `RESEND_API_KEY` et `EMAIL_FROM`, le bouton « Envoyer » de la réponse est désactivé et l'interface indique les variables manquantes : aucun envoi n'est simulé. Sans `DATABASE_URL` en production, le téléchargement fonctionne mais le centre d'assistance et l'espace fondateur sont indisponibles.

`GET /api/health` indique l'état : `database` (`ok` / `missing` / `unreachable`), `founder` (`pending` / `created`), `email` (`configured` / `missing`).

En développement et dans les tests, une base PostgreSQL embarquée (PGlite) est utilisée dans `.data/` ; les tests Playwright démarrent un faux point d'entrée Resend local pour vérifier la requête réellement émise.
