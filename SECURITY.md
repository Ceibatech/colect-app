# Sécurité — GeoArchives-MULCV

## 1. Authentification

- Identifiants : e-mail + mot de passe (table `users`).
- Mots de passe hashés avec **bcrypt** (`bcryptjs`, 10 rounds) — jamais stockés en clair.
  Voir [`src/lib/auth/password.ts`](src/lib/auth/password.ts).
- Session : JWT signé (HS256, bibliothèque `jose`) stocké dans un cookie **httpOnly**,
  `sameSite=lax`, `secure` en production, durée de vie 8h. Voir
  [`src/lib/auth/session.ts`](src/lib/auth/session.ts).
- Le secret de signature vient de `AUTH_SECRET` (variable d'environnement obligatoire —
  l'application refuse de démarrer une vérification de session si la valeur par défaut du
  `.env.example` est encore présente).
- **Choix technique documenté** : session JWT maison (via `jose`) plutôt que NextAuth/Auth.js
  v5 (encore en beta au moment du développement). Ce choix évite une dépendance majeure
  instable pour une application de production, au prix d'une implémentation plus explicite
  (assumée et documentée ici).
- Message d'erreur de connexion volontairement **générique** (« Identifiants incorrects »)
  pour ne pas révéler si un e-mail existe en base.
- Anti-bruteforce basique : 5 tentatives échouées / 15 min par couple (e-mail, IP), en
  mémoire process — voir [`src/lib/auth/rate-limit.ts`](src/lib/auth/rate-limit.ts).
  **Limite connue** : non partagé entre plusieurs instances (scaling horizontal) ; à
  remplacer par un store partagé si le besoin se présente.

## 2. Autorisation (RBAC)

- 4 rôles (`ADMIN`, `SUPERVISEUR`, `OPERATEUR`, `CONSULTATION`) et ~22 permissions
  granulaires, stockés en base (`roles`, `permissions`, `role_permissions`) — voir
  [`src/lib/permissions/constants.ts`](src/lib/permissions/constants.ts) (source unique,
  utilisée par le seed **et** l'application).
- Les permissions de l'utilisateur sont embarquées dans le JWT de session au moment du
  login. **Conséquence documentée** : un changement de permissions d'un rôle ne prend effet
  qu'à la prochaine connexion de l'utilisateur concerné (acceptable en V1 ; une invalidation
  active pourra être ajoutée plus tard si nécessaire).
- Contrôle en 2 niveaux :
  1. **Proxy** (`src/proxy.ts`, ex-middleware) : protection grossière — redirige les
     utilisateurs non authentifiés vers `/login`, et restreint certains préfixes de route
     par rôle (`ROLE_ONLY_ROUTE_PREFIXES`).
  2. **Serveur, par action** : chaque Server Action / Route Handler sensible doit appeler
     `requireUser()` / `requireRole()` / `requirePermission()`
     ([`src/lib/auth/current-user.ts`](src/lib/auth/current-user.ts)) — **jamais de
     confiance uniquement au frontend** (cahier des charges §60).

## 3. Traçabilité

Chaque connexion réussie (`LOGIN`), tentative échouée (`LOGIN_FAILED`) et déconnexion
(`LOGOUT`) est journalisée dans `audit_logs` avec `user_id`, `ip_address` et horodatage.
D'autres actions sensibles (création/modification/suppression/validation/rejet/import/export/
administration) seront journalisées de la même façon au fur et à mesure de leur
implémentation (Phase 12 — Audit).

## 4. Secrets & configuration

- Aucun secret en dur dans le code : `DATABASE_URL`, `AUTH_SECRET` uniquement via variables
  d'environnement (`.env`, jamais commité — voir `.gitignore`).
- `.env.example` documente les variables requises sans valeurs réelles.
- Utilisateur MySQL applicatif dédié (`mulcv_app`), pas de `root` en production (cahier des
  charges §7).

## 5. Protection des données / injections

- Prisma paramètre toutes les requêtes → protection native contre l'injection SQL.
- Validation stricte des entrées côté serveur avec **Zod** avant tout accès base
  ([`src/lib/validation/`](src/lib/validation)), en plus de la validation React Hook Form
  côté client (qui n'est qu'un confort UX, jamais une garantie de sécurité).
- Pas de rendu de contenu utilisateur non échappé (React échappe par défaut — aucun
  `dangerouslySetInnerHTML` utilisé).

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
- Ajouter des en-têtes de sécurité HTTP (CSP, etc.) au niveau de `next.config.ts` lors de
  la Phase 14 (optimisation) / 15 (production).
- Réévaluer le anti-bruteforce en mémoire si un déploiement multi-instances est prévu.
