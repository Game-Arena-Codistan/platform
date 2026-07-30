# HTML5 Game Integration

Each game is imported as a versioned static build, reviewed, then published to an isolated game origin.

## Game Bridge v1

Host events: `init`, `pause`, `resume`, `mute`, `unmute`, `destroy`.

Game events: `ready`, `score`, `complete`, `error`, `request-reward`, `exit`.

Messages require strict origin and source-window checks. Games can request rewards, but only the backend validates results and writes the append-only Arena Coins ledger.

The ingestion pipeline will reject path traversal, unsafe remote scripts, excessive expanded size and undeclared capabilities.
