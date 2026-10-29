#!/usr/bin/env bash
# Export en lecture seule d'une plage de cotes et de leurs dossiers (JSON sur stdout).
#   bash /opt/colect-app/current/deploy/export-cotes.sh 2010-KOU 1 320 > cartons.json
# Le JSON sort sur stdout ; les messages Docker et le résumé sur stderr.
set -Eeuo pipefail
prefixe=${1:-2010-KOU}
de=${2:-1}
a=${3:-320}
[[ "$prefixe" =~ ^[0-9]{4}-[A-Z][A-Z0-9]{1,5}$ ]] || { echo "Préfixe invalide." >&2; exit 1; }
[[ "$de" =~ ^[0-9]{1,5}$ && "$a" =~ ^[0-9]{1,5}$ ]] || { echo "Plage invalide." >&2; exit 1; }
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

# -T : pas de pseudo-terminal, pour que le JSON reste intact sur stdout.
docker compose --project-name colect-app --env-file "$shared/deploy.env" -f "$release/compose.contabo.yml" \
  run --rm --no-deps -T app node deploy/export-cotes.mjs "--prefixe=$prefixe" "--de=$de" "--a=$a"
