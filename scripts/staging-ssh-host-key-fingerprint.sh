#!/usr/bin/env bash
set -euo pipefail

host="${1:-${DEPLOY_HOST:-}}"
port="${2:-${DEPLOY_SSH_PORT:-22}}"

if [ -z "$host" ]; then
  echo 'DEPLOY_HOST (or first argument) is required.' >&2
  exit 2
fi

case "$port" in
  ''|*[!0-9]*) echo 'SSH port must be numeric.' >&2; exit 2 ;;
esac

scan_file="$(mktemp)"
trap 'rm -f "$scan_file"' EXIT

# Discovery only: this does not establish trust. Compare these fingerprints with
# the EC2/server console or an already-trusted administrator session before
# storing a known_hosts entry in GitHub.
ssh-keyscan -T 8 -p "$port" "$host" 2>/dev/null > "$scan_file" || true

if [ ! -s "$scan_file" ]; then
  echo 'No SSH host keys were returned. Check network reachability and SSH port.' >&2
  exit 2
fi

ssh-keygen -lf "$scan_file" | awk '{print $2" "$3" "$4}' | sort -u
