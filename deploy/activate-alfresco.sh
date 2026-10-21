#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

revision=${1:-}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full Git commit SHA.' >&2; exit 1; }
base=/opt/colect-app
release=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
[[ "$release" == "$base/releases/$revision" ]] || { echo 'Unexpected release directory.' >&2; exit 1; }
shared=$base/shared
app_env=$shared/app.env
deploy_env=$shared/deploy.env
[[ -f "$app_env" && -f "$deploy_env" ]] || { echo 'Missing server configuration.' >&2; exit 1; }

setting() { sed -n "s/^$1=//p" "$deploy_env" | tr -d '\r' | tail -n 1; }
app_setting() { sed -n "s/^$1=//p" "$app_env" | tr -d '\r' | tail -n 1; }

export DOMAIN APP_HTTP_PORT ALFRESCO_DOCKER_NETWORK APP_ENV_FILE DOCUMENTS_PATH APP_IMAGE
DOMAIN=$(setting DOMAIN)
APP_HTTP_PORT=$(setting APP_HTTP_PORT)
APP_HTTP_PORT=${APP_HTTP_PORT:-8300}
ALFRESCO_DOCKER_NETWORK=$(setting ALFRESCO_DOCKER_NETWORK)
ALFRESCO_DOCKER_NETWORK=${ALFRESCO_DOCKER_NETWORK:-geoarchives-alfresco}
APP_ENV_FILE=$app_env
DOCUMENTS_PATH=$shared/documents
APP_IMAGE="colect-app:$revision"
dc() { docker compose --project-name colect-app --env-file "$deploy_env" -f "$release/compose.contabo.yml" "$@"; }

