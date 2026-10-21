#!/usr/bin/env bash
set -Eeuo pipefail

# Report only non-secret runtime metadata. This lets CI confirm whether an
# existing Alfresco repository can be connected without exposing credentials.
mapfile -t candidates < <(
  docker ps --format '{{.Names}}|{{.Image}}' |
    awk -F'|' 'tolower($1 " " $2) ~ /alfresco-content-repository|(^|[-_])alfresco([-_]|$)/ { print $1 }'
)

if (( ${#candidates[@]} == 0 )); then
  echo 'Alfresco discovery: no running repository container found on this host.'
  exit 0
fi

echo "Alfresco discovery: ${#candidates[@]} repository container(s) found."
for container in "${candidates[@]}"; do
  image=$(docker inspect --format '{{.Config.Image}}' "$container")
  networks=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{printf "%s " $name}}{{end}}' "$container")
  secret_state=missing
  if docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" |
    grep -Eq '(^|[[:space:]])(ALFRESCO_ADMIN_PASSWORD|JAVA_OPTS|JAVA_TOOL_OPTIONS)='; then
    secret_state=present
  fi

  ready=false
  addresses=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' "$container")
  while IFS= read -r address; do
    [[ -n "$address" ]] || continue
    if curl --fail --silent --show-error --max-time 8 \
      "http://$address:8080/alfresco/api/-default-/public/alfresco/versions/1/probes/-ready-" \
      >/dev/null; then
      ready=true
      break
    fi
  done <<< "$addresses"

  printf 'Alfresco container: name=%s image=%s networks=%s ready=%s admin-config=%s\n' \
    "$container" "$image" "${networks% }" "$ready" "$secret_state"
done
