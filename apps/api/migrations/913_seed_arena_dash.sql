INSERT INTO ga_runtime_games(record_key,revision,record,deleted_at,updated_at)
SELECT
  'arena-dash',
  1,
  '{"id":"arena-dash","title":"Arena Dash","description":"Dodge neon gates, build a streak and finish a complete reward-enabled run in the browser.","genre":"Arcade","tier":"free","orientation":"portrait","multiplayer":false,"reward":20,"status":"live","rolloutPercentage":100,"gameUrl":"/demo-games/arena-dash/index.html","version":"demo","internalDemo":true,"preview":true,"sourceType":"internal-demo","rewardsEnabled":true,"competitionsEnabled":false}'::jsonb,
  NULL,
  clock_timestamp()
WHERE EXISTS (
  SELECT 1 FROM ga_runtime_games WHERE deleted_at IS NULL
)
ON CONFLICT(record_key) DO NOTHING;
