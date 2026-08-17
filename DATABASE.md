# Base de données — GeoArchives-MULCV

Base cible : **MySQL 8 / MariaDB**, port `3306`. ORM : **Prisma 6.19.3** (générateur classique `prisma-client-js`).

> Nom de base recommandé : `mulcv_archivage`. Si l'hébergeur cPanel préfixe automatiquement
> le nom (ex. `cpanelusername_mulcv_archivage`), utiliser le nom réellement généré et le
> reporter dans `DATABASE_URL`.

## 1. Vue d'ensemble

Le schéma complet est défini dans [`prisma/schema.prisma`](prisma/schema.prisma) — c'est la
source de vérité unique. Il est entièrement reproductible sur une base vide via :

```bash
npx prisma migrate deploy   # production
npx prisma migrate dev      # développement (crée aussi la migration si besoin)
npm run db:seed
npm run db:verify
```

## 2. Tables

| Domaine | Table | Rôle |
|---|---|---|
| RBAC | `roles`, `permissions`, `role_permissions` | Contrôle d'accès basé sur les rôles |
| Identité | `users`, `operateurs` | Comptes applicatifs et fiches opérateur terrain |
| Référentiels | `communes`, `lotissements`, `natures_dossier` | Listes de valeurs pour la collecte |
| Workflow | `workflow_statuses`, `workflow_transitions`, `dossier_history` | Configuration et traçabilité du cycle métier |
| Métier | `dossiers` | Table centrale — fiche CG1020 + suivi applicatif |
| Documents | `documents` | Métadonnées des fichiers numérisés (pas de blob en base) |
| Process | `numerisations`, `indexations`, `archivages` | Historique des opérations par dossier |
| Qualité | `quality_checks`, `anomalies` | Contrôle qualité et suivi des anomalies |
| Data ops | `imports`, `exports` | Traçabilité des imports/exports en masse |
| Système | `audit_logs`, `notifications`, `settings` | Journalisation, notifications, paramètres |

Détail complet des colonnes : voir `prisma/schema.prisma` (commenté par section, aligné sur
le cahier des charges §9 à §32).

## 3. Origine des champs — fiche CG1020 vs. suivi applicatif

Sur `dossiers`, seuls les champs suivants proviennent de la fiche papier **CG1020** :

```
libelleCarton, codeBarres, numeroGuichet, numeroDdu, numeroDirectionService, referenceClassement,
numeroIlot, numeroLot, superficie, numeroTitreFoncier,
communeId, lotissementId, natureDossierId,
nom, prenoms, adresse, telephone, email,
personneContact, mobile
```

> **Note (Phase 15+)** : `numeroDdu` — anciennement libellé « N° DDU » (saisie libre) — a
> été repurposé en **« Direction/Service concerné(e) »**, une liste fermée (voir
> `DIRECTION_SERVICE_OPTIONS` dans `src/lib/validation/dossier.ts` : GUF, DDU, DUDU, DGUF,
> DTC, GUPCCU, AGEF, SDA, SCPA, SBICU, DGCMA, DEMA, DCM, DMISSA, DGLCV, DICAF, DGLPI, DCCV,
> SALA, DARRU, ANAH, SONAPIE, DAJC) avec une option « Autres » qui bascule la saisie en
> texte libre. Le nom de colonne (`numero_ddu`) a été conservé pour éviter une migration de
> renommage sur une colonne déjà en usage — seule sa sémantique a changé. `numeroDirectionService`
> est un nouveau champ ajouté juste à côté, portant le numéro de référence propre à la
> direction/service choisie (« Numéro Direction/Service » dans l'interface).
>
> **Note (Phase 15+)** : `lotissementId` (FK vers `lotissements`) n'est plus renseigné via
> un `<Select>` dépendant de la commune dans la Collecte — le référentiel lotissements
> n'étant pas systématiquement pré-rempli pour chaque commune (contrairement aux 201
> communes officielles importées), ce Select restait bloqué sur « Choisir d'abord une
> commune » sans option disponible. Le formulaire collecte désormais un nom en saisie
> libre (`lotissementNom`, non persisté tel quel), résolu côté serveur vers une fiche
> `lotissements` réelle — réutilisée si elle existe déjà pour cette commune (comparaison
> insensible à la casse), sinon créée à la volée (code généré, ex. `CI-001-LOT-001`) — voir
> `resolveLotissementId()` dans `src/lib/services/dossier-service.ts`. La colonne
> `lotissementId` du modèle `Dossier` reste une FK inchangée ; dashboards, exports et
> filtres n'ont donc nécessité aucune modification.

