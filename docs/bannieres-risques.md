# Risques liés aux services — état au 13 novembre 2026

Ce document rapporte ce que disent les textes publiés. Il ne constitue pas un avis juridique : la portée réelle de ces
clauses pour un site exploité depuis la France doit être confirmée par un juriste avant toute mise en production.

## 1. Conditions d'utilisation de TikTok

Sources : https://www.tiktok.com/legal/page/row/terms-of-service/en et https://www.tiktok.com/legal/page/global/terms-of-service/en
(extraits obtenus par recherche ; la version EEE/Royaume-Uni/Suisse, celle qui s'applique à un résident français, n'a pas pu être
chargée depuis l'environnement de test et reste à lire).

Extraits (version « reste du monde », section 5 — « You may not ») :
- « use automated scripts to collect information from or otherwise interact with the Services » ;
- « bypass any measures we may use to prevent or restrict access to the Services » ;
- « incorporate the Services or any portion thereof into any other program or product ».

Section 7 (contenu) : le contenu de TikTok « may not be downloaded, copied, reproduced, distributed, transmitted […] for any purpose
whatsoever without our or, where applicable, our licensors' prior written consent » ; l'accès est accordé « solely for your personal,
non-commercial use ».

La version « globale » vise aussi l'usage d'un « automated system or software, whether operated by a third party or otherwise,
to extract any data from the Service for commercial purposes ».

Ce que l'on peut en dire sans extrapoler :
- ces textes interdisent la collecte automatisée et le téléchargement sans accord, y compris par l'intermédiaire d'un tiers ;
- TokFlow fait les deux : lecture automatisée de la page publique, et recours à un tiers pour les clips ;
- la question de savoir si ces conditions lient un service qui n'a pas de compte TikTok, et quelles en seraient les suites,
  dépend du droit applicable : non tranchée ici ;
- risque concret observable : blocage des adresses du serveur par TikTok, mise en demeure, demandes de retrait.

Les mêmes clauses s'appliquent déjà au téléchargement vidéo et audio du TokFlow actuel : la dépendance à TikWM n'ouvre pas ce
risque, elle y ajoute le recours à une interface que TikTok ne publie pas.

## 2. Conditions de TikWM

Deux sites distincts :

**tikwm.com (accès gratuit utilisé par TokFlow)** — aucune condition d'utilisation publiée ; seule une politique de
confidentialité existe (https://www.tikwm.com/privacy.html). Aucun texte n'autorise ni n'interdit un usage commercial, et
aucun engagement de disponibilité n'est pris. Limite annoncée par l'API elle-même : environ une requête par seconde.

**tikwmapi.com (offre avec compte et clé, à partir de 18 $ par mois)** — conditions publiées : https://tikwmapi.com/terms
- § 3 : « You may not use the service for unlawful activity, infringement, or violations of third-party platform policies.
  Use APIs only within the scope you are authorized for. »
- § 5 : service fourni « as is » ; aucune responsabilité pour les pannes ou les changements dus aux plateformes tierces.
- § 6 : conditions modifiables ; la poursuite de l'utilisation vaut acceptation.
- Aucune clause sur l'usage commercial. Aucune politique de confidentialité propre (la page /privacy n'existe pas).

Point important : le § 3 interdit d'utiliser le service en violation des règles des plateformes tierces. Rapproché de la
section 1, cela signifie que TikWM fait porter ce risque à son client. Le service se décrit par ailleurs comme
« Unofficial data API ».

## 3. Conservation des liens et des données

Ce qui est publié (tikwm.com/privacy.html) :
- « This website does not collect or transmit any user's personally identifiable information. »
- « No technical information is sent or stored for now (such as IP addresses included in the HTTP calls the website makes).
  But we reserve the right to collect such informations in later versions […]. »

Ce qui est observable :
- la page d'accueil de tikwm.com affiche une liste « Other Videos » de publications, avec des pages `tikwm.com/video/<identifiant>.html`.
  Le lien entre cette liste et les demandes des utilisateurs n'est pas documenté ; il faut donc considérer comme possible
  que les publications demandées soient conservées et rendues visibles.

Ce qui n'est pas connu : durée de conservation, localisation des serveurs, identité juridique de l'exploitant, sous-traitants.
Aucun contrat de traitement des données n'est proposé.

Ce que TokFlow transmet à TikWM : l'adresse canonique de la publication et l'adresse IP du serveur. Rien sur le visiteur.

## 4. Risques pour TokFlow

**Techniques**
- Dépendance à un service sans engagement : arrêt, changement de format ou quota possibles à tout moment. Effet limité par conception : les images restent servies (pannes simulées dans `tests/banners.test.ts`).
  conception : les images restent servies (17 tests de panne et de robustesse).
- Quota gratuit d'une requête par seconde : avec plusieurs visiteurs simultanés, certaines analyses n'auront que les images.
- Les clips sont ceux que TikTok stocke (576 pixels de haut, débit faible) : pas de qualité supérieure à attendre.
- Mémoire : les archives sont construites en mémoire (plafond 120 Mo) ; à surveiller sur une instance de 512 Mo.

**Juridiques**
- Conditions de TikTok (section 1) et clause de report du risque de TikWM (section 2).
- Droit d'auteur : les bannières sont des œuvres de tiers (créateurs, studios d'animation). TokFlow facilite leur copie ;
  il doit au minimum rappeler les droits des créateurs et traiter les demandes de retrait.
