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
| 13 | Tests (unitaires, API, E2E) | ✅ Fait — 58 tests unitaires (Vitest) + 53 tests API + 1 E2E complet (Playwright), voir [TESTING.md](TESTING.md) |
| 14 | Optimisation | ✅ Fait — requêtes dupliquées mémoïsées, fuite mémoire rate-limit corrigée, error.tsx ajouté, bug réel `loading.tsx`/`redirect()` trouvé et corrigé (retiré) |
| 15 | Production (GitHub → Render → cPanel) | ✅ Fait — `GET /api/health`, [DEPLOYMENT.md](DEPLOYMENT.md), nettoyage `NEXTAUTH_URL` (variable morte) |

## 7. Préparation IA (V2, hors périmètre V1)

L'architecture (stockage de métadonnées documents séparé du blob, `storageProvider`
extensible) prépare une future intégration OCR → extraction → classification →
recherche sémantique → RAG → assistant documentaire → agents IA, **sans l'implémenter
en V1**, conformément au cahier des charges §78.
