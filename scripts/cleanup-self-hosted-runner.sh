#!/usr/bin/env bash
set +e

run_id="${GITHUB_RUN_ID:-manual}"
workspace="${GITHUB_WORKSPACE:-$(pwd)}"

echo "Cleaning Game Arena resources for run ${run_id}."

container_ids="$(docker ps -aq --filter "label=game-arena.ci.run=${run_id}" 2>/dev/null)"
[ -z "$container_ids" ] || docker rm -f $container_ids >/dev/null 2>&1

network_ids="$(docker network ls -q --filter "label=game-arena.ci.run=${run_id}" 2>/dev/null)"
[ -z "$network_ids" ] || docker network rm $network_ids >/dev/null 2>&1

volume_ids="$(docker volume ls -q --filter "label=game-arena.ci.run=${run_id}" 2>/dev/null)"
[ -z "$volume_ids" ] || docker volume rm -f $volume_ids >/dev/null 2>&1

image_ids="$(docker images -q --filter "label=game-arena.ci.run=${run_id}" 2>/dev/null | sort -u)"
[ -z "$image_ids" ] || docker rmi -f $image_ids >/dev/null 2>&1

rm -rf \
  "/tmp/game-arena-${run_id}"* \
  "/tmp/game-arena-api-${run_id}.log" \
  "$workspace/apps/api/reports" \
  "$workspace/apps/game-ops/reports" \
  "$workspace/tests/e2e/report" \
  "$workspace/tests/e2e/test-results" \
  "$workspace/codeql-results" \
  "$workspace/reports"

if git -C "$workspace" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$workspace" reset --hard HEAD >/dev/null 2>&1
  git -C "$workspace" clean -ffdx >/dev/null 2>&1
fi

echo "Game Arena run cleanup complete."
exit 0