Tous les autres champs (`reference`, les 5 `statut*`, les 5 `date*`, `nombrePages`,
`observations`, `createdAt`/`updatedAt`) sont des **ajouts applicatifs** pour piloter le
processus métier — ils ne figurent pas sur la fiche CG1020.

## 4. Décisions de conception documentées

- **`operateurs` séparée de `users`** : conservée car explicitement référencée comme clé
  étrangère par `dossiers`, `numerisations`, `indexations`, `archivages` (cahier des charges
  §9), et un opérateur terrain peut exister sans compte de connexion. Relation `userId`
  optionnelle pour couvrir ce cas.
- **5 statuts indépendants sur `dossiers`** (`statutCollecte`, `statutValidation`,
  `statutNumerisation`, `statutIndexation`, `statutArchivage`) plutôt qu'un statut global
  unique : ce découpage est explicitement demandé (§15) et correspond exactement aux
  colonnes attendues dans la liste `/dossiers` (§43) et aux formules de taux du dashboard
  (§47). La cohérence des transitions (ex. impossible d'archiver un dossier non indexé)
  est appliquée en couche service, pas en contrainte SQL — documenté comme **choix
  technique**.
- **`communes` liée en 1 FK par dossier** (`communeId`) alors que la fiche CG1020 indique
  « COMMUNE(S) » au pluriel : interprété comme un champ de sélection unique par dossier
  (la commune est de toute façon dérivable du lotissement choisi). **Hypothèse à confirmer
  avec le métier** si un dossier doit réellement pouvoir couvrir plusieurs communes.
- **Prisma fixé en version 6.19.3** plutôt que la 7.x proposée par défaut par `npm install
  prisma@latest` : la v7 change le mode de configuration (`prisma.config.ts`, client généré
  hors de `@prisma/client`, `.env` non auto-chargé), ce qui complique le déploiement
  Render/cPanel décrit dans le cahier des charges sans bénéfice pour ce projet. Choix
  technique révisable plus tard.
- **Stockage des documents** : seules les métadonnées (`documents`) sont stockées en base ;
  aucun blob. `storageProvider` (`LOCAL | CPANEL | S3 | OTHER`) prépare le branchement d'un
  stockage externe sans migration de schéma.

## 5. Contraintes UNIQUE

`users.email`, `roles.code`, `permissions.code`, `communes.code`, `lotissements.code`,
`natures_dossier.code`, `dossiers.reference`, `dossiers.codeBarres`,
`operateurs.matricule`, `role_permissions(roleId, permissionId)`,
`workflow_statuses(workflowType, code)`, `settings.key`.

## 6. Index

Voir `@@index` dans `prisma/schema.prisma` sur `dossiers` : `reference` (via unique),
`codeBarres` (via unique), `numeroDdu`, `numeroGuichet`, `referenceClassement`,
`numeroIlot`, `numeroLot`, `numeroTitreFoncier`, `communeId`, `lotissementId`,
`natureDossierId`, `operateurId`, les 5 `statut*`, `createdAt`, plus deux index composites
utiles au dashboard (`communeId+statutArchivage`, `operateurId+statutValidation`).

## 7. Vues de reporting

Définies dans [`prisma/sql/reporting_views.sql`](prisma/sql/reporting_views.sql) (source de
vérité) et appliquées via une migration Prisma dédiée :

`vw_dashboard_global`, `vw_dossiers_par_commune`, `vw_dossiers_par_operateur`,
`vw_dossiers_par_statut`, `vw_evolution_collecte`, `vw_evolution_numerisation`,
`vw_evolution_indexation`, `vw_evolution_archivage`.

## 8. Seed

`prisma/seed.ts` génère des données **strictement fictives** : 4 rôles, ~22 permissions,
6 utilisateurs de démonstration (1 admin, 1 superviseur, 3 opérateurs, 1 consultation —
mot de passe unique `Demo@2026!`, à ne jamais utiliser en production), 5 communes,
10 lotissements, 5 natures de dossier, les statuts de workflow, et ~300 dossiers fictifs
répartis sur tout le pipeline (avec historique, numérisation, indexation, archivage et
quelques anomalies) pour peupler des dashboards réalistes.

## 9. Vérification

`npm run db:verify` ([`scripts/db-verify.ts`](scripts/db-verify.ts)) contrôle : connexion,
présence des tables attendues, données de référence, seed, intégrité référentielle de
base, et les requêtes principales utilisées par le dashboard.
