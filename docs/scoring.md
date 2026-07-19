# Scoring

How a Trader Battles battle score is computed, exactly as implemented in `lib/scoring/`, and how the
Elo-style rating change is computed in `lib/ratings/calculateRatingChange.ts`. All figures in this
document come from simulated demo data; scores measure competitive execution quality, not returns, and
nothing here implies users will make money.

The whole point of the model: **a disciplined trader with less drawdown can beat someone who made more
gross dollars with reckless risk.** Raw P&L only enters through the performance component, where it is
normalized against permitted risk and capped.

## The battle score (0–100)

`calculateBattleScore(input, config?)` combines four component scores with configurable weights:

| Component | Default weight | Module |
|---|---|---|
| Performance | 40% | `calculatePerformanceScore.ts` |
| Risk efficiency | 25% | `calculateRiskScore.ts` |
| Discipline | 20% | `calculateDisciplineScore.ts` |
| Consistency | 15% | `calculateConsistencyScore.ts` |

Weights **auto-normalize by their sum** — `{40, 25, 20, 15}` and `{0.4, 0.25, 0.2, 0.15}` behave
identically. Components are clamped to 0–100 before weighting; the total is rounded to two decimals.

The input is a `BattleMetricsInput` (net P&L, gross profit/loss, peak/lowest equity, max drawdown,
max open contracts, completed trades, battle duration, time in severe drawdown, and the battle's risk
limits: permitted risk, daily loss limit, max contracts). It is produced **only** by the position
ledger (`lib/executions/positionLedger.ts` → `toBattleMetrics()`); UI components never compute any of
this.

## Changing the weights

Every weight, threshold, and penalty lives in one place: `DEFAULT_SCORING_CONFIG` in
`lib/scoring/config.ts`. Nothing in the component math hard-codes a number. Per-call overrides are
section-level via `calculateBattleScore(input, { weights: {...} })` — an operator can retune the
model, or run alternate configs per battle type (e.g. a future Discipline Battle weighting discipline
more heavily), without touching any math.

## Components

Each factor-based component returns `{ score, factors[] }`, where every factor carries its weight,
sub-score, and a human-readable detail string — the review UI renders these verbatim rather than
re-deriving anything. When an input is undefined (e.g. no trades yet), factors fall back to a neutral
50 rather than rewarding or punishing missing data.

### Performance (40%)

Measures what a trader made **relative to what they were allowed to risk** — never raw dollars in
isolation:

- **Return vs permitted risk** (50% of component): net P&L / permitted risk, mapped linearly so $0 →
  50 points and ±100% of the risk budget → 100/0. The ratio is **capped at ±1**, so a monster P&L
  cannot run the score away.
- **Profit factor** (30%): gross profit / gross loss. 1.0 → 50 points; the configured full-credit
  factor (default 3.0) → 100. No losing trades with positive gross profit → 100.
- **Gains retained** (20%): net P&L as a share of peak equity — "you retained 82% of your peak
  unrealized gains." Finishing negative after never holding gains scores 0.

### Risk efficiency (25%)

The component that lets a smaller, cleaner P&L beat a bigger reckless one:

- **Drawdown vs risk budget** (35%): max drawdown as a fraction of permitted risk; less is better,
  linearly (0% usage → 100, 100% → 0).
- **Return over drawdown** (30%): net P&L per dollar of max drawdown; ratio 0 → 50, the full-credit
  ratio (default 2×) → 100, −2× → 0. Positive return with literally zero drawdown → 100.
- **Average risk per trade** (20%): mean |trade P&L| against a per-trade guideline (default 50% of
  permitted risk). A proxy for per-trade risk until live stop data exists.
- **Contract usage vs limit** (15%): peak open contracts vs the account limit. At or below the
  comfortable utilization (default 50%) → 100; up to 60 points fall away linearly between there and
  100% of the limit.

### Discipline (20%)

Starts at 100 and deducts explicit, explainable penalties. Each violation is returned as a structured
record (`type`, `label`, `penalty`, `detail`) so the UI can render penalty events and "why you
won/lost" bullets without re-deriving anything.

| Violation | Trigger (defaults) | Penalty (defaults) |
|---|---|---|
| `CONTRACT_LIMIT_EXCEEDED` | Held more contracts than the battle allows | −30 flat |
| `EXCESSIVE_CONTRACT_SIZE` | Trades sized above 80% of the contract limit (while within it) | −5 per trade, capped at −15 |
| `REVENGE_SIZING` | Size-up of ≥1.5× within 5 minutes of a losing exit | −12 per occurrence, capped at −24 |
| `OVERTRADING` | Trade count beyond the battle's budget: max(6, ceil(hours × 6)) | −3 per excess trade, capped at −25 |
| `DAILY_LOSS_VIOLATION` | Equity fell to or beyond the daily loss limit | −40 flat |

### Consistency (15%)

Rewards steady, repeatable results over one lucky oversized winner:

