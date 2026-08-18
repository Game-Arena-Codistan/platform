#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f infra/docker-compose.yml)
gateway_port="${GATEWAY_PORT:-8095}"
gateway="http://127.0.0.1:${gateway_port}"
fail(){ echo "::error::$*" >&2; exit 1; }
wait_http(){
  local url="$1" label="$2"
  for attempt in $(seq 1 60); do
    if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "$label did not become healthy at $url"
}
scalar(){
  local source="$1" expression="$2"
  JSON_INPUT="$source" node -e 'const value=JSON.parse(process.env.JSON_INPUT);const result=Function("value",`return (${process.argv[1]})`)(value);if(result===undefined)process.exit(2);process.stdout.write(String(result));' "$expression"
}

wait_http "$gateway/healthz" gateway
wait_http "$gateway/api/healthz" api
wait_http "$gateway/api/readyz" readiness
wait_http "$gateway/" player
wait_http http://127.0.0.1:8082/healthz game-origin
wait_http http://127.0.0.1:8083/ admin

health="$(curl --fail --silent --show-error "$gateway/api/healthz")"
[ "$(scalar "$health" 'value.status')" = ok ] || fail "API health status is not ok: $health"
readiness="$(curl --fail --silent --show-error "$gateway/api/readyz")"
[ "$(scalar "$readiness" 'value.status')" = ready ] || fail "API readiness status is not ready: $readiness"

catalogue="$(curl --fail --silent --show-error "$gateway/api/v1/catalog/games")"
count="$(scalar "$catalogue" 'value.games?.length||0')"
[ "$count" -ge 5 ] || fail "Expected at least five public catalogue records; found $count."
for id in duck-hunter ranger-vs-zombies robotex swat-vs-zombies; do
  state="$("${compose[@]}" exec -T postgres psql -U game_arena -d game_arena -tA -F '|' -c "SELECT COALESCE(record->>'status',''),COALESCE(record->>'rolloutPercentage','') FROM ga_runtime_games WHERE deleted_at IS NULL AND record_key='${id}'")"
  [ "$state" = 'paused|0' ] || fail "Pilot $id is not pinned paused at rollout 0 in PostgreSQL; found '$state'."
done

session="$(curl --fail --silent --show-error "$gateway/api/v1/session")"
[ "$(scalar "$session" 'value.authenticated')" = false ] || fail "Anonymous session unexpectedly authenticated: $session"

before="$("${compose[@]}" exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT count(*) FROM ga_runtime_support_tickets WHERE deleted_at IS NULL")"
response="$(curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -d '{"topic":"Game not loading","message":"Verify gateway, API and PostgreSQL durability through the complete local stack."}' \
  "$gateway/api/v1/support/tickets")"
ticket_status="$(scalar "$response" 'value.ticket?.status||""')"
case "$ticket_status" in open|delivered) ;; *) fail "Unexpected support-ticket response: $response" ;; esac
after="$("${compose[@]}" exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT count(*) FROM ga_runtime_support_tickets WHERE deleted_at IS NULL")"
[ "$after" -eq $((before+1)) ] || fail "Expected one durable support-ticket row; before=$before after=$after."

"${compose[@]}" restart api >/dev/null
wait_http "$gateway/api/readyz" api-after-restart
persisted="$("${compose[@]}" exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT count(*) FROM ga_runtime_support_tickets WHERE deleted_at IS NULL")"
[ "$persisted" -eq "$after" ] || fail "Acknowledged write was lost after API restart; expected=$after actual=$persisted."

for url in "$gateway/" http://127.0.0.1:8083/; do
  headers="$(curl --fail --silent --show-error --head "$url")"
  grep -qi '^x-content-type-options: *nosniff' <<<"$headers" || fail "$url is missing X-Content-Type-Options."
done

legacy="$("${compose[@]}" exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT to_regclass('public.platform_state') IS NULL")"
[ "$legacy" = t ] || fail 'Legacy platform_state runtime table still exists.'
model="$("${compose[@]}" exec -T postgres psql -U game_arena -d game_arena -tAc "SELECT value->>'name' FROM ga_runtime_schema_state WHERE id='persistence-model'")"
[ "$model" = normalized-postgres-v1 ] || fail "Unexpected persistence model: $model"

echo "Compose integration passed: services healthy, pilots private and paused, anonymous session safe, PostgreSQL write durable across API restart."
