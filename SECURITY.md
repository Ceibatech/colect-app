# Sécurité — GeoArchives

## 1. Authentification

- Identifiants : e-mail + mot de passe (table `users`).
- Mots de passe hashés avec **bcrypt** (`bcryptjs`, 10 rounds) — jamais stockés en clair.
  Voir [`src/lib/auth/password.ts`](src/lib/auth/password.ts).
- Les nouveaux mots de passe doivent contenir au moins 15 caractères (72 octets maximum,
  limite explicite de bcrypt). Aucun critère artificiel de composition n'est imposé.
- Session : JWT signé (HS256, bibliothèque `jose`) stocké dans un cookie **httpOnly**,
  `sameSite=lax`, `secure` en production, durée de vie 8h. Voir
  [`src/lib/auth/session.ts`](src/lib/auth/session.ts).
- Chaque JWT porte un émetteur, une audience, un sujet et une `sessionVersion`. À chaque
  requête protégée, l'application relit en base l'état actif du compte, la version de
  session, le rôle et les permissions. Une désactivation, une modification de rôle ou une
  rotation du mot de passe révoque donc immédiatement les anciennes sessions.
- Récupération de mot de passe : lien aléatoire de 256 bits envoyé par Resend, seule son empreinte SHA-256 est stockée dans `password_reset_tokens`. Le lien expire après 60 minutes, est invalidé par tout nouvel envoi et ne peut être consommé qu'une seule fois.
- Les réponses de `/mot-de-passe-oublie` restent identiques qu'un compte existe ou non, afin d'éviter l'énumération des utilisateurs. Les invitations administratives utilisent le même mécanisme et n'envoient jamais de mot de passe en clair.
- Lors de la création d'un compte, GeoArchives génère un secret aléatoire inaccessible à
  l'administrateur. L'utilisateur définit lui-même son mot de passe via le lien d'activation
  à usage unique. La réinitialisation manuelle par un administrateur a été supprimée.
- Le secret de signature vient de `AUTH_SECRET` (variable d'environnement obligatoire —
  l'application refuse de démarrer une vérification de session si la valeur par défaut du
  `.env.example` est encore présente).
- **Transition d'identité documentée** : le mécanisme JWT actuel est durci et reste la
  solution active. La cible est Keycloak via OpenID Connect, sans bascule brutale. Le plan
  d'intégration et de retour arrière est décrit dans
  [`docs/SECURITE-KEYCLOAK.md`](docs/SECURITE-KEYCLOAK.md).
- Message d'erreur de connexion volontairement **générique** (« Identifiants incorrects »)
  pour ne pas révéler si un e-mail existe en base.
- Anti-bruteforce basique : 5 tentatives échouées / 15 min par couple (e-mail, IP), en
  mémoire process — voir [`src/lib/auth/rate-limit.ts`](src/lib/auth/rate-limit.ts).
  **Limite connue** : non partagé entre plusieurs instances (scaling horizontal) ; à
  remplacer par un store partagé si le besoin se présente.

## 2. Autorisation (RBAC)

