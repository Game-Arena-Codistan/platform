# Player Support Playbook

## Launch prerequisites

Insert the approved support email, privacy contact, operating hours, languages and emergency escalation channel before public launch. Support staff must use the private operations console and never request an OTP, JazzCash MPIN, wallet PIN, card details or session token.

## Safe verification

Use the account ID, masked verified identity, transaction reference, game/version and approximate event time. Do not ask a player to publish personal or payment information in a public issue or social post.

## Common cases

### OTP not received

1. Confirm the entered phone/email format without confirming whether an account exists.
2. Check resend timer, provider acceptance and rate-limit diagnostics.
3. Ask the player to check SMS/email filtering and network state.
4. Escalate a provider incident if delivery failures affect multiple players.
5. Never reveal or generate a debug OTP in production.

### Payment pending

1. Find the internal transaction by account/transaction reference.
2. Check verified callback events and provider reconciliation records.
3. Ask the player not to retry repeatedly while the transaction is pending.
4. Never activate premium from a screenshot or browser return page.
5. Escalate amount/status mismatch to finance and the provider.

### Paid but premium missing

1. Confirm the transaction is verified paid and belongs to the account.
2. Check entitlement history and activation latency.
3. Run reconciliation if the callback is absent or out of order.
4. Record any manual correction with finance approval and an audit reason.

### Game not loading

1. Record game ID/version, device, OS/browser, network and time.
2. Check game state, rollout, origin health and recent reports.
3. Suggest retry, Data Saver, closing other apps and reloading the platform.
4. Pause or roll back the affected version if failure is widespread.

### Missing Arena Coins or score

1. Find the play session and result status.
2. Explain verified, review, rejected or daily-cap state without revealing anti-abuse thresholds.
3. Do not silently edit the balance. Use a reasoned adjustment; high-value changes need a second administrator.

### Account access or lost device

1. Verify through an approved identity channel.
2. Use logout-all or revoke the affected session.
3. Do not change a verified identity without the approved recovery procedure.

### Account deletion or data export

Direct the player to Account. Confirm that deletion signs out devices and begins the configured retention process. Escalate legal/privacy questions to the approved privacy contact.

## Severity and escalation

- **Urgent:** suspected account compromise, payment integrity, unauthorized premium/coins, data exposure or malicious game. Escalate immediately to security/finance/engineering.
- **High:** provider outage, widespread sign-in/payment/game failure or tournament integrity concern. Escalate within 30 minutes.
- **Standard:** individual game/device issue, account question or delayed non-critical reward. Track and respond within approved support hours.

Every escalation should include account/transaction/game identifiers, timestamps, impact, evidence, actions already taken and the next owner. Redact secrets and sensitive identity data.
