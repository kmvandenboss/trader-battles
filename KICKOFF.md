# KICKOFF — how to run Trader Battles with Claude Code

This is your start-here guide. You don't need to write code — you'll mostly paste the prompts below and
let Claude Code do the work. Read the short "How the pieces fit" section, then follow the steps in order.

---

## What's in this kit

- **`CLAUDE.md`** — a briefing Claude Code reads automatically at the start of every session. It holds the
  rules, the locked tech choices, the folder layout, and the build order so Claude Code stays consistent
  and doesn't drift or re-decide things halfway through.
- **`.claude/agents/`** — six **subagents**. Think of these as specialist assistants. When a task matches
  one's description, Claude Code hands it off to that specialist, who works in its own clean workspace and
  reports back. This keeps each part focused and stops the main session from getting cluttered. The six:
  - `scoring-engine` — the win/loss math (scores and ratings).
  - `simulation-engine` — the fake trade data, the battle engine, matchmaking.
  - `frontend-ui` — all the screens and styling.
  - `data-seed` — the database shape and the ~40 traders / 150 battles of demo data.
  - `docs-writer` — the README and docs.
  - `qa-reviewer` — a read-only checker that grades the app against your acceptance criteria.
- **`docs/`** — where your product brief and generated docs live.

You do not edit these files by hand. Claude Code reads and uses them.

---

## One-time setup (about 10 minutes)

1. **Install Node.js** if you don't have it — get the LTS version from https://nodejs.org (18 or newer).
   To check if it's already installed, open a terminal and run `node -v`.

