# Tests — Phase 13 (§72/§93)

Trois niveaux, chacun avec un objectif précis et un outil dédié :

| Niveau | Outil | Cible | Commande |
|---|---|---|---|
| Unitaire | Vitest | Fonctions pures (aucune base de données, aucun serveur) | `npm run test:unit` |
| API | Playwright (`request`) | Routes REST + pages protégées, HTTP direct | `npm run test:api` |
| E2E | Playwright (navigateur) | Parcours utilisateur complet dans Chromium | `npm run test:e2e` |

```bash
npm run test          # les trois suites, dans cet ordre (échoue vite si l'unitaire casse)
npm run test:unit:watch
npx playwright test --project=api tests/api/workflow.spec.ts   # un seul fichier
npx playwright show-trace test-results/.../trace.zip           # rejouer un échec (trace conservée)
```

## Prérequis

- Les tests **API** et **E2E** ont besoin d'une vraie base MySQL/MariaDB seedée
  (`npm run db:seed`) et du serveur Next.js (`npm run dev`, port 3000). Playwright
  réutilise un serveur déjà lancé (`reuseExistingServer: true` en local) ou en démarre
  un lui-même sinon — voir `playwright.config.ts`.
- Les tests **unitaires** n'ont besoin de rien de tout ça — ce sont des fonctions
  pures testées en isolation (Vitest, environnement Node).
- `.env` doit contenir `AUTH_SECRET` et `DATABASE_URL` (mêmes valeurs que le serveur de
  dev — les tests API/E2E minent des JWT de session avec le même secret, voir
  `tests/helpers/auth.ts`, et Prisma pointe sur la même base).

## Pourquoi ce découpage

### Unitaire (Vitest) — `tests/unit/`

Uniquement des fonctions pures extraites des services métier, sans dépendance à
Prisma/Next.js :

- `validation.test.ts` — `loginSchema`, `dossierFormSchema`, `dossierSubmitSchema` (Zod).
- `quality-scoring.test.ts` — `scoreDossier()` (formule §53 : champs valides / champs
  contrôlés × 100, y compris FORMAT_INVALIDE/INCOHERENCE/DOCUMENT_MANQUANT).
- `permissions.test.ts` — intégrité de la matrice RBAC `ROLE_PERMISSIONS` (§11/§12) et
  non-régression du bug de préfixe `/administration` corrigé en Phase 12.
- `rate.test.ts` — `computeRate()`, le taux KPI protégé contre la division par zéro
  (§46/§47).
- `csv.test.ts` — parseur/générateur CSV RFC 4180 maison (aller-retour, BOM, guillemets,
  sauts de ligne).

