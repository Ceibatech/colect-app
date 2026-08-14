# API — GeoArchives-MULCV

L'application expose deux types d'endpoints serveur :

- **Server Actions** (Next.js) pour les flux formulaires internes à l'application
  (collecte : `saveDraft`, `submitDossier` — voir
  [src/lib/services/dossier-service.ts](src/lib/services/dossier-service.ts)).
  Non accessibles en HTTP direct, uniquement appelées depuis les composants React
  de l'application.
- **Route Handlers REST** (`/api/...`) pour les actions de workflow (§61 du
  cahier des charges), consommables en `fetch()` depuis le client ou par un
  éventuel consommateur externe.

Ce document couvre les Route Handlers REST.

## Authentification

Toutes les routes `/api/*` sauf mention contraire nécessitent une session
valide (cookie httpOnly `mulcv_session`, voir [SECURITY.md](SECURITY.md)).
Contrairement aux pages de l'application, ces routes ne redirigent jamais
vers `/login` : elles répondent en JSON avec un code HTTP adapté.

| Code | Signification |
|---|---|
| 200 | Succès |
| 400 | Requête invalide (précondition de workflow non remplie, champ requis manquant) |
| 401 | Non authentifié |
| 403 | Authentifié mais permission insuffisante |
| 404 | Dossier introuvable |
| 500 | Erreur interne (jamais de détail technique exposé — cahier des charges §67) |

Format d'erreur uniforme : `{ "error": "message lisible" }`.

## Workflow (Phase 7)

Implémentent le cycle métier §42 : `BROUILLON → SOUMIS → EN CONTRÔLE →
VALIDÉ | REJETÉ → NUMÉRISÉ → INDEXÉ → ARCHIVÉ`. Chaque endpoint vérifie sa
propre précondition d'état côté serveur avant toute écriture (défense en
profondeur — jamais de confiance dans l'état affiché côté client) et
journalise systématiquement `dossier_history`, `workflow_transitions` et
`audit_logs`.

### POST /api/dossiers/:id/validate

Permission : `DOSSIER_VALIDATE`. Précondition : `statutValidation = EN_CONTROLE`.

```json
// Requête (corps optionnel)
{ "commentaire": "Dossier conforme" }

// Réponse 200
{ "dossier": { "id": 301, "statutValidation": "VALIDE", "dateValidation": "...", ... } }
```

### POST /api/dossiers/:id/reject

Permission : `DOSSIER_REJECT`. Précondition : `statutValidation = EN_CONTROLE`.
`commentaire` obligatoire (motif de rejet).

```json
{ "commentaire": "Photocopie illisible" }
```

### POST /api/dossiers/:id/numerize

Permission : `NUMERISATION_UPDATE`. Précondition : `statutValidation = VALIDE`
et non déjà numérisé. Crée un enregistrement `numerisations`.

```json
{ "nombrePages": 12 }
```

### POST /api/dossiers/:id/index

Permission : `INDEXATION_UPDATE`. Précondition : `statutNumerisation = TERMINE`
et non déjà indexé. Crée un enregistrement `indexations`.

```json
{ "scoreQualite": 95 }
```

### POST /api/dossiers/:id/archive

Permission : `ARCHIVAGE_UPDATE`. Précondition : `statutIndexation = TERMINE`
et non déjà archivé (règle explicite §42 : impossible d'archiver un dossier
non indexé). `emplacement` obligatoire. Crée un enregistrement `archivages`.

```json
{ "emplacement": "Salle A / Rayon 3 / Boîte 12", "referenceArchivage": "ARC-2026-0042" }
```

## Import / Export (Phase 10)

### POST /api/import

Permission : `IMPORT_DATA`. `multipart/form-data`, champ `file` (`.csv` ou
`.xlsx`, 5 Mo max). **Ne modifie jamais la base** — lecture, validation et
détection des doublons uniquement (§54). Réponse : aperçu complet.

```json
{
  "fileName": "dossiers.csv",
  "totalLignes": 4, "valides": 2, "invalides": 1, "doublons": 1, "importables": 2,
  "rows": [
    { "line": 2, "data": { "operateurMatricule": "OP-001", "nom": "Traoré", "...": "..." },
      "errors": [], "warnings": [], "isDuplicate": false, "isValid": true }
  ]
}
```

### POST /api/import/confirm

Permission : `IMPORT_DATA`. Reçoit `{ fileName, rows }` — **toutes** les
lignes de l'aperçu (pas seulement les valides), revalidées intégralement
côté serveur. Seules les lignes qui repassent la validation sont créées, en
statut `BROUILLON`. Journalise un enregistrement `imports` avec les totaux
réels du fichier.

```json
{ "importId": 12, "imported": 2, "skipped": 2 }
```

### GET /api/import/template

Permission : `IMPORT_DATA`. Télécharge un modèle `.xlsx` vierge (en-têtes
attendus).

### GET /api/export

Permission : `EXPORT_DATA`. Export filtré (§55), respecte le même
cloisonnement par rôle que `/dossiers`. Journalise `exports` + `audit_logs`.

| Paramètre | Description |
|---|---|
| `format` | `csv` (défaut) ou `xlsx` |
| `q` | recherche texte (référence, code-barres, N° DDU, nom, prénoms) |
| `commune` | id commune |
| `operateur` | id opérateur (ignoré pour le rôle OPERATEUR — toujours ses propres dossiers) |
| `statutValidation` | `VALIDE`, `REJETE`, `EN_CONTROLE`... |
| `statutArchivage` | `TERMINE` pour "archivés uniquement" |
| `nonIndexes` | `1` pour "non indexés uniquement" |
| `from`, `to` | période (sur `created_at`) |

## Documents (Phase 11)

### POST /api/dossiers/:id/documents

Permission : `NUMERISATION_UPDATE` (+ cloisonnement par rôle, comme
`/dossiers`). `multipart/form-data`, champ `file`. PDF/JPEG/PNG/TIFF
uniquement, 20 Mo max. Calcule le hash SHA-256, stocke via le
`StorageProvider` actif (local par défaut), journalise `dossier_history` +
`audit_logs`.

### GET /api/documents/:id/download

Permission : `DOSSIER_READ` (+ cloisonnement). Stream le fichier avec le
nom original et le type MIME d'origine. Journalise `DOCUMENT_DOWNLOAD`.

### DELETE /api/documents/:id

Permission : `NUMERISATION_UPDATE` (+ cloisonnement). Supprime le fichier du
stockage **et** la ligne `documents` — irréversible.

## Supervision (Phase 15)

### GET /api/health

**Publique** (aucune session requise — c'est le point interrogé par le health
check de la plateforme d'hébergement, cf. DEPLOYMENT.md). Vérifie une vraie
connexion base (`SELECT 1`), pas seulement que le process Node répond.

```json
// 200
{ "status": "ok", "database": "up", "timestamp": "2026-08-14T09:58:14.901Z", "latencyMs": 14 }

// 503 (base injoignable)
{ "status": "error", "database": "down", "timestamp": "..." }
```

## À venir (phases suivantes)

- `GET/POST /api/dossiers`, `GET/PUT/DELETE /api/dossiers/:id` — actuellement
  servi par Server Components + Server Actions ; une variante REST pourra
  être ajoutée si un besoin d'intégration externe apparaît
- `POST /api/dossiers/:id/submit` — actuellement une Server Action
  (`submitDossier`), pourrait être exposé en REST si nécessaire
- `GET /api/dashboard/*` — actuellement des appels directs aux services
  depuis les Server Components des pages dashboard
