#!/usr/bin/env bash
# Lots de transfert préparés par plage de cotes, au nom d'un gestionnaire.
#   bash /opt/colect-app/current/deploy/creer-lots.sh simulation|appliquer "IDRISS BADO" "2010-KOU-0001 à 200;…" 2026-10-31T10:00
set -Eeuo pipefail
umask 077

mode=${1:-}
gestionnaire=${2:-}
plages=${3:-}
date_prevue=${4:-}
[[ "$mode" == simulation || "$mode" == appliquer ]] || { echo 'Mode attendu : simulation ou appliquer.' >&2; exit 1; }

base=/opt/colect-app
shared=$base/shared
[[ -L "$base/current" ]] || { echo 'Aucune release en service.' >&2; exit 1; }
release=$(readlink -f "$base/current")
[[ "$release" =~ ^/opt/colect-app/releases/([0-9a-f]{40})$ ]] || { echo 'Release en service invalide.' >&2; exit 1; }
revision=${BASH_REMATCH[1]}
[[ -f "$shared/deploy.env" && -f "$shared/app.env" ]] || { echo 'Configuration serveur manquante.' >&2; exit 1; }


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

apply=()
[[ "$mode" == appliquer ]] && apply=(--apply)
dc run --rm --no-deps -T -e GEOARCHIVES_INTERNAL_URL=http://app:3000 app node deploy/creer-lots.mjs \
  "--gestionnaire=$gestionnaire" "--plages=$plages" "--date=$date_prevue" "${apply[@]}"
