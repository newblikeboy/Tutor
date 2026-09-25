#!/usr/bin/env bash
# Sourced by deployment tooling; resolve credentials without reading private settings.
resolve_migration_identity() {
  local service=${1:-tutor-api} dynamic_user
  migration_user=$(systemctl show "$service" --property=User --value) || return 1
  migration_group=$(systemctl show "$service" --property=Group --value) || return 1
  dynamic_user=$(systemctl show "$service" --property=DynamicUser --value) || return 1
  migration_supplementary_groups=$(systemctl show "$service" --property=SupplementaryGroups --value) || return 1
  if [[ "$dynamic_user" == yes ]]; then
    printf 'Cannot reuse a DynamicUser account for a separate migration service. No deployment changes were made.\n' >&2
    return 1
  fi
  # An unset User on an existing system service means root; preserve that identity.
  # A named but missing account must never fall back to root.
  migration_user=${migration_user:-root}
  if ! id -u -- "$migration_user" >/dev/null 2>&1; then
    printf 'The configured API service account cannot be resolved: %s\n' "$migration_user" >&2
    return 1
  fi
  if [[ -z "$migration_group" ]]; then
    migration_group=$(id -g -- "$migration_user") || return 1
  fi
  if ! getent group "$migration_group" >/dev/null; then
    printf 'The configured API service group cannot be resolved: %s\n' "$migration_group" >&2
    return 1
  fi
}
