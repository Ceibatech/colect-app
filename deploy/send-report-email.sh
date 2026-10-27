#!/usr/bin/env bash
# Envoie les fichiers déposés dans shared/outbox/<id> avec le service d'e-mail
# de l'application, puis supprime le dossier.
#   bash /opt/colect-app/current/deploy/send-report-email.sh <id> <a@x,b@x> <c@x,...>
set -Eeuo pipefail
id=${1:-}; to=${2:-}; cc=${3:-}; replaces=${4:-0}
[[ "$replaces" == 0 || "$replaces" == 1 ]] || { echo 'Option invalide.' >&2; exit 1; }
[[ "$id" =~ ^[0-9]{1,20}$ ]] || { echo 'Identifiant invalide.' >&2; exit 1; }
[[ "$to" =~ ^[A-Za-z0-9._%+@,-]{3,600}$ && "$cc" =~ ^[A-Za-z0-9._%+@,-]{0,600}$ ]] || { echo 'Adresses invalides.' >&2; exit 1; }
umask 077

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

outbox="$shared/outbox/$id"
[[ -d "$outbox" ]] || { echo 'Dossier de pièces jointes absent.' >&2; exit 1; }
trap 'rm -rf -- "$outbox"' EXIT
chmod -R a+rX "$outbox"
docker compose --project-name colect-app --env-file "$shared/deploy.env" -f "$release/compose.contabo.yml" \
  run --rm --no-deps -T --volume "$outbox:/outbox:ro" app node deploy/send-report-email.mjs --dir=/outbox "--to=$to" "--cc=$cc" "--key=$id" "--replaces=$replaces"
