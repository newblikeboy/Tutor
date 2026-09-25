#!/usr/bin/env bash
# Isolated command stubs: no systemd, accounts, private files or services are modified.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
source scripts/deploy-identity.sh
systemctl() {
  [[ ${query_fails:-no} != yes ]] || return 1
  case "$3" in
    --property=User) printf '%s\n' "$configured_user" ;;
    --property=Group) printf '%s\n' "$configured_group" ;;
    --property=DynamicUser) printf '%s\n' "$configured_dynamic" ;;
    --property=SupplementaryGroups) printf '%s\n' "$configured_extra" ;;
    *) return 1 ;;
  esac
}
id() {
  [[ "$3" == gyansetu || "$3" == root ]] || return 1
  if [[ "$3" == root ]]; then printf '0\n'
  elif [[ "$1" == -g ]]; then printf '1002\n'
  else printf '1001\n'; fi
}
getent() { [[ "$1" == group && ( "$2" == app-workers || "$2" == 1002 || "$2" == 0 ) ]]; }
configured_user=gyansetu configured_group=app-workers configured_dynamic=no configured_extra='media-readers'
resolve_migration_identity
[[ "$migration_user" == gyansetu && "$migration_group" == app-workers && "$migration_supplementary_groups" == media-readers ]]
configured_group=''
resolve_migration_identity
[[ "$migration_group" == 1002 ]]
configured_user=''
resolve_migration_identity
[[ "$migration_user" == root && "$migration_group" == 0 ]]
configured_user=missing-user
if resolve_migration_identity 2>/dev/null; then printf 'Missing named user incorrectly accepted\n' >&2; exit 1; fi
configured_user=gyansetu configured_group=missing-group
if resolve_migration_identity 2>/dev/null; then printf 'Missing group incorrectly accepted\n' >&2; exit 1; fi
configured_group=app-workers configured_dynamic=yes
if resolve_migration_identity 2>/dev/null; then printf 'Dynamic user incorrectly accepted\n' >&2; exit 1; fi
configured_dynamic=no query_fails=yes
if resolve_migration_identity 2>/dev/null; then printf 'Failed service lookup incorrectly accepted\n' >&2; exit 1; fi
printf 'PASS: service account/group, primary group, supplementary groups, system default, missing accounts, dynamic user and lookup failure.\n'
