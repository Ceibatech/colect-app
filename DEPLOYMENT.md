# Déploiement — GeoArchives-MULCV (Phase 15, §95/§96)

Cible : **GitHub → Render (application Next.js) → MySQL/MariaDB sur cPanel**,
avec un service **Aiven** maintenu en repli déjà éprouvé (§1)
(schéma complet dans [ARCHITECTURE.md](ARCHITECTURE.md#2-architecture-technique)).
Render héberge uniquement l'application ; la base est un service managé distinct —
jamais de MySQL local en production.

## État actuel (déployé)

| Élément | Valeur |
|---|---|
| URL publique | **https://geoarchives.ceiba-analytics.com** (CNAME GoDaddy → `colect-app.onrender.com`, certificat HTTPS Render automatique) |
| Service Render | `colect-app`, plan **Starter** (disque persistant `documents` monté sur `/var/data/documents`) |
| Base de données | **cPanel / GoDaddy** (MariaDB 10.11, `p3plzcpnl504395.prod.phx3.secureserver.net`), base **`col_invent`** |
| Repli | Service **Aiven MySQL 8.4** (palier Developer) maintenu et validé — bascule en changeant la seule `DATABASE_URL` (§1). Attention : ses données se figent dès que la production écrit ailleurs (§9.1) |
| Structure | Migrations appliquées (`prisma migrate deploy`), référentiel RBAC + statuts de workflow chargés via `prisma/seed-production-core.ts` (aucune donnée fictive) |
| Compte admin | 1 compte réel créé via `scripts/create-user.ts` |
| Restant | Communes/lotissements/natures de dossier réels non encore chargés (0) — à fournir avant utilisation réelle de la Collecte |

**Pièges rencontrés et corrigés** :
- Le premier build Render a échoué (`Build failed`, erreur PostCSS sur `globals.css`).
  Cause : la variable d'environnement `NODE_ENV=production` posée dans Render affecte
  aussi `npm install`, qui saute alors les `devDependencies` — or `tailwindcss`,
  `@tailwindcss/postcss`, `typescript` et `prisma` en font partie et sont nécessaires pour
  *construire* l'app (pas seulement l'exécuter). Corrigé en changeant le **Build Command**
  Render en :
  ```
  npm install --include=dev && npm run build
  ```
- Un déploiement ultérieur (ajout d'un champ au schéma Prisma) a échoué en `tsc` avec des
  erreurs `Object literal may only specify known properties` sur le nouveau champ — alors
  que `schema.prisma` était bien à jour et que le build passait en local. Cause : Render
  restaure un `node_modules` mis en cache entre deux builds ; comme aucune dépendance
  n'avait changé, `npm install` n'a rien réinstallé et le hook `postinstall` de
  `@prisma/client` (qui régénère normalement le client depuis `schema.prisma`) ne s'est
  jamais redéclenché — le build a compilé contre un client Prisma périmé. Corrigé en
  rendant la régénération explicite plutôt que de compter sur ce hook implicite,
  peu fiable avec le cache de build (`package.json`) :
  ```json
  "build": "prisma generate && next build"
  ```
  Après toute modification de `prisma/schema.prisma`, s'assurer que ce changement est bien
  en place avant de pousser — sinon un déploiement peut sembler « réussir localement » et
  échouer sur Render pour cette seule raison de cache.

## 0. Checklist avant de commencer

- [ ] Code poussé sur un dépôt GitHub (`main` protégée, déploiements depuis une branche
      ou des tags, au choix)
- [ ] Accès à la base MySQL/MariaDB de production (cPanel) — ou un compte
      [Aiven](https://console.aiven.io) pour la solution de repli (§1)
- [ ] Un compte Render
- [ ] `openssl rand -base64 32` disponible (ou tout générateur équivalent) pour
      `AUTH_SECRET`

## 1. Base de données MySQL managée (Aiven) — solution de repli

> **Statut** : la production tourne actuellement sur **cPanel/GoDaddy** (MariaDB 10.11).
> Cette section décrit la bascule vers Aiven, **réalisée et validée le 21/08/2026** lors
> d'un incident de connectivité, puis annulée le 24/08 une fois le blocage expiré
> (§9.1). La procédure est conservée en l'état : le blocage peut réapparaître, GoDaddy
> filtrant les plages d'IP de datacenter en amont de MySQL — un filtrage que cPanel ne
> permet pas de piloter. Le service Aiven reste provisionné, la bascule ne demande que
> de changer `DATABASE_URL`.

### 1.1 Créer le service

Console [Aiven](https://console.aiven.io) → **Create service** → **MySQL**.

1. **Service tier** : `Developer` (5 $/mois) et **non** `Free`. Le palier gratuit
   **éteint le service en cas d'inactivité**, ce qui produirait des pannes
   intermittentes en exploitation — bien plus coûteuses à diagnostiquer qu'à prévenir.
2. **Cloud / Region** : `North America`. Le service Render tourne en **Virginia
   (US East)** ; une base en Europe ajouterait ~90 ms de latence à *chaque* requête,
   soit près d'une seconde sur une page qui en enchaîne huit.
3. **Service name** : ex. `geoarchives-db`.
4. Attendre le statut **`Running`** (3 à 5 minutes).

### 1.2 Récupérer la chaîne de connexion

Page du service → **Connection information** → révéler le mot de passe (icône œil),
puis noter `Host`, `Port`, `User`, `Password`.

⚠️ Le paramètre `ssl-mode=REQUIRED` fourni par Aiven est une option du **client MySQL
en ligne de commande**, que Prisma ne comprend pas. L'équivalent Prisma est
`sslaccept` (cf. §2).

### 1.3 Créer la base applicative

Aiven fournit une base `defaultdb`. On lui préfère une base portant le nom métier :

```sql
CREATE DATABASE col_invent CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Puis appliquer le schéma (§5) — `prisma migrate deploy` recrée les 29 tables **et les
9 vues de reporting**, celles-ci étant définies dans les migrations
(`20260813103408_reporting_views`, `20260813150947_evolution_validation_view`).

### 1.4 Restreindre les IP entrantes

**Service settings → Allowed IP addresses.** À la création, Aiven ouvre le service à
tout l'internet (`0.0.0.0/0` et `::/0`) — à restreindre dès que le fonctionnement est
confirmé :

| Plage | Rôle |
|---|---|
| `74.220.49.0/24` | IP sortantes Render — région Virginia |
| `74.220.57.0/24` | IP sortantes Render — région Virginia |
| `<ip-poste-admin>/32` | Poste d'administration (sauvegardes, scripts de vérification) |

Les plages Render se relèvent dans **Render → service → `Connect` (en haut à droite) →
onglet `Outbound`**. Elles sont **partagées** avec les autres services Render de la
région : elles ne constituent donc pas une identification, seulement une réduction de
surface. La protection réelle reste le mot de passe et TLS.

**Procéder dans cet ordre** : ajouter les trois plages, vérifier que l'application et
le poste d'administration accèdent toujours à la base, **puis seulement** supprimer
`0.0.0.0/0` **et** `::/0`. En laisser une seule annule tout le bénéfice. En cas de
blocage, remettre `0.0.0.0/0` rétablit l'accès en quelques secondes — contrairement au
pare-feu GoDaddy, ce réglage est entièrement sous votre contrôle.

### 1.5 Contraintes propres aux MySQL managés

- **`sql_require_primary_key=ON`**, non désactivable (privilège `SUPER` non accordé).
  Prisma génère les tables de liaison many-to-many implicites **sans clé primaire** :
  toute migration en créant une échouera avec l'erreur `3750`. Corrigé en ajoutant
  `PRIMARY KEY (A, B)` dans la migration concernée — cf.
  `20260824090000_add_dossier_pieces`.
- **Pas de privilège `SUPER`** : un dump contenant `DEFINER=...` sur des vues échouera
  (`ERROR 1449`). Recréer les vues via les migrations Prisma plutôt que de les
  restaurer depuis un dump.
- **Type `JSON` natif** (MySQL 8.4) là où MariaDB stockait du texte : les clés d'objet
  sont normalisées et réordonnées. Différence sans conséquence — le contenu reste
  sémantiquement identique — mais elle fausse toute comparaison de dumps octet à octet.

### 1.6 Sauvegarde et restauration

Le palier Developer inclut les sauvegardes automatiques. Pour un export manuel :

```bash
mysqldump -h <host> -P <port> -u avnadmin -p<password> \
  --single-transaction --no-tablespaces --default-character-set=utf8mb4 \
  --ssl-mode=REQUIRED col_invent > backup.sql
```

⚠️ **Toujours préciser `--default-character-set=utf8mb4`**, à l'export **comme à
l'import**. Sans cela les caractères accentués sont tronqués silencieusement
(`Carte résident` → `Carte r`) — l'erreur ne se voit qu'en relisant les données.
Pour un volume modeste, une copie table à table via Prisma est plus sûre : les deux
connexions négocient l'`utf8mb4` nativement, ce qui élimine le problème à la racine.

## 2. Variables d'environnement (Render → Environment)

Voir [.env.example](.env.example) pour la liste commentée. En production :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | **Production (cPanel)** : `mysql://<user>:<mdp>@<hote-cpanel>:3306/col_invent`. **Repli (Aiven)** : `mysql://avnadmin:<mdp>@<hote>.aivencloud.com:<port>/col_invent?sslaccept=accept_invalid_certs`. Jamais `localhost` — mot de passe percent-encodé si caractères spéciaux |
| `AUTH_SECRET` | valeur générée avec `openssl rand -base64 32` — **différente** de celle utilisée en dev, jamais commitée |
| `NODE_ENV` | `production` |
| `DOCUMENTS_STORAGE_PATH` | point de montage du disque persistant Render (§4) |

`AUTH_SECRET` en production conditionne aussi le cookie de session `secure: true`
(`src/lib/auth/session.ts` / `auth-service.ts`, cf. [SECURITY.md](SECURITY.md)) — un
`NODE_ENV` mal positionné dégraderait silencieusement la sécurité des cookies.

**TLS vers la base** : Aiven impose le chiffrement. Le `?ssl-mode=REQUIRED` affiché
dans sa console est une option du client MySQL en ligne de commande — Prisma ne la
comprend pas et attend `sslaccept`. Deux valeurs possibles :

| Valeur | Effet |
|---|---|
| `sslaccept=accept_invalid_certs` | Chiffre la liaison **sans vérifier** le certificat du serveur |
| `sslaccept=strict` + `sslcert=<chemin-ca.pem>` | Chiffre **et** vérifie l'identité du serveur |

La configuration actuelle utilise `accept_invalid_certs` : la liaison est chiffrée,
mais un intercepteur pourrait théoriquement se faire passer pour la base. **Durcissement
à prévoir** : télécharger le certificat CA depuis la console Aiven (*CA certificate →
Show*), l'embarquer dans le dépôt (il n'est pas secret) et passer en `strict`. Le
filtrage IP (§1.4) réduit déjà fortement l'exposition, mais ne remplace pas la
vérification du certificat.

## 3. Création du service Render

1. Render → **New → Web Service** → connecter le dépôt GitHub.
2. Runtime : **Node**.
3. Build command : `npm install --include=dev && npm run build`
   (`@prisma/client` déclenche automatiquement `prisma generate` via son propre
   `postinstall` lors de `npm install` — aucune étape manuelle supplémentaire.
   `--include=dev` est **nécessaire** : `NODE_ENV=production` étant posé en
   variable d'environnement Render — section 2 — `npm install` sauterait sinon
   les `devDependencies`, qui incluent pourtant `tailwindcss`/`typescript`/
   `prisma`, indispensables pour *construire* l'app. Bug réel rencontré au
   premier déploiement — voir « État actuel » en tête de ce document.)
4. Start command : `npm run start`
5. Health check path : **`/api/health`** (route publique ajoutée en Phase 15, voir
   [API.md](API.md#get-apihealth)). ⚠️ Depuis l'incident du 21/08/2026 (§9), cette
   route répond **200 même si la base est injoignable**, en signalant l'état dans le
   corps (`status: "degraded"`). La supervision doit donc porter sur le **corps** de la
   réponse (`status !== "ok"`), **pas** sur le code HTTP.
6. Renseigner les variables d'environnement de la section 2.

## 4. Stockage des documents — disque persistant obligatoire

⚠️ Point déjà signalé en Phase 11 ([ARCHITECTURE.md](ARCHITECTURE.md)) : le disque
d'une instance Render standard est **éphémère** (perdu à chaque redéploiement/restart).
`LocalStorageProvider` (`src/lib/storage/`) écrit les documents numérisés sur disque —
sans disque persistant, tout document uploadé disparaît au prochain déploiement.

Avant la mise en production réelle, deux options :

- **Render Persistent Disk** (le plus simple, changement de code nul) : attacher un
  disque au service, monté par exemple sur `/var/data/documents`, puis définir
  `DOCUMENTS_STORAGE_PATH=/var/data/documents`.
- **Provider externe (S3-compatible)** : implémenter un nouveau `StorageProvider`
  (interface déjà prête, voir `src/lib/storage/storage-provider.ts`) sans toucher au
  code appelant — solution préférable si l'application doit un jour tourner sur
  plusieurs instances (un disque Render n'est monté que sur une seule instance, donc
  incompatible avec un scaling horizontal).

## 5. Migrations et données de référence

**Ne jamais** utiliser `prisma migrate dev` ni `db push --force-reset` en production
(règle absolue du cahier des charges — destructif). Séquence correcte :

1. Premier déploiement (base vide) : exécuter une fois
   ```bash
   npm run db:migrate:deploy
   ```
   depuis un environnement ayant accès à `DATABASE_URL` de production — soit un Shell
   Render (Render → service → Shell), soit un Job Render ponctuel, soit en local avec
   `DATABASE_URL` temporairement pointée sur la base de prod (déconseillé, préférer le
   Shell Render pour ne jamais faire transiter les identifiants de prod localement).
2. Référentiels de base (rôles, permissions) : la fonction `seedRolesAndPermissions`
   de `prisma/seed.ts` doit être exécutée au moins une fois — **mais le seed complet
   du fichier génère aussi ~300 dossiers et 6 comptes de démonstration fictifs**
   (`Demo@2026!`, voir SECURITY.md). Pour un vrai déploiement de production, **ne pas
   lancer `npm run db:seed` tel quel** : revoir `prisma/seed.ts` avec le métier pour
   déterminer les rôles/comptes/référentiels (communes, lotissements, natures de
   dossier) réels à charger, à l'exclusion des dossiers fictifs et comptes démo — cette
   décision doit être **validée avec le métier**, pas prise unilatéralement par le code.
3. Vérification post-migration : `npm run db:verify` (contre `DATABASE_URL` de prod)
   confirme tables, vues de reporting et référentiels attendus.

## 6. Domaine personnalisé (optionnel)

Pour faire pointer un sous-domaine existant (registrar quelconque, ex. GoDaddy) vers
Render au lieu d'utiliser l'URL `*.onrender.com` :

1. **Préférer un sous-domaine** (`app.mondomaine.com`, `geoarchives.mondomaine.com`...)
   plutôt que le domaine racine si celui-ci héberge déjà un autre site — éviter tout
   conflit avec l'existant.
2. Render → service → **Settings → Custom Domains → Add Custom Domain** → saisir le
   sous-domaine choisi. Render affiche l'enregistrement **CNAME** à créer (hostname =
   le sous-domaine seul, valeur = `<nom-service>.onrender.com`).
3. Chez le registrar (DNS du domaine) : ajouter ce CNAME. **Vérifier au préalable
   qu'aucun enregistrement n'existe déjà sous ce nom** (A, CNAME ou autre) — un DNS
   n'autorise pas deux enregistrements sur le même nom ; en cas de conflit, soit
   supprimer l'ancien enregistrement (si inutilisé), soit choisir un autre nom de
   sous-domaine.
4. Propagation généralement rapide (quelques minutes à quelques heures, jusqu'à 24-48h
   annoncées par certains registrars) — Render vérifie et émet le certificat HTTPS
   automatiquement une fois le DNS résolu.

## 7. Vérification post-déploiement

- [ ] `GET https://<votre-domaine>/api/health` → `{ "status": "ok", "database": "up", ... }`
- [ ] `/login` accessible, connexion avec un compte réel fonctionne
- [ ] Filtrage IP Aiven actif (§1.4) : l'application **et** le poste d'administration
      joignent la base, `0.0.0.0/0` et `::/0` supprimés des *Allowed IP addresses*
- [ ] Cookie de session envoyé avec `Secure` (vérifier dans les DevTools réseau —
      nécessite HTTPS, automatique sur Render)
- [ ] Upload d'un document puis redémarrage du service → le document est toujours
      accessible (valide que le disque persistant est bien monté, §4)
- [ ] `/administration/audit` (si permission) montre bien les événements de connexion
- [ ] Export CSV/XLSX fonctionne (valide l'accès disque temporaire pour `exceljs`)

## 8. Points de sécurité spécifiques à la mise en production

Repris et complétés depuis [SECURITY.md](SECURITY.md) :

- **Rate limiting du login en mémoire process** (`src/lib/auth/rate-limit.ts`) : ne
  protège pas un déploiement multi-instances Render (scaling horizontal). Suffisant
  pour une instance unique (cas par défaut de ce déploiement) ; documenté comme
  limite connue si un scaling horizontal est envisagé plus tard (remplacer par un
  store partagé, Redis par exemple).
- **`AUTH_SECRET`** : généré spécifiquement pour la production, jamais réutilisé
  depuis le `.env` de développement, jamais commité.
- **`exceljs`** porte une vulnérabilité modérée transitive (`uuid`) — acceptée et
  documentée (SECURITY.md), à réévaluer périodiquement (`npm audit`).
- **HTTPS** : automatique sur Render (certificat géré) — aucune action requise, mais
  vérifier que l'URL finale utilisée par les utilisateurs est bien en `https://`.

## 9. Incident du 21/08/2026 — blocage réseau GoDaddy et migration vers Aiven

**Symptôme** : `502` sur *toutes* les URL, y compris les ressources statiques
(`/icon.png`). Logs Render : `Can't reach database server at
p3plzcpnl504395...:3306`, en boucle, alors que l'app démarrait bien
(`✓ Ready in 486ms`) et que la base répondait normalement depuis l'extérieur
(~1,5 s depuis un poste de développement).

**Enchaînement** : Render ne joignait plus la base → `/api/health` (qui exécutait un
`SELECT 1` à chaque appel) renvoyait 503 → Render marquait l'instance non saine et la
retirait du routage → 502 sur tout, derrière une page d'erreur opaque de l'hébergeur.

**Cause racine** : blocage réseau **côté cPanel/GoDaddy**, pas côté application. Deux
facteurs aggravants, corrigés depuis :

- Le health check ouvrait une connexion MySQL toutes les ~5 s, soit **~17 000
  connexions/jour depuis une seule IP** vers un hébergement mutualisé — de quoi
  déclencher le pare-feu de l'hébergeur (CSF/LFD bannit une IP sur ce motif). Le
  résultat de la sonde est désormais mémorisé 30 s (`PROBE_TTL_MS`).
- Le pool Prisma n'était pas borné (défaut : `nb_CPU * 2 + 1`), au-dessus de ce que
  tolère un `max_user_connections` de cPanel mutualisé (souvent 10-25). Fixé à
  `connection_limit=5` / `pool_timeout=20` dans `src/lib/prisma/client.ts`.

**Résolution retenue : migration de la base vers Aiven** (§1). Les pistes côté
hébergeur ont toutes été écartées par le diagnostic ci-dessous ; sur du mutualisé
GoDaddy, seul leur support peut lever un filtrage réseau, avec un délai et une
issue incertains — inacceptable pour un service en exploitation.

**Méthode de diagnostic** (réutilisable pour toute panne « base injoignable ») —
les hypothèses ont été éliminées dans cet ordre :

| Hypothèse | Comment l'écarter |
|---|---|
| Base éteinte | S'y connecter depuis un poste tiers |
| Droits MySQL / whitelist | Vérifier les hôtes autorisés (`%` couvrait déjà tout) |
| Identifiants | Tester la chaîne exacte hors application |
| Résolution DNS / IPv6 | Remplacer le nom d'hôte par l'IPv4 dans `DATABASE_URL` |
| Format de l'URL | Lire le message d'erreur : un défaut de protocole est explicite |
| Plafond de connexions | Un dépassement donne un **rejet immédiat**, pas un timeout |
| **Filtrage réseau** | **Timeout franc (~5 s) alors qu'un autre poste passe** |

Le signal décisif est la **nature de l'échec** : un `timeout` signifie des paquets
silencieusement jetés (règle `DROP` d'un pare-feu), là où un `connection refused` ou
un message MySQL explicite oriente vers la configuration. Comparer depuis deux
origines réseau différentes, à la même minute, tranche en une seule mesure.

**À retenir** : un `502` global ne signifie pas forcément que l'application est
cassée — vérifier d'abord la connectivité base depuis l'extérieur, ce qui distingue
immédiatement « app en panne » de « base injoignable depuis l'hébergeur ». Depuis le
découplage de la sonde (§3), ce cas n'entraîne plus de blackout : le site reste
debout et `/api/health` renvoie `status: "degraded"`.

### 9.1 Épilogue — retour sur cPanel le 24/08/2026

Le blocage GoDaddy a **expiré de lui-même** au bout de quelques jours. Notez la
nuance : il a expiré, il n'a pas été *levé* — le filtrage reste hors de contrôle et
**rien n'exclut sa réapparition**. Les deux correctifs applicatifs (sonde mémorisée
30 s, pool borné à 5) réduisent nettement le risque de re-déclencher l'anti-abus, mais
ne le suppriment pas.

La base de production a donc été **ramenée sur cPanel**. Le service Aiven reste en
place : il constitue une solution de repli déjà éprouvée, réactivable en changeant une
seule variable d'environnement.

**Réconciliation des données** — entre le 21/08 et le 24/08, l'application écrivait sur
Aiven. Le retour sur cPanel laissait donc de côté tout ce qui avait été produit dans
l'intervalle : 1 dossier, 1 compte utilisateur, 45 entrées d'audit, 5 liaisons
types de pièces, plus l'historique associé — **61 lignes sur 9 tables**, reportées
d'Aiven vers cPanel en préservant les identifiants d'origine (indispensable : les clés
étrangères en dépendent).

**À retenir si la situation se reproduit** : faire vivre deux bases en parallèle est le
vrai danger. Chaque jour d'écriture sur l'une creuse l'écart avec l'autre. Trancher
rapidement laquelle fait foi, et reporter dans la foulée. La procédure de contrôle
utilisée ici — comparaison table par table sur les clés primaires, vérification des
compteurs auto-incrémentés, contrôle des orphelins de clés étrangères — est
reproductible avec Prisma sur les deux bases simultanément.

> **Piège de migration** : le fichier `20260824090000_add_dossier_pieces` a été modifié
> après application (ajout de `PRIMARY KEY (A, B)` pour Aiven), ce qui a désynchronisé
> sa somme de contrôle dans `_prisma_migrations` côté cPanel. Corrigé en alignant le
> schéma (ajout de la clé primaire, que MariaDB n'exigeait pas) **puis** la somme de
> contrôle. Toute modification d'une migration déjà appliquée impose de vérifier
> ce point sur **chaque** base où elle est passée.

## 10. Rollback

Render conserve l'historique des déploiements (**Render → service → Deploys**) —
revenir à un déploiement précédent est un clic. Ceci ne rejoue **aucune** migration en
arrière : une migration de schéma appliquée reste appliquée. En cas de migration
problématique, préparer une migration Prisma corrective plutôt que de tenter un
rollback de schéma manuel en base.
