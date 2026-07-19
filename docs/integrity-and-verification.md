# Integrity and verification

How Trader Battles labels simulated data today, which integrity mechanics the demo already implements,
and how a production version with live integrations would handle the rest. The demo does not need
production-grade enforcement — but the structure acknowledges every issue below, and several defenses
are already real code.

## Verification states

Every account, execution event, battle participant, and snapshot carries a `verificationStatus`
(`lib/data/schema/enums.ts`):

| State | Meaning |
|---|---|
| `SIMULATED` | Generated demo data. **Every row in this demo is `SIMULATED` — no exceptions.** |
| `SELF_REPORTED` | User-supplied (e.g. a CSV import) with no independent attestation |
| `CLIENT_VERIFIED` | Attested by client-side software (e.g. a desktop add-on) signing what it observed |
| `PROVIDER_VERIFIED` | Confirmed server-to-server with the provider — the future target state for live data |
| `MANUALLY_REVIEWED` | Examined and confirmed by a human reviewer |
| `DISPUTED` | Under dispute; excluded from authoritative results until resolved |

The demo never uses `PROVIDER_VERIFIED`; the other states exist now so live integrations plug in
without schema changes. The seed validator (`npm run seed`) fails if any demo row is labeled anything
other than `SIMULATED`.

## Labeling policy

- **One global demo notice** — `components/layout/demo-notice.tsx`, rendered once in the root layout:
  "Interactive concept demo — all traders, trades, and results are simulated."
- **Contextual labels where it matters** — "Simulated Demo Data" / "Demo Verified" chips on accounts,
  battle verification indicators, firm pages ("Demo firm — no real partnership implied"), and the
  headless runner's output — not disclaimers on every element.
- Demo activity is never presented as genuinely provider-verified trading, and skill indicators
  (discipline/risk/performance) are framed as competitive execution quality, never as returns or a
  promise of profitability.

## What the demo already implements

**Server-side authoritative scoring.** All scoring lives in `lib/scoring/*` and rating in
`lib/ratings/*` as pure, isolated functions; the battle engine is their only caller and UI components
only render already-computed results (they never recompute scores — enforced as a project rule and
checked in QA). In production these modules run on the server and clients receive snapshots; a client
can render whatever it likes, but it cannot *be* the score.

**Event deduplication.** Every event is keyed by `sourceProvider + providerEventId` and applied at
most once (`lib/executions/deduplicateExecution.ts`). This is exercised constantly: the mock event
generator intentionally **re-delivers one duplicate execution per battle** (the demo participant's
first exit fill, same `providerEventId`, 30 seconds later) — exactly what real providers do on
reconnects, at-least-once webhooks, and overlapping history pulls — and the pipeline must drop it.

**Validation before state.** `normalizeExecution.ts` treats every adapter record as untrusted,
rejecting malformed events with reasons; rejected events never reach the ledger. Events for the wrong
instrument are rejected at the pipeline door.

**Audit trail.** Accepted events retain the provider payload as received (`rawPayload`) plus both
`occurredAt` (provider clock) and `receivedAt` (our clock), and the pipeline records valid non-fill
events (orders, cancels, snapshots) without moving the position. Pipeline state keeps
accepted/duplicate/rejected counts. Because the ledger is a pure function of the event sequence, any
battle can be re-derived from its stored events.

**Determinism.** All randomness is seeded: the master seed `0x7b17c0de` fans into mulberry32 streams
for the dataset, and each scenario has its own PRNG seed. The same scenario replays identically every
run — `npm run seed` verifies byte-identical rebuilds, and there is no unseeded `Math.random()` in
domain, scoring, or pipeline code. Determinism is an integrity property: any result can be reproduced
and inspected.

## How a production version would handle the rest

**Signed provider events.** Desktop add-ons (Phase 1) sign each normalized event with a device-bound
key issued at account linking; server-to-server integrations authenticate the transport and are
verified against the provider's own records. Signature verification happens before
`processExecutionEvent`; unsigned or badly signed events are rejected and logged, never scored.

**Replay-attack prevention.** Three layers: the existing dedupe key rejects resubmitted event ids;
signed events carry timestamps and monotonic sequence numbers per account, with stale or out-of-window
events quarantined instead of applied; and periodic account snapshots are reconciled against the
ledger, so a fabricated or replayed stream diverges from the provider's balance and is flagged.

**Account-ownership verification.** Linking an account requires an authorization the platform can
verify (OAuth grant, provider API confirmation, or an add-on challenge proving control of the running
platform session), binding `externalAccountId` to exactly one Trader Battles user. One live account
may not back multiple competing identities.

**Match manipulation, collusion, and multi-account abuse.** Matchmaking already leaves explicit
plug-in points (`lib/battles/matchmaking.ts`) for smurf detection (rating vs performance mismatch)
and completion reliability. Production adds: pairing-history limits between the same accounts,
correlation checks on opposing order flow in paired battles (mirrored entries/exits across opponents),
device/payment fingerprinting for duplicate identities, and league-integrity review queues.
Suspected battles move to `MANUALLY_REVIEWED`/`DISPUTED` rather than silently standing.

**Delayed and missing events.** Battles score provisionally while a window is open; a
reconciliation pass after the window pulls `getHistoricalExecutions` for the full range and replays
the ledger (cheap, because the ledger is pure and replayable). A participant whose feed goes silent
mid-battle keeps a `completionRatio` below 1 — which the rating engine already accepts and which
shrinks rating movement — and results affected by provider outages can be voided rather than scored.

**Provider corrections.** Providers occasionally amend fills (busted trades, price adjustments).
Corrections arrive as new events referencing the original `providerEventId`; the ledger replays with
the corrected sequence, and if the outcome of a settled battle changes materially, the result enters
`DISPUTED` for review instead of silently flipping. The original and corrected payloads both remain
in the audit trail.

**Disputed results.** A dispute freezes rating effects for that battle (`DISPUTED`), a reviewer works
from stored evidence — raw payloads, both timestamps, the deterministic ledger replay, and the score
breakdown's factor details — and resolution moves the battle to `MANUALLY_REVIEWED` with an
adjustment, or voids it. Every state transition is itself logged.

**Time synchronization.** Scoring uses provider-attested `occurredAt` ordering per account, while
`receivedAt` measures delivery lag. Production monitors per-provider clock skew against NTP-disciplined
server time, tolerates known-small skew, and flags accounts whose event timestamps drift beyond
tolerance — important because discipline rules (e.g. the revenge-sizing window) are time-based.

**Audit logs.** Beyond the per-event trail that already exists, production appends immutable records
for: connection lifecycle (link/unlink, token refresh), every pipeline decision
(accepted/duplicate/rejected with reasons), scoring config versions per battle (the `ScoringConfig`
is already a serializable value, so the exact weights a battle was scored under can be stored with
it), rating changes with their full breakdown (already returned by `calculateRatingChange`), and all
review/dispute actions.

See [architecture.md](architecture.md) for where each mechanism sits in the pipeline and
[integration-roadmap.md](integration-roadmap.md) for when each verification level becomes reachable.
