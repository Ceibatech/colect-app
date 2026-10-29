#!/usr/bin/env bash
# Recoupe des cartons de Koumassi sur les boîtes physiques (référence de classement).
#   bash /opt/colect-app/current/deploy/recouper-cartons.sh simulation
#   bash /opt/colect-app/current/deploy/recouper-cartons.sh appliquer RECOUPER-CARTONS
# Le mode « appliquer » sauvegarde d'abord la base, comme un déploiement.
set -Eeuo pipefail
umask 077

mode=${1:-}
confirmation=${2:-}
[[ "$mode" == simulation || "$mode" == appliquer ]] || { echo 'Mode attendu : simulation ou appliquer.' >&2; exit 1; }
if [[ "$mode" == appliquer && "$confirmation" != RECOUPER-CARTONS ]]; then
  echo 'Le mode appliquer exige la confirmation RECOUPER-CARTONS.' >&2
  exit 1
fi

base=/opt/colect-app
shared=$base/shared
[[ -L "$base/current" ]] || { echo 'Aucune release en service.' >&2; exit 1; }
release=$(readlink -f "$base/current")
[[ "$release" =~ ^/opt/colect-app/releases/([0-9a-f]{40})$ ]] || { echo 'Release en service invalide.' >&2; exit 1; }
revision=${BASH_REMATCH[1]}
[[ -f "$shared/deploy.env" && -f "$shared/app.env" ]] || { echo 'Configuration serveur manquante.' >&2; exit 1; }

# Pas de correction pendant un déploiement (et inversement).
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

if [[ "$mode" == simulation ]]; then
  dc run --rm --no-deps -T app node deploy/recouper-cartons.mjs
  exit 0
fi

dc run --rm --no-deps --volume "$shared/db-backups:/backups" app node deploy/backup-database.mjs
dc run --rm --no-deps -T app node deploy/recouper-cartons.mjs --apply "--confirm=$confirmation"
