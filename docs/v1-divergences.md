# V1 divergences from the demo

> Running list of where the real MFFU v1 diverges from the current simulated demo. The demo remains a
> valid architecture reference; this doc records the deltas we've decided (or flagged) in planning.
> Status legend: **[decided]** we've agreed · **[proposed]** leaning this way, not locked ·
> **[open]** unresolved question that shapes a decision · **[deferred]** intentionally not in v1.
>
> Implementation plan for the next build session: [handoffs/NEXT-SESSION.md](handoffs/NEXT-SESSION.md).

## Product scope

- **[decided] MFFU-only.** The demo references four firms (MFFU, Tradeify, Apex, Topstep). V1 ships as
  a single-firm product, built into the existing MFFU system — not a standalone multi-firm platform.
- **[decided] Real trade data, eventually from the existing MFFU pipeline.** Every trade a user makes on
  their MFFU account is already in MFFU's database. V1's first real ingestion path is **CSV import**
  (below); a direct pull from the MFFU pipeline comes later. The mock provider stays as the demo/test
  data source behind the same interface.
- **[decided] V1 is settle-after-the-fact (async), not live.** Because we're deferring the data-latency
  question and scoring from imported CSVs, a battle is scored **after** its window closes, not streamed
  live. The demo's live BattleClock head-to-head screen stays a showcase; real-time battles are a later
  phase that depends on near-real-time data.

## Scoring

- **[decided] Straight realized-PnL scoring for v1**, replacing the demo's 4-factor normalized model
  (performance / risk / discipline / consistency). The 4-factor engine is **retained as a selectable
  config mode** for a later version — not deleted. Simpler to build and explain.
- **[decided] Match by account size.** Keeps straight PnL fair despite contract-limit differences. Most
  traders are on 50k accounts, so the primary bracket is well-populated. Demo matched on rating + market.
- **[decided] Scoring starts at battle start.** Only trades opened after the window opens count. No
  earlier-in-the-day trades pulled in. This kills the green-day/red-day selection exploit.
- **[decided] Realized PnL only, with a buzzer mark-out for open positions.** If a trader still holds a
  position when the window closes, we simulate closing it at the buzzer rather than forcing an early exit.
  - **[proposed] For the future live version:** mark against a short VWAP/TWAP over the final 30–60s and
    freeze new entries in the final minute, to defeat last-tick manipulation and hail-mary open positions.
  - **[decided] For v1 (async/CSV):** the live mark-out mechanics don't apply yet. Score realized
    round-trips entered AND exited inside the window; positions still open at window close (including
    in-window entries that exit after the buzzer) are marked out using **separately imported 1-minute
    OHLCV bars** (`market_bars` via `MarketDataRepository.getMarkPrice`, close of the last bar ending
    at/before the buzzer, 5-minute freshness cutoff) — absent usable bars, the position is excluded and
    noted. Full live mark-out is deferred with the real-time-data phase.
  - **[decided] Battle P&L may differ from account P&L** (mark-out is hypothetical). Label clearly in UI.
- **[decided] Capped participation bonus + tiebreaker cascade** — encourages activity without requiring
  it, and eliminates the need for a minimum-activity rule. This is the chosen answer to "straight PnL
  rewards not trading / produces tied no-trade battles."
  - **Score** = mark-out realized PnL in dollars, where **$1 = 1 point**, plus a participation bonus.
  - **Participation bonus** = **+5 points per closed round-trip trade, capped at +15** (first 3 trades).
    All values live in scoring config. Keep the cap **below a typical single trade's PnL** so the bonus
    only swings near-ties, never a decisive battle — patience still wins, only the total no-show loses.
  - **Tiebreaker cascade** (resolve residual exact-ties without touching the headline number):
    realized PnL → higher profit factor → more winning trades → took ≥1 trade → earliest to go green
    (first realized-profit timestamp).
  - **[open] Micro-scalp farming** of the bonus is contained by the low cap; revisit only if abused.

## Battle formats

- **[decided] Direct challenges, same window, scheduled ahead.** In addition to matchmaking, a trader can
  challenge a specific opponent to a named **future** window (timeframe + session, e.g. "Asia tonight" or
  "NY open tomorrow"). Opponent accepts; both trade that same window; scored on each PnL in it. "Trade
  whenever" means *schedule* whenever — same window for both, never different windows.
- **[decided] Instrument choice is open to the trader for v1.** A battle does not pin one product; each
  trader trades what they want in the window. Same-window controls for time/regime; cross-product tick-
  value variance is an accepted v1 tradeoff. Can pin an instrument per battle later if it proves unfair.
- **[decided] Launch with limited timeframes and contract limits.** Add multiple windows / sessions
  (Asia, London, NY) after v1.

## Deferred (intentionally not in v1)

- **[deferred] Prizes / cash / season-ending tournament.** Not building now. Because standings are
  points-based, prizes are easy to layer on later if we choose. **Before** any prizes ship: legal/
  compliance review (contest/sweepstakes law, 1099s) and collusion + multi-accounting controls.
- **[deferred] Live / real-time head-to-head battles.** Depends on near-real-time trade + price data.
- **[deferred] Seasons, London/NY sessions, multiple concurrent windows.** (The **Asia** window
  20:00–24:00 ET now exists as a selectable battle window — live in challenges, disabled/"coming
  soon" in matchmaking, added 2026-07-21. See the next-day-UTC caveat in
  [`future-work.md`](future-work.md) before wiring evening windows into the mock engine or seed.)
- **[deferred] The 4-factor normalized scoring model** — retained as config, re-enabled later.
- **[deferred] Direct MFFU-pipeline ingestion** — CSV import first, direct pull later.

## Open questions (not blocking v1)

- **[open] Data latency (real-time vs batch).** Only matters when we go live; deferred by choosing
  async/CSV for v1. Resolve before the real-time-battle phase.
- **[open] Collusion & multi-accounting controls.** Not urgent while nothing is at stake (no prizes,
  unranked-friendly). Must be in place before prizes or meaningful ranked rewards.
- **[open] Self-supplied mark-out bars.** In v1 the OHLCV bars used for buzzer mark-outs are imported
  by users (participant-gated), not fetched from a market-data feed — a mark price is only as honest as
  the bars file. Contained while nothing is at stake; replace with a platform-side market-data source
  before prizes/ranked rewards.
- **[open] Overlapping scheduled battles.** Ratings settle off each battle's accept-time
  `startingRating`, and settlement writes the rating absolutely — two overlapping windows settle off
  stale ratings and the later settlement overwrites the earlier movement. Acceptable at v1 volume;
  revisit (sequential settlement or rating-delta application) before concurrent windows are common.
- **[open] Verification labeling for imported trades.** CSV-imported trades are **not** `SIMULATED`
  ("Demo Verified") and **not** provider-verified either — treat as `SELF_REPORTED` / `CLIENT_VERIFIED`
  and label honestly. Confirm the exact status + UI copy during implementation.

## Unchanged from the demo (still valid)

- The one-directional data flow and module boundaries (provider/adapter → normalized event → pipeline →
  battle metrics → score → snapshot → UI). CSV import plugs in as another source behind this same flow.
- Server-side, isolated scoring (UI never computes authoritative scores).
- The repository interface as the swappable data-access seam (in-memory demo → real Postgres).
- Deterministic, seeded simulation for demos/tests.