2. **Install Claude Code:**
   ```
   npm install -g @anthropic-ai/claude-code
   ```
   (Install/troubleshooting docs: https://docs.claude.com/en/docs/claude-code/overview)

3. **Make your project folder and open it in VS Code.** Create an empty folder, e.g. `trader-battles`,
   and open it in VS Code (File → Open Folder).

4. **Drop this kit into that folder.** Copy `CLAUDE.md`, the `.claude` folder, and the `docs` folder from
   this kit into the root of your `trader-battles` folder. When you're done the folder should contain:
   ```
   trader-battles/
     CLAUDE.md
     KICKOFF.md
     .claude/agents/   (six .md files)
     docs/
   ```

5. **Save your product brief** as `docs/PRODUCT_BRIEF.md` (paste in the full brief you wrote). Several of
   the files reference it, so this step matters — do it before you start.

6. **Start Claude Code.** In VS Code, open the integrated terminal (View → Terminal), make sure you're in
   the `trader-battles` folder, and run:
   ```
   claude
   ```
   The subagents load when Claude Code starts. If you ever edit an agent file, restart `claude` to reload
   it. You can pick the model you want (e.g. Fable) from Claude Code's model selector.

Tip: you can confirm the agents loaded by typing `/agents` inside Claude Code.

---

## How to drive it

Paste the prompts below one phase at a time. After each phase, run the QA check, look at the result, and
only then move on. Don't paste all phases at once — you want to see each step land.

To watch progress you'll usually run `npm run dev` in a **second** terminal tab and open the local URL it
prints (usually http://localhost:3000).

---

### Phase 0 — Scaffold the app

```
Read CLAUDE.md and docs/PRODUCT_BRIEF.md in full. Then scaffold the Next.js App Router + TypeScript
project exactly as CLAUDE.md specifies: Tailwind + shadcn/ui, dark theme by default, the folder structure
under lib/, a global "Simulated Demo Data" notice, and the primary navigation (Home, Battle,
Leaderboards, Match History, Trader Profile, Leagues, How Scoring Works, plus a "coming soon"
Integrations link). Set up the npm scripts (dev, seed, build, lint, test). Get it running so `npm run dev`
shows a styled empty shell. Don't build features yet.
```

### Phase 1 — Data model + seed data

```
Using the data-seed agent, build the Drizzle schema for every entity in the brief's Data Architecture
section, plus the repository interface the app reads through, plus deterministic seed data: at least 40
traders across all leagues, 5+ firms, 150+ completed battles, ratings histories, streaks, badges,
notifications, and firm standings. Include the demo user KevinV and opponent DeltaHunter exactly as
CLAUDE.md specifies. Wire up `npm run seed`. Keep everything deterministic and marked SIMULATED.
```

### Phase 2 — Scoring + rating engines

```
Using the scoring-engine agent, build lib/scoring/* and lib/ratings/* as pure, configurable, unit-tested
functions per CLAUDE.md and the brief's Battle Scoring System. Add tests that reproduce the worked
examples (KevinV 83.9 beats DeltaHunter 73.6) and prove discipline beats raw profit. Run the tests.
```

### Phase 3 — Mock provider, pipeline, battle engine

```
Using the simulation-engine agent, build the TradingIntegrationProvider interface, the mock provider, the
normalized execution pipeline (normalize → dedupe → position ledger → process), the battle engine, and
matchmaking. Implement the three deterministic scenarios (discipline beats raw profit, comeback victory,
aggression backfires). Import scoring/ratings from the existing engines — don't reimplement them. Make one
scenario runnable end-to-end from a script and show me the resulting timeline and final scores.
```

### Phase 4 — The Live Battle screen (centerpiece)

```
Using the frontend-ui agent, build the Live Battle screen from the brief: battle header, head-to-head
scorecards for both traders, a simple Recharts intraday chart with entry/exit overlays, the live event
feed, auto-commentary, and a tucked-away Demo Controls panel (start, pause, advance event, speed up,
reset, finish now, pick scenario). Drive it with the client-side tick loop that calls the real pipeline
and scoring functions. No gambling language; keep the demo label visible.
```

### Phase 5 — Matchmaking flow

```
Using the frontend-ui and simulation-engine agents, build the matchmaking screen: battle configuration
(market default NQ, battle window, battle type default Live Performance, the simulated MFFU 50K Rapid
account), the searching state with a widening rating range and status messages, the opponent reveal, the
head-to-head comparison, then hand off into the live battle.
```

### Phase 6 — Dashboard, result, and review

```
Build the Home dashboard (competitive overview, "Find a Battle" CTA, recent battle card, performance
insight cards, activity feed), the Battle Completion result screen (winner, score, rating change, "why
you won / why you lost" explanation, actions), and the Battle Review screen (score breakdown, P&L and
drawdown over time, trade-by-trade table, event timeline, prewritten coaching summary).
```

### Phase 7 — Leaderboards, profiles, leagues, match history

```
Build the Leaderboards (with the filters and columns from the brief), Trader Profiles, lightweight Firm
Profiles, the League system (Bronze→Elite with divisions, promotion/demotion progress), Match History
(searchable/filterable), the badges/achievements display, and the notifications dropdown — all from the
seeded data.
```

### Phase 8 — Docs, then a full QA pass

```
Using the docs-writer agent, write README.md and docs/architecture.md, docs/scoring.md,
docs/integration-roadmap.md, and docs/integrity-and-verification.md based on what the code actually does.
Then run the qa-reviewer agent against the full MVP acceptance criteria and give me a prioritized list of
anything to fix.
```

---

## Handy things to know

- **Point Claude Code at a specific specialist** by mentioning it, e.g. `@scoring-engine` or "use the
  frontend-ui agent to…". Most of the time it'll pick the right one on its own from the descriptions.
- **After each phase**, a quick `use the qa-reviewer agent to check what we just built` keeps quality up.
- **If something looks off**, tell Claude Code plainly what you see on screen — it can inspect and fix.
- **Deploying to Vercel** comes at the end; the README the docs-writer produces will walk you through it.
  The demo is built to deploy with no database and no paid services.
- **Deterministic** means the same scenario plays out identically every time — good for rehearsing the
  presentation.
