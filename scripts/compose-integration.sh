#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f infra/docker-compose.yml)
fail(){ echo "::error::$*" >&2; exit 1; }
wait_http(){
  local url="$1" label="$2"
  for attempt in $(seq 1 60); do
    if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "$label did not become healthy at $url"
}
json(){ node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(0,"utf8"));const path=process.argv[1].split(".");let current=value;for(const key of path)current=current?.[key];if(current===undefined)process.exit(2);process.stdout.write(typeof current==="object"?JSON.stringify(current):String(current));' "$1"; }

wait_http http://127.0.0.1:8080/healthz gateway
wait_http http://127.0.0.1:8080/api/healthz api
wait_http http://127.0.0.1:8080/api/readyz readiness
wait_http http://127.0.0.1:8080/ player
wait_http http://127.0.0.1:8082/healthz game-origin
wait_http http://127.0.0.1:8083/ admin

health="$(curl --fail --silent --show-error http://127.0.0.1:8080/api/healthz)"
[ "$(printf '%s' "$health" | json status)" = ok ] || fail 'API health status is not ok.'
readiness="$(curl --fail --silent --show-error http://127.0.0.1:8080/api/readyz)"
[ "$(printf '%s' "$readiness" | json status)" = ready ] || fail 'API readiness status is not ready.'

catalogue="$(curl --fail --silent --show-error http://127.0.0.1:8080/api/v1/catalog/games)"
count="$(printf '%s' "$catalogue" | node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(0,"utf8"));console.log(value.games?.length||0)')"
[ "$count" -ge 5 ] || fail "Expected at least five catalogue records; found $count."
printf '%s' "$catalogue" | node <<'NODE'
const fs=require('node:fs');
const value=JSON.parse(fs.readFileSync(0,'utf8'));
const pilots=['duck-hunter','ranger-vs-zombies','robotex','swat-vs-zombies'];
for(const id of pilots){
  const game=value.games.find(item=>item.id===id);
  if(!game||game.status!=='paused'||Number(game.rolloutPercentage)!==0){
    console.error(`Pilot ${id} is not pinned paused at rollout 0.`);
    process.exit(1);
  }
}
NODE

session="$(curl --fail --silent --show-error http://127.0.0.1:8080/api/v1/session)"
[ "$(printf '%s' "$session" | json authenticated)" = false ] || fail 'Anonymous session unexpectedly authenticated.'

before="$(${compose[@]} exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT count(*) FROM ga_runtime_support_tickets WHERE deleted_at IS NULL")"
response="$(curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -d '{"topic":"compose-integration","message":"Verify gateway, API and PostgreSQL durability through the complete local stack."}' \
  http://127.0.0.1:8080/api/v1/support/tickets)"
[ "$(printf '%s' "$response" | json ticket.status)" = open ] || fail 'Support-ticket integration write did not return open status.'
after="$(${compose[@]} exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT count(*) FROM ga_runtime_support_tickets WHERE deleted_at IS NULL")"
[ "$after" -eq $((before+1)) ] || fail "Expected one durable support-ticket row; before=$before after=$after."

${compose[@]} restart api >/dev/null
wait_http http://127.0.0.1:8080/api/readyz api-after-restart
persisted="$(${compose[@]} exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT count(*) FROM ga_runtime_support_tickets WHERE deleted_at IS NULL")"
[ "$persisted" -eq "$after" ] || fail "Acknowledged write was lost after API restart; expected=$after actual=$persisted."

for url in http://127.0.0.1:8080/ http://127.0.0.1:8083/; do
  headers="$(curl --fail --silent --show-error --head "$url")"
  grep -qi '^x-content-type-options: *nosniff' <<<"$headers" || fail "$url is missing X-Content-Type-Options."
done

legacy="$(${compose[@]} exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT to_regclass('public.platform_state') IS NULL")"
[ "$legacy" = t ] || fail 'Legacy platform_state runtime table still exists.'
model="$(${compose[@]} exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT value->>'name' FROM ga_runtime_schema_state WHERE id='persistence-model'")"
[ "$model" = normalized-postgres-v1 ] || fail "Unexpected persistence model: $model"

echo "Compose integration passed: services healthy, pilots paused, anonymous session safe, PostgreSQL write durable across API restart."
