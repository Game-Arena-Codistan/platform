#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$*" >&2
  exit 1
}

[ "$(uname -s)" = "Linux" ] || fail "The Game Arena CI runner must use Linux."

for tool in git node npm docker zip unzip jq curl tofu; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required tool is missing: $tool"
done

node_major="$(node -p "process.versions.node.split('.')[0]")"
[ "$node_major" = "22" ] || fail "Node.js major 22 is required; found $(node --version)."

docker info >/dev/null 2>&1 || fail "Docker is installed but its daemon is not available."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."

tofu_version="$(tofu version -json | jq -r .terraform_version)"
[ "$tofu_version" = "1.12.5" ] || fail "OpenTofu 1.12.5 is required; found $tofu_version."

available_kb="$(df -Pk "${GITHUB_WORKSPACE:-.}" | awk 'NR==2 {print $4}')"
[ "${available_kb:-0}" -ge 10485760 ] || fail "At least 10 GiB of free workspace storage is required."

if [ -n "${RUNNER_NAME:-}" ] && [ "${RUNNER_OS:-}" != "Linux" ]; then
  fail "GitHub reports RUNNER_OS=${RUNNER_OS}; Linux is required."
fi

echo "Runner prerequisites passed."
echo "Node: $(node --version)"
echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version --short)"
echo "OpenTofu: $tofu_version"
echo "Free workspace KiB: $available_kb"
