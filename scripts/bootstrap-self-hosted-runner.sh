#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as the dedicated non-root runner user with sudo access." >&2
  exit 1
fi

. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "Ubuntu is required; found ${PRETTY_NAME:-unknown}." >&2; exit 1; }
case "${VERSION_ID:-}" in
  22.04|24.04|26.04) ;;
  *) echo "Use a Docker-supported Ubuntu LTS release; found ${VERSION_ID:-unknown}." >&2; exit 1 ;;
esac

audio_package=libasound2t64
apt-cache show "$audio_package" >/dev/null 2>&1 || audio_package=libasound2

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git jq zip unzip xz-utils \
  build-essential libicu-dev libssl-dev \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libdbus-1-3 libatspi2.0-0 libx11-6 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 \
  libxcb1 libxkbcommon0 libpango-1.0-0 libcairo2 "$audio_package"

cat <<'EOF'

Base Linux and browser dependencies are installed.

Complete the remaining host-owned setup before registering the runner:
1. Install Node.js major 22 from the official Node.js v22 distribution.
2. Install Docker Engine/CLI and Compose v2 from Docker's official Ubuntu repository, or enable Docker Desktop WSL integration.
3. Install OpenTofu exactly 1.12.5 from the official OpenTofu distribution.
4. Add the dedicated user to the Docker group, start a fresh login session, and confirm `docker info` works without sudo.
5. Open the organization runner page and execute GitHub's current Linux x64 registration commands.
6. Configure the custom label `game-arena-ci`.
7. Install the runner as a service using GitHub's generated `svc.sh` commands.
8. Run `bash scripts/check-self-hosted-runner.sh` and then dispatch the Runner Smoke workflow.

Registration tokens are temporary credentials. Never paste them into chat, issues, scripts, screenshots or shell-history files.
EOF