Deux fichiers de service portent `import "server-only"`, qui n'est pas un vrai paquet
npm installé (Next.js le résout via un alias interne à son bundler webpack, sans
installation nécessaire pour faire tourner l'app). Vitest n'a pas ce traitement spécial
→ `vitest.config.ts` alias `"server-only"` vers `tests/unit/stubs/server-only.ts` (un
module vide). Deux petites extractions ont aussi été faites pour rester testables sans
tirer Prisma/Next.js dans les tests unitaires : `computeRate()` → `src/lib/utils/rate.ts`
(sorti de `dashboard-service.ts`) et `IMPORT_COLUMNS` → `src/lib/validation/import-columns.ts`
(sorti de `import-service.ts`, réexporté pour compatibilité) — même logique que la
séparation déjà faite en Phase 8 entre `quality-scoring.ts` (pur) et `quality-service.ts`
(`"use server"`).

`hasPermission()` (`src/lib/auth/current-user.ts`) n'est volontairement pas testée en
unitaire : le fichier importe `next/headers`/`react.cache`, coûteux à isoler pour une
seule ligne (`!!session?.permissions.includes(...)`) déjà exercée en continu par les
tests API (chaque route protégée l'appelle réellement).

### API (Playwright `request`) — `tests/api/`

Appels HTTP directs contre le serveur de dev réel, sans navigateur — rapide et fiable.
Authentification par cookie de session **miné** (`tests/helpers/auth.ts` signe un JWT
avec le même `AUTH_SECRET` que l'application, comme les scripts jetables utilisés pour
la vérification manuelle des Phases 3 à 12), jamais par mot de passe en clair.

- `workflow.spec.ts` — les 5 transitions (`validate`/`reject`/`numerize`/`index`/`archive`,
  §42) : préconditions, permissions par rôle, 401/403/404, cycle complet bout en bout.
- `import-export.spec.ts` — aperçu (§54, ne doit rien écrire), confirmation (crée les
  dossiers, détecte le doublon à la ré-soumission), export CSV/XLSX (§55) et permissions.
- `pages-permissions.spec.ts` — double niveau de contrôle (§60) : préfixe grossier
  (`src/proxy.ts`, ex. `/qualite`, `/import`) et permission fine par page
  (`requirePermission()`, ex. `/administration/audit` vs `/administration/utilisateurs`) ;
  couvre en non-régression le bug de Phase 12.
- `dossiers-search.spec.ts` — recherche/filtres de `/dossiers` (pas de route `/api/`
  dédiée, page Server Component testée via son rendu HTML) et cloisonnement par
  opérateur.

Chaque test qui a besoin d'un dossier dans un état précis en crée un directement en
base (`tests/helpers/db.ts`, préfixe `TEST-API-`) plutôt que de dépendre de la
distribution du seed, et le supprime en fin de test (`onDelete: Cascade` sur toutes les
tables enfants du dossier — voir `prisma/schema.prisma`).

**Piège relevé en écrivant ces tests** : `DossiersFilterBar` réinjecte la valeur
recherchée dans l'attribut `value` du champ `q`, qu'il y ait un résultat ou non — un
test qui vérifie juste `page.not.toContain(reference)` est donc toujours faux (la
référence apparaît de toute façon dans le formulaire). Le signal fiable est le message
d'état vide `"Aucun dossier ne correspond à ces critères"` de `DossiersTable`. De même,
le compteur `"{n} dossier(s)"` n'est pas cherchable tel quel : React insère un
commentaire de frontière d'hydratation (`<!-- -->`) entre le nombre et le mot.

### E2E (Playwright navigateur) — `tests/e2e/`

Un seul scénario, `full-cycle.spec.ts`, qui rejoue exactement l'énoncé du cahier des
charges (§72) : **Connexion → Création dossier → Sauvegarde → Soumission → Contrôle →
Validation → Numérisation → Indexation → Archivage**.

Approche hybride assumée : Connexion et toute la Collecte (formulaire CG1020
multi-étapes, §40, y compris les `<Select>` Base UI et le `RadioGroup`) sont pilotées
dans un vrai Chromium — c'est la partie qui a le plus de valeur à être testée "comme un
utilisateur". Les 4 transitions de workflow qui suivent (Contrôle → Validation →
Numérisation → Indexation → Archivage) réutilisent les mêmes routes REST déjà couvertes
en détail par `tests/api/workflow.spec.ts` : les rejouer au clic n'ajouterait aucune
couverture, seulement de la fragilité (changement de rôle en cours de parcours,
multiples popups) — elles sont donc déclenchées via `request` (cookie miné par rôle),
puis le test revient dans le navigateur pour vérifier **visuellement** le badge de
statut "Terminé" sur la fiche dossier finale.

**Chromium sans téléchargement** : l'environnement de build n'a pas d'accès sortant vers
`cdn.playwright.dev` (`npx playwright install` échoue). `playwright.config.ts` utilise
donc `channel: "chrome"` pour piloter le Google Chrome déjà installé sur la machine au
lieu du Chromium dédié de Playwright — comportement identique, aucune fonctionnalité
perdue pour ces tests.

**Sélecteurs shadcn/Base UI** — ce projet utilise Base UI, pas Radix (voir
ARCHITECTURE.md). Les champs texte (`Field`/`FieldLabel`/`Input`) n'ont pas de paire
`htmlFor`/`id` explicite (`getByLabel` ne les trouve donc pas) : le helper
`fillField(page, label, value)` cible plutôt `[data-slot="field"]` filtré par le texte
exact du label. Les `<Select>` exposent un vrai `role="combobox"` sur le déclencheur et
`role="option"` sur chaque item du popup (portal) : `selectCombobox()` clique le
combobox puis l'option par son nom accessible. Le `RadioGroup` (`StepDossier`), lui, a
un vrai `htmlFor`/`id` — mais l'input natif caché et le `span[role="radio"]` de Base UI
partagent le même label, donc `getByRole("radio", { name })` (pas `getByLabel(...).check()`,
ambigu en "strict mode") est nécessaire.

Contrairement aux difficultés rencontrées lors des vérifications manuelles avec le
navigateur intégré de l'assistant IA pendant les Phases 4 à 12 (`mcp__Claude_Browser__*`,
composition de frames peu fiable dans cet environnement précis), Playwright pilote son
propre Chromium via CDP directement et s'est montré fiable dès la première exécution
stable une fois les sélecteurs corrects trouvés.

**Flakiness connue (Phase 15+, dev uniquement)** : `change-password.spec.ts` échoue
occasionnellement (timeout sur un clic de menu) uniquement quand la suite E2E complète
tourne d'un coup contre `next dev` (Turbopack) — jamais en isolation (`npx playwright
test tests/e2e/change-password.spec.ts` seul, systématiquement vert). Cause probable :
compilation à la demande de nouvelles routes sous forte charge quand plusieurs fichiers
de test s'exécutent à la suite, chacun visitant des pages potentiellement jamais
compilées. N'affecte jamais la production (`next build` précompile tout) ; pas de
correctif appliqué pour l'instant, la fiabilité individuelle de chaque test étant
confirmée à 100 %.

## Nettoyage

Tous les enregistrements créés par les tests API/E2E sont préfixés de façon
identifiable (`TEST-API-…`, `TEST-E2E-…`, code-barres `TEST-IMPORT-…`) et supprimés en
fin de test (`finally` + `onDelete: Cascade`) — jamais confondus avec le seed
(`DOS-{année}-{séquence}`) ni avec de vraies données métier. `test-results/`,
`playwright-report/` et `blob-report/` (rapports/traces Playwright) sont ignorés par
git.
