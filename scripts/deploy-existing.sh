#!/usr/bin/env bash
# Operator-invoked update for the existing /srv/tutor + systemd deployment.
# Builds this commit and applies only the additive Updates inbox migration.
# Never seeds, resets data, or edits private settings.
set -Eeuo pipefail
umask 022
cd "$(dirname "$0")/.."

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $(id -u) == 0 ]] || fail 'Run this deployment as root (sudo).'
for tool in git npm go curl python3 flock nginx systemctl systemd-run getent; do
  command -v "$tool" >/dev/null || fail "Required command is missing: $tool"
done
exec 9>/run/lock/gyansetu-deploy.lock
flock -n 9 || fail 'Another GyanSetu deployment is running.'

current=/srv/tutor/current
[[ -L "$current" ]] || fail '/srv/tutor/current must be the existing release symlink; no files were changed.'
previous=$(readlink -e "$current")
[[ -f "$previous/tutor-api" && -f "$previous/web/index.html" ]] || fail 'Existing release is incomplete; no files were changed.'
[[ -r /etc/tutor/api.env ]] || fail 'The production environment file is missing.'
grep -qx 'APP_ENV=production' /etc/tutor/api.env || fail 'Expected APP_ENV=production in /etc/tutor/api.env.'
grep -qx 'AUTH_PROVIDER=password' /etc/tutor/api.env || fail 'Expected the existing password authentication configuration.'
grep -qx 'HTTP_ADDR=127.0.0.1:8080' /etc/tutor/api.env || fail 'Expected the existing loopback API binding.'
grep -qx 'WEB_ORIGIN=https://thegyansetu.in' /etc/tutor/api.env || fail 'Expected the existing HTTPS domain origin.'
systemctl show tutor-api --property=ExecStart --value | grep -Fq '/srv/tutor/current/tutor-api' || fail 'The service does not use the expected release path.'
source scripts/deploy-identity.sh
resolve_migration_identity tutor-api || fail 'Could not resolve the existing API service identity; the running release was not changed.'
printf 'Migration will use the existing API service account: %s (group %s).\n' "$migration_user" "$migration_group"
nginx -t

commit=$(git rev-parse HEAD)
printf 'Building GyanSetu commit %s. The current site stays running during the build.\n' "$commit"
# Limit build concurrency for the existing 1 GiB droplet.
export GOMAXPROCS=1
export NODE_OPTIONS=--max-old-space-size=512
npm ci --no-audit --no-fund
npm run build

mkdir -p /srv/tutor/releases
release=$(mktemp -d "/srv/tutor/releases/${commit:0:12}-XXXXXXXX")
chmod 755 "$release"
next="/srv/tutor/.current-$$"
switched=0
rollback() {
  trap - ERR INT TERM
  set +e
  if [[ "$switched" == 1 ]]; then
    if ln -sfn "$previous" "$next" && mv -Tf "$next" "$current" && systemctl restart tutor-api; then
      printf '\nDeployment failed; restored previous release: %s\n' "$previous" >&2
    else
      printf '\nRollback needs operator attention. Previous release: %s\n' "$previous" >&2
    fi
  else
    printf '\nDeployment stopped; the running release was not replaced.\n' >&2
  fi
  printf 'New build retained for review: %s\n' "$release" >&2
  exit 1
}
trap rollback ERR INT TERM

for binary in api migrate staff; do
  (cd apps/api && CGO_ENABLED=0 go build -p 1 -trimpath -o "$release/tutor-$binary" "./cmd/$binary")
done
mkdir -p "$release/web/assets"
# Keep prior hashed bundles available to tabs opened before the deployment.
if [[ -d "$previous/web/assets" ]]; then
  cp -a "$previous/web/assets/." "$release/web/assets/"
fi
cp -a apps/web/dist/. "$release/web/"
printf '%s\n' "$commit" > "$release/REVISION"
printf '%s\n' "$previous" > "$release/PREVIOUS_RELEASE"

# systemd reads the private environment without sourcing or printing secrets.
# This migration only adds inbox collections/indexes; old releases ignore them.
systemd-run --quiet --wait --pipe --collect \
  --property="User=$migration_user" --property="Group=$migration_group" \
  --property="SupplementaryGroups=$migration_supplementary_groups" \
  --property=EnvironmentFile=/etc/tutor/api.env \
  "$release/tutor-migrate" --inbox-only

ln -s "$release" "$next"
switched=1
mv -Tf "$next" "$current"
systemctl restart tutor-api
curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 2 --max-time 10 \
  --resolve thegyansetu.in:443:127.0.0.1 https://thegyansetu.in/api/v1/ready
curl --fail --silent --show-error --max-time 15 \
  --resolve thegyansetu.in:443:127.0.0.1 https://thegyansetu.in/api/v1/config |
  python3 -c 'import json,sys; c=json.load(sys.stdin); assert c["appName"] == "GyanSetu" and c["authEnabled"] is True and c["development"] is False, "Unexpected production app configuration"'
curl --fail --silent --show-error --max-time 15 \
  --resolve thegyansetu.in:443:127.0.0.1 https://thegyansetu.in/ |
  cmp -s "$release/web/index.html" -
systemctl is-active --quiet tutor-api
trap - ERR INT TERM
printf '\nDeployed %s to https://thegyansetu.in\nPrevious release retained: %s\n' "$commit" "$previous"
