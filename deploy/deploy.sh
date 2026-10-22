#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Each immutable release is supplied by CI. Secrets and documents stay in shared/.
revision=${1:-}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full Git commit SHA.' >&2; exit 1; }
base=/opt/colect-app
release=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
[[ "$release" == "$base/releases/$revision" ]] || { echo 'Unexpected release directory.' >&2; exit 1; }
shared=$base/shared
[[ -f "$shared/deploy.env" && -f "$shared/app.env" ]] || { echo 'Missing server configuration.' >&2; exit 1; }
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

# Provision a private app-to-worker credential once. It never enters GitHub or
# an image layer and is shared only through the protected runtime env file.
if ! grep -q '^INDEXING_WORKER_TOKEN=' "$shared/app.env"; then
  command -v openssl >/dev/null 2>&1 || { echo 'openssl is required to provision the indexing worker token.' >&2; exit 1; }
  printf '\nINDEXING_WORKER_TOKEN=%s\n' "$(openssl rand -hex 32)" >> "$shared/app.env"
  chmod 600 "$shared/app.env"
fi

# Read only the supported non-secret settings; never execute an environment file.
setting() { sed -n "s/^$1=//p" "$shared/deploy.env" | tr -d '\r'; }
export DOMAIN APP_HTTP_PORT ALFRESCO_DOCKER_NETWORK
DOMAIN=$(setting DOMAIN)
APP_HTTP_PORT=$(setting APP_HTTP_PORT)
APP_HTTP_PORT=${APP_HTTP_PORT:-8300}
ALFRESCO_DOCKER_NETWORK=$(setting ALFRESCO_DOCKER_NETWORK)
ALFRESCO_DOCKER_NETWORK=${ALFRESCO_DOCKER_NETWORK:-geoarchives-alfresco}
proxy_mode=$(setting PROXY_MODE)
proxy_mode=${proxy_mode:-nginx}
check_https=$(setting CHECK_HTTPS)
check_https=${check_https:-true}
[[ "$DOMAIN" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]] || { echo 'Invalid DOMAIN.' >&2; exit 1; }
[[ "$APP_HTTP_PORT" =~ ^[0-9]{2,5}$ && "$APP_HTTP_PORT" -gt 1024 && "$APP_HTTP_PORT" -lt 65536 ]] || { echo 'Invalid APP_HTTP_PORT.' >&2; exit 1; }
[[ "$proxy_mode" == nginx || "$proxy_mode" == caddy ]] || { echo 'Invalid PROXY_MODE.' >&2; exit 1; }
[[ "$check_https" == true || "$check_https" == false ]] || { echo 'Invalid CHECK_HTTPS.' >&2; exit 1; }
[[ "$ALFRESCO_DOCKER_NETWORK" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]] || { echo 'Invalid ALFRESCO_DOCKER_NETWORK.' >&2; exit 1; }
export APP_ENV_FILE=$shared/app.env DOCUMENTS_PATH=$shared/documents
export APP_IMAGE="colect-app:$revision"
export INDEXING_WORKER_IMAGE="colect-indexing-worker:$revision"
cd "$release"
dc() { docker compose --project-name colect-app --env-file "$shared/deploy.env" -f "$release/compose.contabo.yml" "$@"; }
docker network inspect "$ALFRESCO_DOCKER_NETWORK" >/dev/null 2>&1 ||
  docker network create --internal "$ALFRESCO_DOCKER_NETWORK" >/dev/null
dc config --quiet
[[ -d "$DOCUMENTS_PATH" && -d "$shared/db-backups" && -d "$shared/document-backups" ]] || { echo 'Missing persistent storage directories.' >&2; exit 1; }

previous=''
if [[ -L "$base/current" ]]; then
  previous=$(readlink -f "$base/current")
  [[ "$previous" =~ ^/opt/colect-app/releases/[0-9a-f]{40}$ && -f "$previous/compose.contabo.yml" ]] || { echo 'Invalid previous release.' >&2; exit 1; }
fi
rollout_started=false
on_failure() {
  result=$?
  trap - ERR
  if [[ "$rollout_started" == true && -n "$previous" ]]; then
    echo 'Deployment failed; restoring the previous application image. Database migrations are not reversed.' >&2
    dc stop indexing-worker >/dev/null 2>&1 || true
    previous_revision=$(basename "$previous")
    export APP_IMAGE="colect-app:$previous_revision"
    export INDEXING_WORKER_IMAGE="colect-indexing-worker:$previous_revision"
    rollback=(docker compose --project-name colect-app --env-file "$shared/deploy.env" -f "$previous/compose.contabo.yml")
    rollback_services=(app)
    if "${rollback[@]}" config --services | grep -qx 'indexing-worker'; then
      rollback_services+=(indexing-worker)
    fi
    "${rollback[@]}" up -d --no-build --wait --wait-timeout 180 "${rollback_services[@]}" ||
      echo 'Automatic application restore failed; operator action required.' >&2
    if [[ "$proxy_mode" == caddy ]]; then
      "${rollback[@]}" --profile caddy up -d --no-build caddy || true
    fi
  fi
  echo 'Deployment failed. Check the command above and the server logs.' >&2
  exit "$result"
}
trap on_failure ERR

echo "Building release $revision"
dc build app indexing-worker
dc run --rm --no-deps app node deploy/validate-env.mjs

# Keep the database/document snapshot consistent once this VPS serves traffic.
# The first Render cutover needs an equivalent write pause on the old host.
if [[ -n "$previous" ]]; then
  rollout_started=true
  dc stop indexing-worker app
fi
# Fail before changing schema/application when the database cannot be backed up.
dc run --rm --no-deps --volume "$shared/db-backups:/backups" app node deploy/backup-database.mjs
stamp=$(date -u +%Y%m%dT%H%M%SZ)
document_backup="/backups/documents-$stamp-$revision.tar.gz"
# Run as the container's uid 1000, which owns the private document directories.
dc run --rm --no-deps --volume "$shared/document-backups:/backups" app \
  sh -c 'umask 077; tar -czf "$1.partial" -C /var/data/documents . && mv -- "$1.partial" "$1"' \
  sh "$document_backup"
dc run --rm --no-deps app node node_modules/prisma/build/index.js migrate deploy

rollout_started=true
dc up -d --no-build --wait --wait-timeout 300 app indexing-worker
bash "$release/deploy/activate-alfresco.sh" "$revision"
dc exec -T app node deploy/healthcheck.mjs --readiness
if [[ "$proxy_mode" == caddy ]]; then
  dc --profile caddy up -d --no-build --wait --wait-timeout 120 caddy
fi
if [[ "$check_https" == true ]]; then
  # Check this VPS, including certificate and reverse proxy, even before DNS caches expire.
  curl --fail --silent --show-error --retry 5 --retry-delay 5 --retry-all-errors --max-time 30 \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" |
    dc exec -T app node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const d=JSON.parse(s);process.exit(d.status==="ok"&&d.database==="up"?0:1)}catch{process.exit(1)}})'
fi
ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
echo "Release $revision is ready. HTTPS verified: $check_https"