mapfile -t candidates < <(
  docker ps --format '{{.Names}}|{{.Image}}' |
    awk -F'|' 'tolower($1 " " $2) ~ /alfresco-content-repository/ { print $1 }'
)
if (( ${#candidates[@]} == 0 )); then
  echo 'Alfresco activation: no running content repository container found; integration remains unchanged.'
  exit 0
fi
if (( ${#candidates[@]} > 1 )); then
  echo 'Alfresco activation: multiple repository containers found; refusing an ambiguous activation.' >&2
  exit 1
fi
alfresco_container=${candidates[0]}

if ! docker network inspect --format '{{range .Containers}}{{println .Name}}{{end}}' "$ALFRESCO_DOCKER_NETWORK" |
  grep -Fxq "$alfresco_container"; then
  docker network connect --alias alfresco-geoarchives "$ALFRESCO_DOCKER_NETWORK" "$alfresco_container"
fi

java_options=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$alfresco_container" |
  sed -n -e 's/^JAVA_TOOL_OPTIONS=//p' -e 's/^JAVA_OPTS=//p' | head -n 1)
admin_password=${java_options#*-Dalfresco_user_store.adminpassword=}
if [[ "$admin_password" == "$java_options" ]]; then
  echo 'Alfresco activation: repository administrator credential was not found in the container configuration.' >&2
  exit 1
fi
admin_password=${admin_password%% -D*}
[[ -n "$admin_password" ]] || { echo 'Alfresco activation: repository administrator credential is empty.' >&2; exit 1; }

current_username=$(app_setting ALFRESCO_USERNAME)
current_password=$(app_setting ALFRESCO_PASSWORD)
service_password=$current_password
[[ -n "$service_password" ]] || service_password=$(openssl rand -hex 32)

app_container=$(dc ps -q app)
[[ -n "$app_container" ]] || { echo 'Alfresco activation: GeoArchives application container is not running.' >&2; exit 1; }

setup_result=$(
  docker exec -i \
    -e ALFRESCO_SETUP_URL=http://alfresco-geoarchives:8080/alfresco \
    -e ALFRESCO_ADMIN_PASSWORD="$admin_password" \
    -e ALFRESCO_CURRENT_USERNAME="$current_username" \
    -e ALFRESCO_SERVICE_PASSWORD="$service_password" \
    "$app_container" node - <<'NODE'
const base = `${process.env.ALFRESCO_SETUP_URL}/api/-default-/public/alfresco/versions/1`;
const { randomUUID } = require("node:crypto");
const password = process.env.ALFRESCO_SERVICE_PASSWORD;
const adminPassword = process.env.ALFRESCO_ADMIN_PASSWORD;
const currentUsername = process.env.ALFRESCO_CURRENT_USERNAME;

if (!password || !adminPassword) throw new Error("Missing Alfresco setup credentials.");

const authorization = (username, secret) =>
  `Basic ${Buffer.from(`${username}:${secret}`).toString("base64")}`;

async function request(path, { username, secret, method = "GET", body, allowed = [] }) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: authorization(username, secret),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && !allowed.includes(response.status)) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`Alfresco ${method} ${path} failed with ${response.status}: ${detail}`);
  }
  return response;
}

async function credentialsWork(username) {
  if (!username) return false;
  const response = await request("/people/-me-", {
    username,
    secret: password,
    allowed: [401, 403, 404],
  });
  return response.ok;
}

let username = currentUsername;
let created = false;
if (!(await credentialsWork(username))) {
  const preferred = "geoarchives-service";
  const lookup = await request(`/people/${encodeURIComponent(preferred)}`, {
    username: "admin",
    secret: adminPassword,
    allowed: [404],
  });
  username = lookup.status === 404
    ? preferred
    : `${preferred}-${randomUUID().slice(0, 8)}`;
  await request("/people", {
    username: "admin",
    secret: adminPassword,
    method: "POST",
    body: {
      id: username,
      firstName: "Service",
      lastName: "GeoArchives",
      email: "geoarchives-service@ceiba-analytics.com",
      password,
      enabled: true,
    },
  });
  created = true;
}

const childrenResponse = await request("/nodes/-my-/children?skipCount=0&maxItems=1000", {
  username,
  secret: password,
});
const children = (await childrenResponse.json()).list.entries.map(({ entry }) => entry);
let root = children.find((entry) => entry.isFolder && entry.name === "GeoArchives-MULCV");
if (!root) {
  const createResponse = await request("/nodes/-my-/children", {
    username,
    secret: password,
    method: "POST",
    body: { name: "GeoArchives-MULCV", nodeType: "cm:folder" },
  });
  root = (await createResponse.json()).entry;
}

process.stdout.write(JSON.stringify({ username, rootNodeId: root.id, created }));
NODE
)

service_username=$(printf '%s' "$setup_result" | sed -n 's/.*"username":"\([A-Za-z0-9._@-]*\)".*/\1/p')
root_node_id=$(printf '%s' "$setup_result" | sed -n 's/.*"rootNodeId":"\([A-Za-z0-9-]*\)".*/\1/p')
[[ "$service_username" =~ ^[A-Za-z0-9._@-]+$ ]] || { echo 'Alfresco activation: invalid service identity response.' >&2; exit 1; }
[[ "$root_node_id" =~ ^[A-Za-z0-9-]+$ ]] || { echo 'Alfresco activation: invalid root folder response.' >&2; exit 1; }

env_tmp=$(mktemp "$shared/app.env.XXXXXX")
awk -F= '
  $1 != "ARCHIVE_STORAGE_PROVIDER" &&
  $1 != "ALFRESCO_API_URL" &&
  $1 != "ALFRESCO_USERNAME" &&
  $1 != "ALFRESCO_PASSWORD" &&
  $1 != "ALFRESCO_ROOT_NODE_ID" &&
  $1 != "ALFRESCO_WEB_URL" &&
  $1 != "ALFRESCO_NODE_TYPE" &&
  $1 != "ALFRESCO_CLASSIFICATION" { print }
' "$app_env" > "$env_tmp"
{
  printf 'ARCHIVE_STORAGE_PROVIDER=alfresco\n'
  printf 'ALFRESCO_API_URL=http://alfresco-geoarchives:8080/alfresco\n'
  printf 'ALFRESCO_USERNAME=%s\n' "$service_username"
  printf 'ALFRESCO_PASSWORD=%s\n' "$service_password"
  printf 'ALFRESCO_ROOT_NODE_ID=%s\n' "$root_node_id"
  printf 'ALFRESCO_NODE_TYPE=arc:archiveDocument\n'
  printf 'ALFRESCO_CLASSIFICATION=INTERNAL\n'
} >> "$env_tmp"
chown --reference="$app_env" "$env_tmp"
chmod --reference="$app_env" "$env_tmp"
mv -f -- "$env_tmp" "$app_env"

dc up -d --no-build --force-recreate --wait --wait-timeout 180 app
dc exec -T app node deploy/healthcheck.mjs --readiness
echo "Alfresco activation: enabled with an isolated service identity and root folder $root_node_id."
