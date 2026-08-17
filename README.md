# GeoArchives-MULCV : Numérisation & Indexation

Application métier de collecte, contrôle, numérisation, indexation et archivage de
dossiers fonciers, avec dashboard analytique de reporting.

> **État du projet** : les 15 phases du cahier des charges (audit, base de données,
> authentification, layout, collecte, dossiers, workflow, qualité, dashboard,
> import/export, documents, audit, tests, optimisation, production) sont terminées,
> testées, et **déployées en production** : https://geoarchives.ceiba-analytics.com
> (Render + base MySQL cPanel `col_invent`, voir [DEPLOYMENT.md](DEPLOYMENT.md)).
> Les écrans d'administration (utilisateurs, communes/lotissements/natures) sont
> construits — les référentiels géographiques réels restent à saisir par
> `/administration/communes`, `/lotissements`, `/natures`. `/administration/roles`
> reste en lecture seule par choix (voir ARCHITECTURE.md). Quelques décisions métier
> restent ouvertes (marquées « à confirmer avec le métier ») — voir
> [ARCHITECTURE.md](ARCHITECTURE.md).

## Stack technique

- **Frontend** : Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Lucide React
- **Formulaires** : React Hook Form · Zod
- **Dashboard** : Recharts
- **Backend** : Server Components / Route Handlers / Server Actions (Next.js natif)
- **Base de données** : MySQL 8 / MariaDB (port 3306)
- **ORM** : Prisma 6.19.3

## Prérequis

- Node.js 20+ (testé avec Node 24)
- Un serveur MySQL 8 / MariaDB accessible (local ou distant)

## Installation

```bash
npm install
cp .env.example .env
# Renseigner DATABASE_URL (voir §Base de données ci-dessous) et AUTH_SECRET
```

## Base de données

Voir [DATABASE.md](DATABASE.md) pour le détail complet du schéma, des choix de
conception et des vues de reporting.

```bash
# Développement — crée/applique les migrations sur une base vide
npm run db:migrate

# Production — applique les migrations déjà générées (jamais `migrate dev` en prod)
npm run db:migrate:deploy

# Données de démonstration (strictement fictives)
npm run db:seed

# Vérification complète (connexion, tables, référentiels, seed, requêtes dashboard)
npm run db:verify
```

### Développement local sans MySQL installé

Un conteneur jetable peut être utilisé pour le développement :

```bash
docker run --name mulcv-archivage-mysql \
  -e MYSQL_ROOT_PASSWORD=devroot_pw \
  -e MYSQL_DATABASE=mulcv_archivage \
  -e MYSQL_USER=mulcv_app \
  -e MYSQL_PASSWORD=devpassword_app \
  -p 3306:3306 \
  -d mysql:8.0
```

Puis `DATABASE_URL="mysql://mulcv_app:devpassword_app@localhost:3306/mulcv_archivage"` dans `.env`.

## Lancement

```bash
npm run dev      # développement — http://localhost:3000
npm run build    # build production (exécute aussi `prisma generate` en amont)
npm run start    # démarrage production
npm run lint     # ESLint
```

## Comptes de démonstration (après `npm run db:seed`)

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | admin@mulcv-demo.local | `Demo@2026!` |
| Superviseur | superviseur@mulcv-demo.local | `Demo@2026!` |
| Opérateur (×3) | operateur1..3@mulcv-demo.local | `Demo@2026!` |
| Consultation | consultation@mulcv-demo.local | `Demo@2026!` |

⚠️ Identifiants de démonstration uniquement — à ne jamais utiliser en production.

## Tests

Voir [TESTING.md](TESTING.md) pour le détail complet (stratégie, prérequis, dépannage).

```bash
npm run test:unit   # Vitest — fonctions pures (validation, score qualité, permissions, KPI, CSV)
npm run test:api    # Playwright — routes API/pages protégées (nécessite le serveur de dev + MySQL)
npm run test:e2e    # Playwright — cycle complet dans Chromium (connexion → archivage)
npm run test        # les trois suites, dans cet ordre
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — architecture fonctionnelle et technique
- [DATABASE.md](DATABASE.md) — schéma de base de données, décisions de conception
- [API.md](API.md) — référence des routes REST
- [SECURITY.md](SECURITY.md) — principes de sécurité appliqués
- [TESTING.md](TESTING.md) — stratégie de tests (unitaires, API, E2E)
- [DEPLOYMENT.md](DEPLOYMENT.md) — GitHub → Render → cPanel
