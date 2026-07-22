# Future work — engineering backlog

> Running list of engineering items to address later: known gotchas, deferred hardening, and
> "this will bite us eventually" notes that don't belong in the code itself. **Append here whenever
> you take a deliberate shortcut or discover a latent constraint.** Keep entries dated and concrete
> (what breaks, when it matters, how to fix).
>
> Scope note: this is the *engineering* backlog. Product-level v1 scope decisions and open product
> questions live in [`v1-divergences.md`](v1-divergences.md) (its "Open questions" + "Deferred"
> sections) — see the cross-reference at the bottom. Live code gotchas a fresh session must know
> before touching a subsystem also stay summarized in
> [`handoffs/STATE.md`](handoffs/STATE.md) → "Known state / gotchas".

## Open items

### Battle-window UTC start/end strings can't express a next-day roll (evening windows)

- **Added:** 2026-07-21, when the **Asia** battle window (20:00–24:00 ET) was introduced.
- **What:** Two records store window times as *time-of-day strings* applied to the session date:
  `BATTLE_WINDOW_START_UTC` in [`lib/battles/battleRules.ts`](../lib/battles/battleRules.ts) and
  `WINDOW_TIMES_UTC` in [`lib/data/seed/constants.ts`](../lib/data/seed/constants.ts). They assume a
  window's UTC instant lands on the **same calendar day** as the ET session date. That holds for the
  four daytime windows, but **Asia starts at 20:00 ET, which is 00:00 UTC the _following_ day** (EDT)
  or 01:00 UTC next day (EST). A bare `"HH:MM:SS"` string can't carry the `+1`-day shift, so those two
  records hold Asia's clock time on the wrong calendar day.
- **Why it's not a bug today:** the **authoritative** ET→UTC converter,
  `windowBoundsUtc()` in [`lib/battles/battleWindows.ts`](../lib/battles/battleWindows.ts), computes
  the day-roll correctly (verified across DST: 20:00 EDT → next-day 00:00Z, 20:00 EST → next-day
  01:00Z). That's the function the **challenge → settlement** path actually uses. The two string
  records are only consumed by the **demo/mock live-battle engine** and the **seed generator**, and
  **neither ever produces an Asia battle** (matchmaking shows Asia disabled/"coming soon";
  `pickWindow` in `buildDataset.ts` hard-codes only the four daytime windows). So the wrong strings
  are currently dead data, present only for `Record<BattleWindow, …>` type completeness. They carry
  inline caveat comments pointing here.
- **When it bites:** the moment Asia (or any evening/overnight window) is wired into the mock live
  engine or the seed generator — e.g. enabling Asia in matchmaking, or seeding Asia battles. At that
  point the mock engine would schedule the Asia session on the wrong UTC day.
- **Fix options (pick when needed):**
  1. Make the mock engine + seed derive window bounds from `windowBoundsUtc()` (session date +
     window) instead of concatenating a session date with a time-of-day string — collapses the two
     string records into the one DST-aware source and removes the whole class of drift.
  2. Or change the two records to carry a `{ time, dayOffset }` shape and honor `dayOffset` at every
     consumption site.
  - Option 1 is preferred — it also retires the long-standing duplication where the same window
    ranges are hand-maintained in ~5 places (enum comments, labels, ET-minutes, durations, and these
    two UTC-string records).

## Cross-references

- **Product-scope open questions** (data latency, collusion controls, self-supplied mark-out bars,
  overlapping-battle rating staleness, imported-trade verification labeling) →
  [`v1-divergences.md`](v1-divergences.md) "Open questions (not blocking v1)". Those are tracked
  there, not duplicated here.
- **Live code gotchas** (Turbopack prod server-minifier bug, worked-example arithmetic, etc.) →
  [`handoffs/STATE.md`](handoffs/STATE.md) "Known state / gotchas".