- 7 rôles (`ADMIN`, `SUPERVISEUR`, `OPERATEUR`, `FINANCE`, `PMO`, `EXECUTIF`, `CONSULTATION`) et des permissions
  granulaires, stockés en base (`roles`, `permissions`, `role_permissions`) — voir
  [`src/lib/permissions/constants.ts`](src/lib/permissions/constants.ts) (source unique,
  utilisée par le seed **et** l'application).
- Le JWT contient un instantané utile au proxy, mais le serveur relit le rôle et les
  permissions en base à chaque requête protégée. `EXECUTIF` consulte les vues globales sans accès opérationnel. `PMO` consulte
  uniquement les tableaux de bord des superviseurs qui lui sont affectés. `FINANCE`
  accède aux points, barèmes et projections budgétaires, sans accès aux dossiers ni aux
  formulaires. Les données de rémunération ne sont jamais exposées à PMO ou Exécutif.
  Toute modification des permissions d'un rôle prend effet dès la requête suivante.
- Contrôle en 2 niveaux :
  1. **Proxy** (`src/proxy.ts`, ex-middleware) : protection grossière — redirige les
     utilisateurs non authentifiés vers `/login`, et restreint certains préfixes de route
     par rôle (`ROLE_ONLY_ROUTE_PREFIXES`).
  2. **Serveur, par action** : chaque Server Action / Route Handler sensible doit appeler
     `requireUser()` / `requireRole()` / `requirePermission()`
     ([`src/lib/auth/current-user.ts`](src/lib/auth/current-user.ts)) — **jamais de
     confiance uniquement au frontend** (cahier des charges §60).
- Le périmètre PMO est matérialisé par `pmo_supervisor_scopes`; l'absence d'affectation
  produit volontairement un tableau de bord vide, jamais une vue globale par défaut.
- Les points financiers sont dérivés de `workflow_transitions`. Seules les étapes
  acceptées créditent l'opérateur; chaque validation ou rejet tracé crédite le
  superviseur qui l'a prononcé. Les barèmes sont datés dans `finance_rates`, sans édition
  ni suppression depuis l'interface, et chaque création/export est journalisé.

## 3. Traçabilité

Chaque connexion réussie (`LOGIN`), tentative échouée (`LOGIN_FAILED`) et déconnexion
(`LOGOUT`) est journalisée dans `audit_logs` avec `user_id`, `ip_address` et horodatage.
D'autres actions sensibles (création/modification/suppression/validation/rejet/import/export/
administration) seront journalisées de la même façon au fur et à mesure de leur
implémentation (Phase 12 — Audit).

### Chaîne de garde des transferts

- La constitution, le visa CEIBA, l'autorisation ministère et chaque mouvement sont
  contrôlés par des permissions serveur distinctes (`TRANSFER_CREATE`,
  `TRANSFER_CEIBAC_APPROVE`, `TRANSFER_AUTHORIZE`, `TRANSFER_OPERATE`). Un lot soumis
  ne peut pas sauter le visa CEIBA, et un lot validé par CEIBA ne peut pas sortir
  avant le visa ministère. Les actions contrôlent l'état courant en base.
- `VALIDATEUR_MINISTERE` reçoit seulement `DASHBOARD_VIEW`, `TRANSFER_VIEW` et
  `TRANSFER_AUTHORIZE`. Il ne peut ni constituer un lot, ni enregistrer un mouvement,
  ni saisir des positions GPS. L'ajout du rôle n'affecte aucun compte existant.
- La sortie, la réception et le retour sont exécutés dans une transaction sérialisable :
  création du bordereau, signatures, changement d'état du stock et audit réussissent ou
  échouent ensemble. Une vérification optimiste de l'état empêche deux agents de déplacer
  le même carton simultanément.
- Chaque visa conserve le nom, la fonction, l'horodatage, l'utilisateur ayant capturé la
  preuve, l'adresse IP et le tracé PNG. Il s'agit d'un **visa manuscrit interne capturé à
  l'écran**, utile à la traçabilité opérationnelle ; ce mécanisme n'est pas présenté comme
  une signature électronique qualifiée ou un service de confiance au sens juridique.
- Les bordereaux sont consultables uniquement par un utilisateur authentifié disposant de
  `TRANSFER_VIEW`. Le profil Exécutif n'accède pas au registre opérationnel.

## 4. Secrets & configuration

- Aucun secret en dur dans le code : `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`,
  `MICROSOFT_CLIENT_SECRET`, `EMAIL_FROM` et `APP_URL` uniquement via variables
  d'environnement (`.env`, jamais commité — voir `.gitignore`). Les identifiants Graph
  sont strictement serveur et ne portent jamais le préfixe `NEXT_PUBLIC_`.
- `.env.example` documente les variables requises sans valeurs réelles.
- Utilisateur MySQL applicatif dédié (`mulcv_app`), pas de `root` en production (cahier des
  charges §7).
- L'accès SharePoint utilise le flux OAuth2 applicatif. En production, la configuration
  recommandée emploie `SHAREPOINT_DRIVE_ID` + `SHAREPOINT_FOLDER_ITEM_ID` et la permission
  d'application `Sites.Selected`, accordée explicitement au seul site CEIBA Projects.
  Le mode de découverte par lien partagé (`SHAREPOINT_SHARED_FOLDER_URL`) exige une
  permission Graph plus large (`Files.ReadWrite.All` ou `Sites.ReadWrite.All`) et doit
  rester un mode d'amorçage contrôlé.
