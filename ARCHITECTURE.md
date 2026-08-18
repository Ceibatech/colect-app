# Architecture — GeoArchives-MULCV

## 1. Architecture fonctionnelle

### Cycle métier

```
COLLECTE → CONTRÔLE → VALIDATION → NUMÉRISATION → INDEXATION → ARCHIVAGE
```

### Workflow détaillé (état d'un dossier)

```
BROUILLON
   ↓
SOUMIS
   ↓
EN CONTRÔLE
   ↓
VALIDÉ ──────→ REJETÉ
   ↓
NUMÉRISÉ
   ↓
INDEXÉ
   ↓
ARCHIVÉ
```

Un dossier ne peut pas être ARCHIVÉ s'il n'est pas INDEXÉ, ni INDEXÉ s'il n'est pas
NUMÉRISÉ, ni NUMÉRISÉ s'il n'est pas VALIDÉ. Ces règles sont appliquées en couche
service (pas uniquement côté client) — voir §5 « aucune confiance au frontend seul ».

### Source fonctionnelle

La fiche d'inventaire **CG1020** est la référence pour les champs métier
(identification, foncier, dossier, titulaire, contact). Les champs de suivi
(statuts, dates, score qualité, historique) sont des ajouts applicatifs — voir le
détail dans [DATABASE.md](DATABASE.md#3-origine-des-champs--fiche-cg1020-vs-suivi-applicatif).

## 2. Architecture technique

```
UTILISATEUR
      │ HTTPS
      ▼
┌────────────────────────┐
│         RENDER          │
│  Next.js / React / TS   │
│  Tailwind / Recharts     │
│  API / Backend (native)  │
└───────────┬──────────────┘
            │ MySQL / TCP 3306 (jamais localhost en prod)
            ▼
┌────────────────────────┐
│         CPANEL           │
│    MySQL / MariaDB       │
└───────────┬──────────────┘
            ▼
       phpMyAdmin
```

## 3. Architecture logicielle (couches)

```
UI (composants React / shadcn)
   ↓
Components (présentation)
   ↓
Services (logique métier — validation, workflow, KPI, score qualité)
   ↓
Prisma (accès données)
   ↓
MySQL / MariaDB
```

La logique métier ne doit pas être écrite directement dans les composants React —
elle vit dans `src/lib/services/`.

## 4. Arborescence cible

```
src/
├── app/
│   ├── (auth)/
│   ├── dashboard/{direction,operateurs,geographie}/
│   ├── collecte/
│   ├── dossiers/[id]/
│   ├── qualite/
│   ├── import/
│   ├── export/
│   ├── administration/
│   └── api/
├── components/{ui,layout,dashboard,dossiers,collecte,charts,forms,tables}/
├── lib/{prisma,auth,services,validation,permissions,exports,utils}/
├── hooks/
├── types/
└── config/

prisma/
├── schema.prisma
├── seed.ts
├── sql/reporting_views.sql
└── migrations/

scripts/
└── db-verify.ts

tests/
├── unit/{validation,quality-scoring,permissions,rate,csv}.test.ts
├── api/{workflow,import-export,pages-permissions,dossiers-search}.spec.ts
├── e2e/full-cycle.spec.ts
└── helpers/{auth,db}.ts
```

État actuel : `prisma/`, `scripts/db-verify.ts`, `src/components/ui/` (shadcn),
`src/lib/auth/`, `src/lib/permissions/`, `src/lib/services/auth-service.ts`,
`src/proxy.ts`, `src/config/navigation.ts` et la coquille protégée
`src/app/(app)/layout.tsx` (sidebar + topbar + `requireUser()`) sont en place.
Les pages métier sous `(app)/` (dashboard, collecte, dossiers, qualité, import,
export, administration) sont pour l'instant des empty states cliquables
(`ModulePlaceholder`) protégés par permission — leur contenu réel sera construit
phase par phase (5 à 12).

**Note technique (shadcn/ui)** : ce projet utilise la variante shadcn basée sur
**Base UI** (`@base-ui/react`), pas Radix UI. Les composants composables
utilisent la prop `render={<Element />}` (pas `asChild`), et `MenuItem`
(dropdown) expose `onClick` — **pas** `onSelect` comme sous Radix (`onSelect`
existe en TypeScript mais correspond à l'événement natif de sélection de
texte, jamais déclenché par un clic). Le `Select` a aussi besoin de la prop
`items` (liste `{label, value}`) pour que `<Select.Value>` affiche le libellé
plutôt que la valeur brute. À retenir pour tout nouveau composant shadcn
ajouté dans les phases suivantes.

**Bugs réels trouvés et corrigés lors des tests manuels post-Phase 15** (console
navigateur, jamais visibles côté serveur/curl) :
- **`Button` + `render={<Link/>}` ou `render={<a/>}`** : Base UI avertit
  ("A component that acts as a button expected a native `<button>`") dès
  qu'un `<Button>` (`nativeButton` vaut `true` par défaut) est rendu comme un
  lien. Or les liens n'ont pas vocation à porter la sémantique bouton
  (`role="button"`, gestion clavier différente) — la documentation Base UI le
  déconseille explicitement, `nativeButton={false}` n'étant prévu que pour un
  tag neutre comme `<div>`, pas pour un `<a>`/`<Link>` qui a déjà sa propre
  sémantique. Corrigé partout (`DossiersTable`, `DossiersFilterBar`,
  `AuditFilterBar`, `ImportWizard`, `DocumentsPanel`, page détail dossier,
  page collecte) en stylant directement le `<Link>`/`<a>` avec
  `buttonVariants({...})` (exporté depuis `button.tsx`) au lieu de les
  envelopper dans `<Button render={...}>`.
- **`PaginationLink` (`pagination.tsx`)** : mismatch d'hydratation React sur
  `data-slot` — le `<a>` du `render` portait `data-slot="pagination-link"` en
  plus du `data-slot="button"` déjà posé par notre wrapper `Button`
  (`button.tsx`), et Base UI ne résolvait pas ce conflit de façon identique
  entre le rendu serveur et l'hydratation client. `data-slot="pagination-link"`
  n'étant référencé par aucun sélecteur CSS/JS, il a été retiré.
- **`Progress` (`aria-valuetext`)** : mismatch d'hydratation ("14%" côté
  serveur vs "14 %" côté client) — Base UI formate ce texte avec
  `Intl.NumberFormat` sur "la locale runtime de l'utilisateur", qui diffère
  entre le process Node (serveur) et le navigateur (client). Locale figée à
  `"fr-FR"` explicitement sur `<Progress>` (cohérent avec `lang="fr"` du
  layout racine et le reste des formatages de dates déjà en `fr-FR` partout
  ailleurs dans l'app) pour un rendu identique des deux côtés.

Ces trois bugs n'apparaissaient dans **aucun** des tests API/E2E (Playwright)
ni des vérifications `curl` : les erreurs Base UI sont des `console.error` et
les mismatchs d'hydratation ne se manifestent que lors de la ré-exécution
React côté client dans un vrai navigateur — invisibles en HTML statique. Cela
confirme la valeur du test manuel en navigateur en complément des tests
automatisés (voir aussi TESTING.md).

**Audit (Phase 12)** : `/administration/audit` consulte directement
`audit_logs` (déjà alimentée depuis la Phase 3 — connexions, dossiers,
workflow, qualité, import/export, documents), filtres serveur (utilisateur,
action, entité, période), détails avant/après par événement.
**Bug de permission réel trouvé et corrigé** : `ROLE_ONLY_ROUTE_PREFIXES`
bloquait tout `/administration/*` aux seuls ADMIN au niveau du proxy, alors
que SUPERVISEUR a la permission `AUDIT_VIEW` — il ne pouvait jamais atteindre
la page malgré une permission valide. Le préfixe générique a été retiré ;
chaque sous-page `/administration/*` vérifie déjà sa propre permission
exacte (USER_MANAGE, ROLE_MANAGE, REFERENTIEL_MANAGE, SETTINGS_MANAGE,
AUDIT_VIEW), ce qui suffit (§60). La gestion des utilisateurs/rôles/
référentiels (CRUD, hors périmètre explicite des 15 phases du cahier des
charges) reste en empty state.

**Documents (Phase 11)** : abstraction de stockage (`src/lib/storage/`,
interface `StorageProvider`) découplant les métadonnées (table `documents`)
du contenu binaire — implémentation `LocalStorageProvider` (disque, hors
`public/`) en V1, prête pour un provider S3/cPanel sans changer le code
appelant (§22/§56). Permission d'ajout/suppression rattachée à
`NUMERISATION_UPDATE` (aucune permission `DOCUMENT_*` au cahier des
charges §12) — choix documenté. ⚠️ Sur Render, le disque est éphémère : un
volume persistant ou un provider externe est nécessaire avant la mise en
production réelle (voir DEPLOYMENT.md, à compléter en Phase 15).

**Dashboard (Phase 9)** : palette catégorielle des graphiques Recharts fixée
dans `globals.css` (`--chart-1` à `--chart-5`, validée accessibilité/CVD via
le script du skill dataviz, ordre fixe Collecte/Validation/Numérisation/
Indexation/Archivage jamais permuté). Les vues SQL de reporting créées en
Phase 2 (`vw_dashboard_global`, `vw_evolution_*`, `vw_dossiers_par_commune`,
`vw_dossiers_par_operateur`, `vw_dossiers_par_statut`) sont directement
réutilisées par `dashboard-service.ts` — une vue manquante
(`vw_evolution_validation`) a été ajoutée par migration. **Hypothèse
documentée** : "Collectés" et "Soumis" (§46) partagent la même valeur dans ce
modèle (`statutCollecte = SOUMIS`), la fiche CG1020 n'ayant que deux états de
collecte — à confirmer avec le métier si une notion intermédiaire est
souhaitée. "Dossiers en retard" (dashboard Direction, §49) : seuil de 30 jours
sans mise à jour, choix applicatif faute de SLA officiel — À CONFIRMER AVEC LE
MÉTIER.

**Bug constaté et contourné — `Tabs.Panel` (Base UI)** : le masquage
automatique des panneaux inactifs ne se déclenchait pas de façon fiable dans
nos tests (les panneaux non actifs restaient visibles simultanément après un
changement d'onglet). Contournement adopté dans
[DossierDetailTabs.tsx](src/components/dossiers/DossierDetailTabs.tsx) :
`<Tabs>`/`<TabsList>`/`<TabsTrigger>` restent utilisés normalement pour la
navigation, mais le contenu de chaque onglet est rendu conditionnellement à
la main (`{tab === "x" && (...)}`) plutôt que via `<TabsContent>`. À
réutiliser pour toute future UI à onglets.

**Tests (Phase 13)** : trois niveaux — unitaire (Vitest, fonctions pures uniquement :
validation Zod, score qualité, matrice RBAC, taux KPI, CSV), API (Playwright `request`,
HTTP direct contre le serveur de dev réel avec un cookie de session miné par rôle) et
E2E (Playwright/Chromium, un scénario qui rejoue le cycle complet du cahier des charges
§72). Détail complet, y compris les pièges de sélecteurs Base UI et l'absence d'accès
réseau sortant pour télécharger un Chromium dédié (contourné via `channel: "chrome"` sur
le Chrome déjà installé) : voir [TESTING.md](TESTING.md). Deux petites extractions ont
été faites pour rendre des fonctions testables sans dépendance serveur :
`computeRate()` → `src/lib/utils/rate.ts` et `IMPORT_COLUMNS` →
`src/lib/validation/import-columns.ts` — même principe que la séparation déjà en place
entre `quality-scoring.ts` (pur) et `quality-service.ts` (`"use server"`) en Phase 8.

**Optimisation (Phase 14, §94)** :
- *Requêtes dupliquées éliminées* : `/dashboard` appelait `getDashboardKpis()` deux fois
  par rendu (directement, puis indirectement via `getPipelineFunnel()`), et `/qualite`
  ré-interrogeait et rescorait TOUS les dossiers trois fois (`getQualityOverview()`,
  `getScoreByOperateur()`, `getScoreByCommune()`). Les deux fonctions internes
  concernées (`getDashboardKpis`, `getScoredDossiers`) sont maintenant mémoïsées par
  requête avec `cache()` de React (même mécanisme que `getSession()` dans
  `current-user.ts`) — un seul aller-retour base réel par rendu de page.
- *Fuite mémoire corrigée* : le compteur anti-bruteforce du login
  (`src/lib/auth/rate-limit.ts`, `Map` en mémoire process) ne purgeait une entrée
  expirée que si la même clé était revisitée — une clé jamais retentée restait en
  mémoire indéfiniment. Purge opportuniste ajoutée (`sweepExpired()`, déclenchée par
  l'activité, pas de `setInterval`).
- *`error.tsx` ajouté* sous `(app)/` — remplace la page d'erreur générique Next.js par
  un message contrôlé (jamais de détail technique affiché, cohérent avec
  `apiErrorResponse()` côté API).
- *`loading.tsx` essayé puis retiré — bug réel constaté* : un `loading.tsx` partagé sous
  `(app)/` enveloppe automatiquement toute page enfant dans un `<Suspense>`. Or la
  quasi-totalité des pages appellent `requirePermission()` (`redirect()` en cas de refus,
  §60) — sous ce `Suspense`, le `redirect()` d'une page dénie n'est plus renvoyé comme un
  vrai 307 HTTP : le flux a déjà commencé avec un statut 200 avant que le throw ne soit
  traité, et Next le convertit en redirection côté client uniquement (corps HTML de
  `/dashboard?error=forbidden`, mais statut 200). Constaté via `tests/api/pages-permissions.spec.ts`
  (2 tests passés à 200 au lieu de 307), confirmé en isolant la cause par retrait/retest
  direct en curl. `error.tsx` seul n'a pas ce problème (revérifié isolément) — retenu.
  Le `loading.tsx` partagé a été supprimé plutôt que scopé page par page : le gain de
  confort perçu ne justifie pas le risque sur un mécanisme de sécurité (§60). Une
  Suspense locale, interne au contenu d'une page qui a déjà passé son `requirePermission()`
  avant tout retour JSX, resterait sûre si le besoin réapparaît.

## 5. Sécurité (principes appliqués dès la conception)

- RBAC en base (`roles`, `permissions`, `role_permissions`), pas de rôle en dur.
- Chaque permission doit être revérifiée côté serveur (API/Server Actions) —
  jamais uniquement côté frontend.
- Mots de passe hashés (bcrypt), jamais stockés en clair.
- Secrets (DATABASE_URL, AUTH_SECRET) uniquement en variables d'environnement,
  jamais commités (`.env` ignoré par git).
- Prisma protège nativement contre l'injection SQL (requêtes paramétrées).
- Toute opération sensible est journalisée dans `audit_logs`.

## 6. Roadmap des phases (cahier des charges §80-95)

| Phase | Contenu | Statut |
|---|---|---|
| 1 | Audit & architecture | ✅ Fait |
| 2 | Base de données (schema, migrations, seed, vues, vérification) | ✅ Fait — testé sur MySQL 8 réel |
| 3 | Authentification (login, session, rôles, permissions, middleware) | ✅ Fait — testé (login/logout/protection/audit) |
| 4 | Layout (sidebar, topbar, navigation, responsive) | ✅ Fait — testé (navigation filtrée par permission, thème, déconnexion) |
| 5 | Collecte (formulaire CG1020 multi-étapes) | ✅ Fait — testé de bout en bout (brouillon, reprise, soumission) |
| 6 | Dossiers (liste, détail, recherche, filtres) | ✅ Fait — testé (recherche, filtres, pagination, fiche détail) |
| 7 | Workflow (transitions contrôlées) | ✅ Fait — testé (préconditions, permissions, historique) |
| 8 | Qualité (score, anomalies, doublons) | ✅ Fait — testé (scoring, scan, anomalies, résolution) |
| 9 | Dashboard (KPI, Recharts, direction/opérateurs/géographie) | ✅ Fait — testé (KPI, 4 pages, 12 items §48 couverts) |
| 10 | Import / Export (Excel/CSV) | ✅ Fait — testé (aperçu, doublons, confirmation, export filtré) |
| 11 | Documents | ✅ Fait — testé (upload, téléchargement, suppression, cloisonnement) |
| 12 | Audit | ✅ Fait — testé (filtres, permissions, 21 événements réels vérifiés) |
| 13 | Tests (unitaires, API, E2E) | ✅ Fait — 82 tests unitaires (Vitest) + 53 tests API + 8 E2E complets (Playwright), voir [TESTING.md](TESTING.md) |
| 14 | Optimisation | ✅ Fait — requêtes dupliquées mémoïsées, fuite mémoire rate-limit corrigée, error.tsx ajouté, bug réel `loading.tsx`/`redirect()` trouvé et corrigé (retiré) |
| 15 | Production (GitHub → Render → cPanel) | ✅ Fait et **déployé en réel** — https://geoarchives.ceiba-analytics.com, base cPanel `col_invent`, voir [DEPLOYMENT.md](DEPLOYMENT.md) |

**Post-déploiement (Phase 15+)** : écran self-service « Mon compte » (`/compte`,
[ChangePasswordForm.tsx](src/components/account/ChangePasswordForm.tsx)) — tout
utilisateur connecté peut changer son propre mot de passe (revérification du mot
de passe actuel côté serveur, jamais de confiance dans le seul formulaire).
Protégé uniquement par `requireUser()` (pas de permission dédiée : ce n'est pas
une action administrative sur un tiers, à la différence de `USER_MANAGE`).
Accessible depuis le menu utilisateur (`UserMenu.tsx`).

**Écrans d'administration CRUD (Phase 15+, hors périmètre initial des 15 phases)** :
`/administration/communes`, `/lotissements`, `/natures` (référentiels géographiques —
création/édition, jamais de suppression physique : un référentiel déjà utilisé par un
dossier reste intègre, seule la désactivation `isActive` le retire des listes proposées
à la Collecte) et `/administration/utilisateurs` (comptes — création avec mot de passe
initial, modification, réinitialisation de mot de passe par un administrateur,
désactivation). Un utilisateur créé/modifié avec le rôle OPERATEUR obtient/perd
automatiquement une fiche `operateurs` liée (`user-admin-service.ts::nextOperateurMatricule`)
— sans ce lien, il ne pourrait pas apparaître dans les listes d'opérateurs actifs ni se
voir attribuer des dossiers (cf. `resolveOperateurId` dans `workflow-service.ts`).
`/administration/roles` reste **volontairement en lecture seule** (matrice
rôles × permissions telle qu'en base) : l'éditer en ligne risquerait de retirer par
erreur une permission à son propre compte et de se retrouver bloqué hors de
l'application — modification à faire via la source canonique
`src/lib/permissions/constants.ts` + revue humaine.

**Bug réel trouvé et corrigé pendant les tests E2E de ces écrans** : les callbacks
`onSuccess` passés aux formulaires (fermeture de dialogue + toast + `router.refresh()`)
n'étaient pas mémoïsés dans les composants parents. Comme `router.refresh()` provoque
un nouveau rendu du parent, une nouvelle identité de fonction était recréée à chaque
fois, ce qui redéclenchait le `useEffect` du formulaire enfant (dépendant de cette
référence) et doublait le toast de succès. Corrigé en enveloppant chaque callback dans
`useCallback` côté parent (`CommunesManager`, `LotissementsManager`, `NaturesManager`,
`UsersManager`) — constaté uniquement via un vrai test E2E Playwright (`getByText`
strict-mode a détecté les deux éléments dupliqués), invisible en lecture de code ou en
test unitaire.

**Lotissement en saisie libre (Phase 15+)** : le `<Select>` "Lotissement" de la Collecte,
dépendant de la commune choisie, restait bloqué sans option pour toute commune sans
lotissement pré-chargé (cas de toutes les 201 communes officielles importées, référentiel
lotissements vide). Remplacé par une saisie libre (`lotissementNom`) résolue côté serveur
vers une fiche réelle (existante réutilisée, sinon créée à la volée) — voir DATABASE.md §3.
En corrigeant ce champ, deux bugs annexes trouvés et corrigés dans le même passage :
`numeroDirectionService` manquait dans les valeurs pré-remplies à la reprise d'un
brouillon (`/collecte/page.tsx`), oublié lors du refactor Direction/Service précédent.

**Nature du dossier — liste réelle + Autres (Phase 15+)** : les 5 natures fictives du
seed remplacées par les **41 natures réelles** fournies par le métier (`scripts/import-natures.ts`,
retranscrites sans correction orthographique de notre part, un doublon exact dans la
liste source dédupliqué). Le `RadioGroup` de `StepDossier.tsx` — praticable pour 5
options, plus du tout pour 41 — remplacé par un `<Select>` + option "Autres" qui bascule
en saisie libre (même mécanique d'interface que Direction/Service). `natureDossierId`
reste la FK utilisée partout (dashboards, exports, score qualité) ; la saisie "Autres"
(`natureDossierAutre`) est résolue côté serveur vers une fiche `natures_dossier` réelle,
find-or-create global (pas de scope par commune, contrairement au Lotissement) — voir
`resolveNatureDossierId()` dans `dossier-service.ts`.

**État de conservation carton/dossier + indicateurs dashboard (Phase 15+)** : deux
nouveaux champs sur `Dossier` — `etatCarton`/`etatDossier` (enum `EtatConservation` :
`BON_ETAT`/`DEGRADE`), chacun avec une description en texte libre
(`etatCartonDescription`/`etatDossierDescription`) qui n'apparaît et n'est persistée que
si l'état est "Dégradé" (`EtatConservationField.tsx`, composant partagé entre
`StepIdentification.tsx` pour le carton et `StepDossier.tsx` pour le dossier — un simple
`RadioGroup` à 2 options, pas besoin du mécanisme Select+Autres ici). Nouveau tableau sur
`/dashboard` (§48) : Nbre de cartons / Nbre de dossiers / Nbre de cartons dégradés / Nbre
de dossiers dégradés (`getCartonsDossiersEtatOverview()`, `dashboard-service.ts`) —
`codeBarres` étant unique par dossier dans ce modèle, "nombre de cartons" est calculé
comme le nombre de dossiers avec un code-barres renseigné (pas de `groupBy` distinct
nécessaire).

**Affectation opérateur -> superviseur + cloisonnement (Phase 16+)** : un SUPERVISEUR ne
peut désormais valider/rejeter, ni même consulter (dossiers, export, qualité, dashboard),
que les dossiers des opérateurs qui lui sont explicitement affectés — jamais un accès
global par défaut, y compris s'il n'a aucune affectation (0 opérateur affecté = 0 résultat,
pas "tout voir"). Modélisé par une simple FK nullable `Operateur.supervisorId -> User.id`
(un opérateur a au plus un superviseur ; un superviseur peut avoir plusieurs opérateurs —
pas de table de jointure nécessaire). Affectation gérée depuis
`/administration/utilisateurs` (édition d'un compte de rôle Superviseur : liste à cocher
des opérateurs actifs, avec indication si un opérateur est déjà affecté à un autre
superviseur avant de le "voler"). Logique de cloisonnement centralisée dans
`src/lib/services/access-scope.ts` (`getOperateurScopeFilter()`,
`isOperateurInScope()`, `getSupervisorScope()`), réutilisée par `workflow-service.ts`
(validate/reject), les pages `/dossiers`, `/dossiers/[id]`, `/export`, `document-service.ts`,
`quality-service.ts` et `dashboard-service.ts`. Ce dernier est le point le plus délicat :
ses agrégats globaux reposent sur des vues SQL (`vw_*`, non paramétrables) — un
SUPERVISEUR scopé bascule donc sur un recalcul équivalent via l'API Prisma
(`where operateurId IN (...)`) plutôt que d'interroger la vue, fonction par fonction,
sans toucher au chemin non scopé utilisé par ADMIN/CONSULTATION (et OPERATEUR, dont le
dashboard reste global comme avant cette phase — non demandé, non modifié). ADMIN n'est
jamais soumis à cette restriction.

**Bug de production non résolu (constaté, non bloquant)** : une erreur d'hydratation
React (#418) apparaît sur *toutes* les pages en production (Render) — jamais reproduite
en local (dev ni build de production identique). L'application reste pleinement
fonctionnelle (React régénère silencieusement l'arbre côté client) ; cause probable :
différence d'environnement serveur (version Node/ICU) entre Render et la machine de
développement locale, non diagnostiquée faute d'accès direct aux logs serveur détaillés
de l'instance Render. À revisiter si un accès shell à l'instance devient nécessaire.

## 7. Préparation IA (V2, hors périmètre V1)

L'architecture (stockage de métadonnées documents séparé du blob, `storageProvider`
extensible) prépare une future intégration OCR → extraction → classification →
recherche sémantique → RAG → assistant documentaire → agents IA, **sans l'implémenter
en V1**, conformément au cahier des charges §78.