- **Gain distribution** (30%): the largest win's share of gross profit. At or below 40% concentration
  → 100; 100% concentration (one trade made all the money) → 0.
- **Gains from multiple trades** (25%): winning-trade count, full credit at 3.
- **Result stability** (20%): standard deviation of trade P&L against a guideline (default 35% of
  permitted risk).
- **Time in severe drawdown** (25%): share of the battle spent below the severe-drawdown threshold
  (drawdown > 50% of permitted risk, tracked by the ledger); hits 0 at 50% of the battle.

## Worked example: KevinV vs DeltaHunter

The product brief's example, codified as a shared fixture in `lib/scoring/workedExample.ts`:

| Component | KevinV | DeltaHunter |
|---|---|---|
| Performance | 78 | 86 |
| Risk efficiency | 91 | 63 |
| Discipline | 88 | 66 |
| Consistency | 80 | 71 |

Honest arithmetic under the strict default 40/25/20/15 weights:

```
KevinV      : 78·0.40 + 91·0.25 + 88·0.20 + 80·0.15 = 83.55
DeltaHunter : 86·0.40 + 63·0.25 + 66·0.20 + 71·0.15 = 74.00
```

> **Caveat — the brief's published finals are approximations.** The brief lists 83.9 and 73.6; the
> exact weighted sums are **83.55** and **74.00**. The engine always does the honest arithmetic
> (`expectedFinal` in `workedExample.ts`). The seeded showcase battle stores the published figures
> verbatim, and the seed validator allows a ±1.0 tolerance that covers both. Every battle computed
> from Phase 3 onward uses the honest values.

The point holds either way: **KevinV wins by roughly ten points despite earning less gross profit**,
because DeltaHunter's edge in the performance component (+8 points × 0.40 = +3.2) is overwhelmed by
KevinV's advantages in risk efficiency (+28 × 0.25 = +7.0), discipline (+22 × 0.20 = +4.4), and
consistency (+9 × 0.15 = +1.35). The live `discipline-beats-raw-profit` scenario reproduces the same
shape from actual simulated executions (final ≈ 83.97 vs 71.79, with DeltaHunter ahead on net P&L).

## Rating change — `lib/ratings/calculateRatingChange.ts`

An Elo-style system whose inputs **deliberately exclude raw P&L**:

```
expected = 1 / (1 + 10^((opponentRating − playerRating) / 400))
margin   = clamp01(|playerScore − opponentScore| / 25)      // battle-SCORE points, never dollars
marginMultiplier = 0.75 + (1.5 − 0.75) · margin
raw      = K · marginMultiplier · completionRatio · (actual − expected)   // K = 32
change   = round(raw · violationFactor)
```

- `actual` is 1 for a win, 0.5 for a draw, 0 for a loss.
- **Margin of victory is measured in normalized battle-score points** (full multiplier at a 25-point
  margin), so dollars cannot dominate rating movement any more than they can dominate the score.
- `completionRatio` (0–1, default 1) shrinks movement for partial matches.
- **Violation dampening applies to gains only**: each rule violation removes 15% of a rating gain,
  capped at 50% — a rule-breaking winner earns less, while a rule-breaking loser has already paid in
  battle score and margin.
- Both participants use the same K, margin multiplier, and completion factor, so with no violations
  the winner's gain equals the loser's loss (up to integer rounding).

All defaults live in `DEFAULT_RATING_CONFIG` (K = 32, Elo divisor 400, margin reference 25, multiplier
0.75–1.5, dampening 0.15/violation capped at 0.5) and are overridable per call.

## Why reckless risk doesn't pay

Layered defenses, all visible above:

1. Return-on-risk is capped at ±100% of the permitted risk budget — extra dollars beyond the budget
   buy nothing.
2. The drawdown, per-trade-risk, and contract-utilization factors directly punish how the dollars
   were made.
3. Oversizing, revenge sizing, overtrading, and loss-limit breaches take explicit discipline
   penalties.
4. One oversized winner scores poorly on gain distribution and stability.
5. Rating movement keys off score margin, not P&L, and violations dampen rating gains on top of the
   score damage.

## Limitations

- **Per-battle only.** The score evaluates a single battle window; it says nothing about long-run
  edge, and a high score is not a prediction of future results.
- **Average trade risk is a proxy** (mean |realized P&L|) — real per-trade risk needs stop/order data
  a live integration would provide.
- **Thresholds are heuristics** (e.g. profit factor 3.0 for full credit, 40% win concentration). They
  are configurable precisely because they will need tuning against real data.
- Neutral-50 fallbacks mean very low-activity battles cluster toward the middle of the range.
- Historical seed battle scores are authored demo data (internally consistent with the default
  weights) rather than engine-computed replays; only live-played scenarios and the headless runner
  exercise the full pipeline end-to-end.

See [architecture.md](architecture.md) for where scoring sits in the pipeline and
[integrity-and-verification.md](integrity-and-verification.md) for why scoring stays server-side
authoritative.
