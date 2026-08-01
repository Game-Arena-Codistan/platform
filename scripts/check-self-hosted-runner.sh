#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$*" >&2
  exit 1
}

if [ -n "${RUNNER_NAME:-}" ] && [ "${RUNNER_OS:-}" != "Windows" ]; then
  fail "GitHub reports RUNNER_OS=${RUNNER_OS}; this runner must use Windows."
fi

for tool in git node npm docker jq curl tofu bash; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required tool is missing: $tool"
done

node_major="$(node -p "process.versions.node.split('.')[0]")"
[ "$node_major" = "22" ] || fail "Node.js major 22 is required; found $(node --version)."

docker info >/dev/null 2>&1 || fail "Docker Desktop is installed but its Linux-container engine is not available."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."

tofu_version="$(tofu version -json | jq -r .terraform_version)"
[ "$tofu_version" = "1.12.5" ] || fail "OpenTofu 1.12.5 is required; found $tofu_version."

available_kb="$(node -e "const fs=require('node:fs');const s=fs.statfsSync(process.env.GITHUB_WORKSPACE||'.');console.log(Math.floor(Number(s.bavail)*Number(s.bsize)/1024))")"
[ "${available_kb:-0}" -ge 10485760 ] || fail "At least 10 GiB of free workspace storage is required."

echo "Runner prerequisites passed."
echo "Host: Windows"
echo "Node: $(node --version)"
echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version --short)"
echo "OpenTofu: $tofu_version"
echo "Free workspace KiB: $available_kb"
