# Release Qualification Matrix

## Automated gates

| Area | Gate |
|---|---|
| Frontend | Syntax, commercial baseline, catalogue references, shell-size budget, static HTTP smoke and container build |
| API | Syntax, route tests, OTP/session/CSRF, trusted-proxy abuse controls, payment idempotency, entitlement activation, rewards, account lifecycle and admin authorization |
| Games | Catalogue counts, manifest validation, static scanner, immutable packaging, Bridge schemas, origin container and scheduled entry-point probes |
| Security | Repository credential patterns, dependency pinning, unfinished markers, wildcard messaging, browser auth storage, unsafe sandbox flags and production container builds |
| Infrastructure | Docker Compose rendering, Kubernetes manifests, migration runner, AWS OpenTofu validation and production-delivery policy checks |
| Performance | Dependency-free API load profile with error-rate and p95 thresholds; report retained as a CI artifact |

All automated checks must pass on the release commit. External game-host probes remain informational until approved builds are published to the controlled origin; controlled-origin builds must pass strict probes.

## Supported test matrix

### Browsers and devices

- Android Chrome: current and previous major on low-memory Android 9/10 and a current Android device
- Samsung Internet: current supported release
- iOS Safari: current and previous major on one older supported iPhone and one current iPhone
- Desktop Chrome, Edge, Firefox and Safari current major
- Installed PWA launch, update, offline shell and resume behavior

### Network profiles

- Wi-Fi / broadband baseline
- Fast 4G
- Slow 4G: 1.6 Mbps down, 750 Kbps up, 150 ms RTT
- Slow 3G: 400 Kbps down, 400 Kbps up, 400 ms RTT
- 2% packet loss and intermittent offline/online transitions
- Background for 30 seconds and 5 minutes, then resume

### Critical journeys

1. Guest feed, search, category and game details
2. Free game launch, rotation, background/resume, exit and retry
3. OTP request, invalid code, resend, successful sign-in and logout-all
4. Premium game gate, plan selection, JazzCash handoff, cancel, failed, pending and paid return
5. Entitlement persistence across refresh and second device
6. Arena Coin credit, duplicate completion, suspicious result review and challenge claim
7. Tournament entry, leaderboard order and disqualification review
8. Game pause, kill switch and version rollback
9. Account export and deletion request
10. Keyboard, TalkBack, VoiceOver, zoom, reduced motion and visible focus

## Acceptance thresholds

- No unresolved critical/high security or data-integrity issue
- No blocker in sign-in, payment, entitlement, free play or premium play
- LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 at p75 for the shell on supported production traffic
- API p95 ≤500 ms for the launch-profile synthetic test; error rate ≤1%
- No game silently grants coins; all accepted rewards trace to a play session and ledger entry
- Every launch game passes representative device/runtime QA and licensing approval

## Evidence record

For each device/network row record date, tester, build SHA, OS/browser, network profile, journey, result, screenshots/video where permitted, defect links and retest result. AWS staging, manual qualification, security, provider, backup/restore and go-live evidence are consolidated in GitHub issue #48. Game-build certification and publication are tracked in #40; live JazzCash merchant verification is tracked in #17.
