#!/usr/bin/env bash
# Compte administrateur temporaire pour un test de bout en bout.
#   bash /opt/colect-app/current/deploy/e2e-account.sh creer '<hachage bcrypt>'
#   bash /opt/colect-app/current/deploy/e2e-account.sh supprimer
set -Eeuo pipefail
umask 077

mode=${1:-}
hash=${2:-}
[[ "$mode" == creer || "$mode" == supprimer ]] || { echo 'Mode attendu : creer ou supprimer.' >&2; exit 1; }
if [[ "$mode" == creer ]]; then [[ "$hash" =~ ^\$2[aby]\$1[0-2]\$[./A-Za-z0-9]{53}$ ]] || { echo 'Hachage invalide.' >&2; exit 1; }; fi

base=/opt/colect-app
shared=$base/shared
[[ -L "$base/current" ]] || { echo 'Aucune release en service.' >&2; exit 1; }
release=$(readlink -f "$base/current")
[[ "$release" =~ ^/opt/colect-app/releases/([0-9a-f]{40})$ ]] || { echo 'Release en service invalide.' >&2; exit 1; }
revision=${BASH_REMATCH[1]}
[[ -f "$shared/deploy.env" && -f "$shared/app.env" ]] || { echo 'Configuration serveur manquante.' >&2; exit 1; }

# Pas de modification pendant un déploiement (et inversement).
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Un déploiement est en cours.' >&2; exit 1; }

setting() { sed -n "s/^$1=//p" "$shared/deploy.env" | tr -d '\r'; }
export DOMAIN APP_HTTP_PORT ALFRESCO_DOCKER_NETWORK
DOMAIN=$(setting DOMAIN)
APP_HTTP_PORT=$(setting APP_HTTP_PORT)
APP_HTTP_PORT=${APP_HTTP_PORT:-8300}
ALFRESCO_DOCKER_NETWORK=$(setting ALFRESCO_DOCKER_NETWORK)
ALFRESCO_DOCKER_NETWORK=${ALFRESCO_DOCKER_NETWORK:-geoarchives-alfresco}
export APP_ENV_FILE=$shared/app.env DOCUMENTS_PATH=$shared/documents
export APP_IMAGE="colect-app:$revision"
export INDEXING_WORKER_IMAGE="colect-indexing-worker:$revision"
cd "$release"
dc() { docker compose --project-name colect-app --env-file "$shared/deploy.env" -f "$release/compose.contabo.yml" "$@"; }

if [[ "$mode" == creer ]]; then
  dc run --rm --no-deps -T app node deploy/e2e-account.mjs --create "--hash=$hash"
else
  dc run --rm --no-deps -T app node deploy/e2e-account.mjs --delete
fi
