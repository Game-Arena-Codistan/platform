#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as the dedicated non-root runner user with sudo access." >&2
  exit 1
fi

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git jq zip unzip xz-utils \
  build-essential libicu-dev libssl-dev \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libdbus-1-3 libatspi2.0-0 libx11-6 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 \
  libxcb1 libxkbcommon0 libpango-1.0-0 libcairo2 libasound2t64

cat <<'EOF'

Base Linux and browser dependencies are installed.

Complete the remaining host-owned setup before registering the runner:
1. Install Node.js major 22.
2. Install Docker Engine/CLI with Compose v2, or enable Docker Desktop WSL integration.
3. Install OpenTofu exactly 1.12.5.
4. Confirm the dedicated user can run `docker info` without sudo.
5. Open the organization runner page and execute GitHub's current Linux x64 registration commands.
6. Configure the custom label `game-arena-ci`.
7. Install the runner as a service using GitHub's generated `svc.sh` commands.

Registration tokens are temporary credentials. Never paste them into chat, issues, scripts or shell-history files.
EOF
