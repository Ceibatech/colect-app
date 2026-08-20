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
| Référentiels | `sites`, `entrepots`, `equipements`, `communes`, `lotissements`, `natures_dossier`, `types_piece` | Listes de valeurs pour la collecte |
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
etatCarton, etatCartonDescription,
numeroIlot, numeroLot, superficie, numeroTitreFoncier,
communeId, lotissementId, natureDossierId, etatDossier, etatDossierDescription,
nombrePieces, typesPieces, autresPieces,
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
>
> **Note (Phase 15+)** : `natureDossierId` (FK vers `natures_dossier`) suit le même
> principe. Les 41 natures réelles fournies par le métier (`scripts/import-natures.ts`)
> remplacent les 5 natures fictives du seed — trop nombreuses pour rester un `RadioGroup`
> dans la Collecte, remplacé par un `<Select>` + option « Autres » (saisie libre
> `natureDossierAutre`, résolue côté serveur — `resolveNatureDossierId()` — vers une fiche
> existante ou créée à la volée, sans scope par commune contrairement au lotissement).
>
> **Ajout (Phase 15+)** : `etatCarton`/`etatDossier` (enum `EtatConservation` :
> `BON_ETAT`/`DEGRADE`) et leur description associée
> (`etatCartonDescription`/`etatDossierDescription`, uniquement renseignée si dégradé) —
> demande métier directe, alimentent le nouveau tableau d'indicateurs du dashboard
> principal (§48 : Nbre de cartons / dossiers / cartons dégradés / dossiers dégradés).
>
> **Ajout (Phase 16+)** : `operateurs.supervisor_id` (FK nullable vers `users.id`,
> `ON DELETE SET NULL`) — affecte un opérateur à un superviseur. Un opérateur a au plus un
> superviseur ; un superviseur peut avoir plusieurs opérateurs. Détermine le périmètre de
> validation ET de consultation d'un compte SUPERVISEUR (dossiers, export, qualité,
> dashboard) — voir `src/lib/services/access-scope.ts` et ARCHITECTURE.md §6. Gérée depuis
> `/administration/utilisateurs`, jamais directement en base.
>
> **Ajout (Phase 16+)** : `dossiers.site_id` (FK nullable vers `sites.id`, `ON DELETE
> SET NULL`) — site d'archivage physique auquel le dossier est rattaché, choisi en
> première étape de la Collecte (avant Identification). Table `sites` : référentiel géré
> depuis `/administration/sites` (mêmes conventions que `communes`/`lotissements` —
> jamais de suppression physique, `is_active` retire une entrée des listes proposées).
> Champs alignés sur la fiche "Informations générales du site" fournie par le métier
> (code, nom, type, description, statut, date de mise en service, responsable,
> téléphone, email, adresse, commune — FK vers `communes` existant, quartier, ville,
> région). `site_id` reste **optionnel** à la soumission (contrairement à `communeId`) :
> le référentiel est vide à l'introduction de ce champ, le rendre obligatoire aurait
> bloqué toute la Collecte tant qu'aucun site n'existe — à réévaluer une fois le
> référentiel peuplé.
>
> **Ajout (Phase 17+)** : géolocalisation du site — `sites.latitude`/`longitude`/`altitude`/
> `precision_gps` (capturées via l'API Geolocation du navigateur, bouton "Capturer ma
> position GPS" dans `/administration/sites`), `sites.adresse_gps` (géocodage inverse
> best-effort côté serveur via OpenStreetMap/Nominatim — jamais depuis le navigateur, qui
> ne permet pas de fixer l'en-tête `User-Agent` requis par leur politique d'usage ; voir
> `reverseGeocodeSite()` dans `referentiels-admin-service.ts`), `sites.point_gps` (texte
> "lat, lon" dérivé, pratique à copier vers un outil cartographique externe). Et table
> `entrepots` : subdivision d'un site ("un site peut avoir un ou plusieurs entrepôts"),
> même conventions CRUD que `sites` (jamais de suppression physique), FK `site_id`
> obligatoire. `dossiers.entrepot_id` (FK nullable vers `entrepots.id`) : précision en
> cascade sous le site choisi en Collecte, également optionnelle pour la même raison que
> `site_id` ci-dessus.
>
> **Ajout (Phase 17+)** : caractéristiques physiques de l'entrepôt — dimensions
> déclaratives (`surface_m2`, `longueur`, `largeur`, `hauteur_sous_plafond`,
> `nombre_niveaux`, `nombre_salles`, `nombre_zones_archivage`) et capacité déclarative
> (`nombre_rayonnages`, `nombre_travees`, `nombre_etageres`, `capacite_cartons_max`,
> `capacite_boites_max`, `capacite_theorique`). **Non stockés** en revanche : cartons
> occupés, capacité disponible et taux d'occupation — recalculés à la volée par
> `listAllEntrepots()` à partir du nombre réel de dossiers rattachés à l'entrepôt avec un
> `code_barres` renseigné (même convention "carton = dossier avec code-barres" que le
> tableau de bord, §48). Stocker une valeur "occupée" figée se serait désynchronisée du
> réel dès le premier dossier archivé ou déplacé.
>
> **Ajout (Phase 17+)** : conditions de conservation et sécurité de l'entrepôt —
> température/humidité (moyenne/min/max + présence et fonctionnement des systèmes de
> climatisation/déshumidification/contrôle), protection du bâtiment (eau, infiltrations,
> étanchéité, poussière, nuisibles), sécurité incendie (extincteurs, détecteurs, alarme,
> extinction automatique, dates de contrôle) et sécurité physique (gardiennage,
> vidéosurveillance, alarme anti-intrusion, contrôle d'accès, badge, serrure, registre des
> visiteurs). Tous nullable/déclaratifs, saisis/mis à jour au fil des relevés — les cases
> à cocher résolvent toujours en `true`/`false` depuis le formulaire (jamais tri-state),
> `NULL` en base signifiant simplement "jamais renseigné".
>
> **Ajout (Phase 17+)** : conditions d'accès de l'entrepôt (type d'accès, accès libre,
> autorisation/badge/contrôle d'identité nécessaires, horaires d'ouverture/fermeture,
> jours d'accès, accès week-end, responsable accès, contact urgence) — les items déjà
> couverts par la sécurité physique ci-dessus (gardiennage, vidéosurveillance, registre
> des visiteurs) ne sont pas dupliqués. Et nouvelle table `equipements` (inventaire :
> type, référence, marque, quantité, état — réutilise l'enum `EtatConservation` déjà en
> place pour carton/dossier —, dates d'acquisition/dernier contrôle/prochaine
> maintenance, observation), FK `entrepot_id` obligatoire (`ON DELETE CASCADE`). **Seul
> référentiel de ce module supprimable physiquement** : un équipement n'est référencé par
> aucun dossier (contrairement à sites/entrepôts/communes/lotissements/natures), le
> retirer de l'inventaire ne casse donc aucun historique métier — voir
> `deleteEquipement()` dans `referentiels-admin-service.ts`.
>
> **Ajout (Phase 18+)** : `dossiers.nombre_pieces` (nombre de pièces contenues dans le
> dossier) et `dossiers.autres_pieces` (texte libre, toute pièce ne relevant pas d'un type
> catégorisable). Et relation many-to-many implicite `dossiers` ↔ nouvelle table
> `types_piece` (table pivot `_DossierTypesPieces`, générée par Prisma) : « Types de pièces
> dans le dossier », liste fermée mais extensible depuis la Collecte
> (`TypesPiecesField.tsx`, étape « Dossier ») — cases à cocher pour les types existants
> (CNI, Carte résident, Carte consulaire, Extrait topo, Acte de naissance, seedés via
> `prisma/seed.ts`/`scripts/seed-tmp.js`) + possibilité d'ajouter un type absent de la
> liste, résolu côté serveur en find-or-create (`resolveTypesPieceIds()` dans
> `dossier-service.ts`), même principe que Lotissement/NatureDossier « Autres ». Référentiel
> `types_piece` administrable depuis `/administration/types-piece` (mêmes conventions —
> jamais de suppression physique). Champ distinct de `autres_pieces` ci-dessus : l'un
> catégorise (types connus/extensibles), l'autre est un fourre-tout en saisie libre.

Tous les autres champs (`reference`, les 5 `statut*`, les 5 `date*`, `nombrePages`,
`observations`, `createdAt`/`updatedAt`) sont des **ajouts applicatifs** pour piloter le
processus métier — ils ne figurent pas sur la fiche CG1020.

> **Ajout (Phase 19+)** : validation superviseur systématique à chaque étape
> opérationnelle, pas seulement à la Collecte. `StatutNumerisation`/`StatutIndexation`/
> `StatutArchivage` gagnent chacun deux valeurs : `A_VALIDER` (l'opérateur a agi, en
> attente du superviseur) et `REJETE` (renvoyé à l'opérateur, qui peut relancer l'action
> — repasse alors à `A_VALIDER`). `TERMINE` garde exactement sa sémantique actuelle
> ("étape effectivement terminée, débloque la suivante") — il n'est simplement plus
> atteint directement par l'opérateur, ce qui ne change aucune des vérifications déjà en
> place ailleurs (dashboard, export, gate de l'étape suivante...). Aucune colonne
> ajoutée : uniquement une extension des 3 enums MySQL existants. Nouvelles permissions
> `NUMERISATION_VALIDATE`/`REJECT`, `INDEXATION_VALIDATE`/`REJECT`,
> `ARCHIVAGE_VALIDATE`/`REJECT` (SUPERVISEUR + ADMIN), scopées aux opérateurs affectés au
> superviseur — même règle que `DOSSIER_VALIDATE`/`REJECT` pour la Collecte (cf.
> `assertSupervisorScope()` dans `workflow-service.ts`). Dossiers déjà `TERMINE` avant ce
> changement : considérés définitivement validés, aucun retraitement rétroactif.

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
`natures_dossier.code`, `types_piece.code`, `dossiers.reference`, `dossiers.codeBarres`,
`operateurs.matricule`, `role_permissions(roleId, permissionId)`,
`workflow_statuses(workflowType, code)`, `settings.key`.

## 6. Index

Voir `@@index` dans `prisma/schema.prisma` sur `dossiers` : `reference` (via unique),
`codeBarres` (via unique), `numeroDdu`, `numeroGuichet`, `referenceClassement`,
`numeroIlot`, `numeroLot`, `numeroTitreFoncier`, `communeId`, `lotissementId`,
`natureDossierId`, `operateurId`, les 5 `statut*`, `createdAt`, plus deux index composites
utiles au dashboard (`communeId+statutArchivage`, `operateurId+statutValidation`). Sur
`operateurs` : `supervisorId` (Phase 16+, utilisé par tout le cloisonnement SUPERVISEUR).

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
