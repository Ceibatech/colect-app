# Déploiement — GeoArchives-MULCV (Phase 15, §95/§96)

Cible : **GitHub → Render (application Next.js) → MySQL/MariaDB hébergé sur cPanel →
phpMyAdmin** (schéma complet dans [ARCHITECTURE.md](ARCHITECTURE.md#2-architecture-technique)).
Render héberge uniquement l'application ; la base de données reste sur l'hébergement
cPanel existant — jamais de MySQL local en production.

## 0. Checklist avant de commencer

- [ ] Code poussé sur un dépôt GitHub (`main` protégée, déploiements depuis une branche
      ou des tags, au choix)
- [ ] Accès cPanel avec l'outil **MySQL® Databases** et **phpMyAdmin**
- [ ] Un compte Render
- [ ] `openssl rand -base64 32` disponible (ou tout générateur équivalent) pour
      `AUTH_SECRET`

## 1. Base de données MySQL/MariaDB sur cPanel

1. cPanel → **MySQL® Databases** → créer une base (le nom sera préfixé automatiquement
   par cPanel, ex. `cpanelname_geoarchives`).
2. Créer un utilisateur dédié (jamais l'utilisateur root cPanel) et l'associer à cette
   base avec **tous les privilèges**.
3. cPanel → **Accès distant MySQL®** (Remote MySQL) → autoriser l'IP sortante de
   Render. Render n'a pas d'IP sortante fixe sur les plans standards : soit passer par
   un plan Render avec IP statique, soit (plus courant en pratique chez les
   hébergeurs mutualisés) autoriser `%` temporairement le temps du déploiement puis
   restreindre, soit vérifier si l'hébergeur propose un accès restreint par nom
   d'hôte. **À valider avec l'hébergeur cPanel** — ce point est spécifique à chaque
   infogérance et ne peut pas être généralisé ici.
4. Noter les informations de connexion : hôte MySQL distant (souvent différent de
   `localhost`, ex. `serveurXX.hebergeur.com`), port `3306`, nom de base, utilisateur,
   mot de passe → ils forment `DATABASE_URL` :
   ```
   mysql://UTILISATEUR:MOT_DE_PASSE@HOTE_DISTANT:3306/NOM_BASE
   ```
5. phpMyAdmin (accessible depuis cPanel) sert de client d'administration/consultation
   directe — utile pour vérifier l'état de la base indépendamment de l'application.

## 2. Variables d'environnement (Render → Environment)

Voir [.env.example](.env.example) pour la liste commentée. En production :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `mysql://...` vers le serveur cPanel (jamais `localhost`) |
| `AUTH_SECRET` | valeur générée avec `openssl rand -base64 32` — **différente** de celle utilisée en dev, jamais commitée |
| `NODE_ENV` | `production` |
| `DOCUMENTS_STORAGE_PATH` | point de montage du disque persistant Render (§4) |

`AUTH_SECRET` en production conditionne aussi le cookie de session `secure: true`
(`src/lib/auth/session.ts` / `auth-service.ts`, cf. [SECURITY.md](SECURITY.md)) — un
`NODE_ENV` mal positionné dégraderait silencieusement la sécurité des cookies.

## 3. Création du service Render

1. Render → **New → Web Service** → connecter le dépôt GitHub.
2. Runtime : **Node**.
3. Build command : `npm install && npm run build`
   (`@prisma/client` déclenche automatiquement `prisma generate` via son propre
   `postinstall` lors de `npm install` — aucune étape manuelle supplémentaire).
4. Start command : `npm run start`
5. Health check path : **`/api/health`** (route publique ajoutée en Phase 15 — vérifie
   une vraie connexion base, pas seulement que le process répond, voir
   [API.md](API.md#get-apihealth)).
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

1. Premier déploiement (base cPanel vide) : exécuter une fois
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

## 6. Vérification post-déploiement

- [ ] `GET https://<votre-app>.onrender.com/api/health` → `{ "status": "ok", "database": "up", ... }`
- [ ] `/login` accessible, connexion avec un compte réel fonctionne
- [ ] Cookie de session envoyé avec `Secure` (vérifier dans les DevTools réseau —
      nécessite HTTPS, automatique sur Render)
- [ ] Upload d'un document puis redémarrage du service → le document est toujours
      accessible (valide que le disque persistant est bien monté, §4)
- [ ] `/administration/audit` (si permission) montre bien les événements de connexion
- [ ] Export CSV/XLSX fonctionne (valide l'accès disque temporaire pour `exceljs`)

## 7. Points de sécurité spécifiques à la mise en production

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

## 8. Rollback

Render conserve l'historique des déploiements (**Render → service → Deploys**) —
revenir à un déploiement précédent est un clic. Ceci ne rejoue **aucune** migration en
arrière : une migration de schéma appliquée reste appliquée. En cas de migration
problématique, préparer une migration Prisma corrective plutôt que de tenter un
rollback de schéma manuel en base.