- Aucune de ces sources n'établit que l'usage envisagé est autorisé. Aucune ne permet non plus de chiffrer le risque.

**Confidentialité**
- Les liens analysés sont transmis à un tiers dont les engagements ne sont ni contractuels ni vérifiables, et dont
  l'exploitant et la localisation sont inconnus. Un lien TikTok public n'est pas en soi une donnée personnelle du visiteur,
  mais il révèle ce que les visiteurs de TokFlow consultent.
- Si la dépendance est retenue : mentionner TikWM dans la politique de confidentialité, ne jamais lui transmettre d'élément
  identifiant le visiteur (c'est le cas), et garder l'interrupteur `BANNER_CLIP_SOURCE=none`.

## Constat en production : TikWM refuse l'adresse de l'hébergeur (13 novembre 2026)

Depuis le serveur Render, `https://www.tikwm.com/api/` répond `HTTP 403` (page HTML de son pare-feu), quel que soit le
client HTTP utilisé. Le refus vise l'adresse du serveur, pas la requête : la même demande aboutit depuis un poste ordinaire.

Solution retenue : **relais par le navigateur du visiteur** (`src/lib/banners/browser-clips.ts`).

1. Le serveur analyse la publication et prépare les images (inchangé). S'il n'obtient pas les animations, sa réponse
   contient `clipFallback`.
2. Le navigateur du visiteur interroge alors TikWM directement. TikWM autorise ces appels depuis d'autres sites
   (`access-control-allow-origin: *`) ; aucune protection n'est contournée.
3. Le navigateur remet la liste d'adresses à `POST /api/banners/<id>/clips`. Le serveur ne lui fait pas confiance :
   seules les adresses des serveurs de fichiers TikTok sont téléchargées, sans redirection, taille bornée, et le contenu
   doit être un vrai MP4. L'analyse ainsi complétée n'est plus partagée avec les autres visiteurs.
4. En cas d'échec, les images restent proposées avec la mention « Image fixe — animation indisponible ».

Conséquences à connaître :

- **Confidentialité** : dans ce cas, TikWM voit l'adresse IP et le navigateur du visiteur, en plus de l'adresse de la
  publication. La politique de confidentialité du site le dit. Aucun cookie ni identifiant TokFlow n'est transmis
  (`credentials: omit`, `referrerPolicy: no-referrer`).
- **Fragilité** : le relais dépend de l'ouverture de TikWM aux navigateurs ; il peut la retirer à tout moment.
- **Réglages** : `BANNER_BROWSER_FALLBACK=0` interdit le relais (images seules si le serveur est refusé) ;
  `BANNER_CLIP_SOURCE=none` coupe toute utilisation de TikWM. Avec une clé `TIKWM_API_KEY` (offre payante
  tikwmapi.com, non souscrite), le relais est désactivé, la clé ne devant jamais atteindre le navigateur.
- Le champ `clipIssue` de la réponse donne la cause technique de l'absence d'animations (diagnostic).