- Le versement Alfresco utilise un compte de service dédié, limité au répertoire
  `ALFRESCO_ROOT_NODE_ID`. Les identifiants `ALFRESCO_USERNAME` et
  `ALFRESCO_PASSWORD` restent uniquement dans le fichier d'environnement du serveur.
  L'application vérifie l'empreinte SHA-256 du contenu source avant chaque versement,
  mémorise le node ID Alfresco et ne supprime jamais automatiquement le nœud final.
  Le compte administrateur Alfresco ne doit pas être utilisé par GeoArchives.

## 5. Protection des données / injections

- Prisma paramètre toutes les requêtes → protection native contre l'injection SQL.
- Validation stricte des entrées côté serveur avec **Zod** avant tout accès base
  ([`src/lib/validation/`](src/lib/validation)), en plus de la validation React Hook Form
  côté client (qui n'est qu'un confort UX, jamais une garantie de sécurité).
- Pas de rendu de contenu utilisateur non échappé (React échappe par défaut — aucun
  `dangerouslySetInnerHTML` utilisé).
- Les réponses portent une politique CSP, HSTS en production, `nosniff`, une protection
  anti-framing, une politique de référent stricte et une `Permissions-Policy`. La
  géolocalisation reste autorisée uniquement pour l'origine GeoArchives, car elle est
  requise par le suivi des convois.

## 6. Gestion des erreurs

Les messages d'erreur exposés à l'utilisateur restent génériques (ex. « Identifiants
incorrects »). Les détails techniques (stack traces, messages Prisma bruts) ne doivent
jamais être renvoyés au client en production — à surveiller au fur et à mesure de
l'implémentation des autres modules (cahier des charges §67).

## 6bis. Routes API REST (`/api/*`)

`src/proxy.ts` laisse volontairement passer les requêtes `/api/*` sans les
rediriger vers `/login` (un redirect HTML n'a pas de sens pour un client
`fetch()`). Chaque Route Handler vérifie donc lui-même l'authentification et
les permissions via `requireApiUser()` / `requireApiPermission()`
([src/lib/auth/current-user.ts](src/lib/auth/current-user.ts)), qui lèvent
une `ApiError` (401/403) traduite en réponse JSON par
[api-response.ts](src/lib/utils/api-response.ts) — jamais de redirection, de
stack trace, ni de détail interne exposé. Voir [API.md](API.md).

## 6ter. Import / Export (Phase 10)

- **Choix technique documenté** : le paquet `xlsx` (SheetJS) a été écarté —
  la version publiée sur le registre npm (0.18.5) porte deux vulnérabilités
  non corrigées (pollution de prototype, ReDoS) sans correctif disponible.
  Utilisation d'**`exceljs`** (maintenu activement) pour les fichiers Excel
  et d'un parseur CSV maison (RFC 4180, sans dépendance) pour les fichiers
  CSV. `exceljs` porte une vulnérabilité **modérée** transitive (`uuid`,
  vérification de limites de buffer) non déclenchée par notre usage
  (lecture/écriture de classeurs, jamais d'appel avec un buffer externe
  fourni à `uuid`) — acceptée en connaissance de cause, à réévaluer si un
  correctif upstream apparaît.
- Import : taille de fichier limitée à 5 Mo, extensions `.csv`/`.xlsx`
  uniquement, 5000 lignes maximum par confirmation. Chaque ligne est
  **revalidée intégralement côté serveur** à la confirmation — jamais de
  confiance dans le statut "valide" renvoyé par le client (§60). Les
  dossiers importés sont créés en `BROUILLON` uniquement (jamais soumis
  automatiquement).
- Export : la portée des dossiers exportables respecte le même
  cloisonnement par rôle que `/dossiers` (un OPERATEUR n'exporte que ses
  propres dossiers). Toute génération d'export est journalisée
  (`exports` + `audit_logs`).

## 7. À faire dans les phases suivantes

- Étendre la journalisation d'audit à toutes les actions sensibles listées au §57 du
  cahier des charges.
- Remplacer l'anti-bruteforce en mémoire par le mécanisme centralisé Keycloak avant tout
  déploiement multi-instance.
- Déployer Keycloak sur une base et un sous-domaine dédiés, puis activer la MFA en priorité
  pour les administrateurs et validateurs selon le plan de migration documenté.
