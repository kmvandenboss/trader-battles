# Product Brief: Trader Battles

## Product Overview

Build a responsive web application called **Trader Battles**, a competitive trading platform where traders are matched in daily one-on-one battles and compete based on their actual trading performance.

This first version is a functional product demo. It will not connect to NinjaTrader, Tradovate, Rithmic, TradingView, brokerages, or prop firms yet. All accounts, trades, market activity, match results, and performance data will be simulated with realistic dummy data.

However, the application must be architected so simulated trade data can later be replaced by live execution data from third-party integrations without rebuilding the scoring, matchmaking, battle, leaderboard, or user-interface systems.

The product should feel like a competitive gaming platform built for futures traders, not like a traditional trading journal.

The core concept is:

> Get matched. Trade your account. Beat your opponent.

---

# Primary Demo Goal

The demo should make it immediately clear how the product works and why traders would return daily.

A viewer should be able to:

1. Enter the platform as a demo user.
2. See their competitive rank and recent performance.
3. Join a matchmaking queue.
4. Get paired with another trader.
5. Watch a simulated live battle progress.
6. See both traders’ scores update as trades occur.
7. View the final battle result.
8. Review how the winner was determined.
9. Browse rankings, leagues, profiles, and match history.

The product should be polished enough to show to the owner and leadership team of a prop firm as an early product concept.

---

# Product Positioning

Trader Battles is a neutral third-party competitive layer for active traders.

Eventually, traders could connect accounts from multiple prop firms, brokerages, and execution platforms. They would compete across firms without transferring control of their trading accounts to Trader Battles.

Trader Battles would observe verified execution activity, normalize performance, score the battle, and maintain each trader’s competitive record.

The platform should not be branded as an MFFU product in this demo. It should look capable of serving the broader futures trading industry.

---

# Core Product Principles

## 1. Competition, not gambling

Users are not wagering money against each other.

The initial model assumes:

* No entry fees
* No head-to-head cash wagers
* No pooled prize money
* No payout based solely on one short match
* Rewards may eventually be funded by sponsors, subscriptions, or partner firms

Avoid casino language such as bets, wagers, jackpots, odds, or cash games.

## 2. Performance should be normalized

The winner cannot simply be whoever makes the most dollars.

A trader using more contracts or taking excessive risk should not automatically defeat a more disciplined trader.

The battle score should account for:

* Net performance
* Maximum drawdown
* Risk taken
* Rule compliance
* Position sizing
* Consistency
* Overtrading
* Whether performance came from one oversized trade
* Whether the trader exceeded the battle’s risk limits

## 3. The product should feel alive

The demo should simulate live events:

* Traders entering and exiting positions
* Realized and unrealized P&L changes
* Battle score changes
* Lead changes
* Risk warnings
* Match commentary
* Final result animations

## 4. The architecture must support future integrations

Simulated trades should pass through the same internal ingestion and scoring flow that future NinjaTrader, Tradovate, Rithmic, CQG, ProjectX, or brokerage data would use.

Do not embed scoring logic directly into the dummy-data generator or UI components.

---

# Suggested Technology Stack

Use a modern Vercel-compatible stack.

Preferred:

* Next.js with App Router
* TypeScript
* React
* Tailwind CSS
* shadcn/ui or similarly clean component primitives
* PostgreSQL-compatible schema using Prisma or Drizzle
* For the demo, the database may use seeded local data or a Vercel-compatible hosted database
* Server actions or API routes for application logic
* Recharts or another lightweight chart library for performance visualization

The project will be stored in Git and deployed to Vercel.

Prioritize:

* Clear folder structure
* Reusable components
* Strong TypeScript types
* Seed scripts
* Mock data services
* Easy local setup
* Easy Vercel deployment
* No unnecessary infrastructure

Do not require paid external services for the first demo.

---

# Visual Direction

The interface should resemble a modern competitive gaming platform combined with a professional trading application.

It should feel:

* Competitive
* Serious
* Fast
* Premium
* Data-driven
* Credible to active futures traders

Avoid:

* Cartoonish gaming graphics
* Casino visuals
* Neon overload
* Meme-stock aesthetics
* Excessive confetti
* Generic crypto styling
* Dense institutional-terminal complexity

Use a dark interface by default with strong contrast, restrained accent colors, clean typography, and clear status indicators.

The layout should work well on desktop and mobile, although desktop is the primary presentation format.

---

# Demo User

Create a pre-authenticated demo account so the application can be opened without registration.

Demo trader:

* Display name: KevinV
* Current league: Gold II
* Rating: 1,684
* Season record: 18 wins and 11 losses
* Current streak: 3 wins
* Primary market: NQ
* Secondary market: ES
* Prop firm: MFFU
* Battle style: Balanced
* Discipline score: 84
* Risk score: 79
* Performance score: 76

The user should have realistic historical battles, ratings, statistics, badges, and performance trends.

---

# Main Navigation

Include the following primary navigation:

* Home
* Battle
* Leaderboards
* Match History
* Trader Profile
* Leagues
* How Scoring Works

A future Integrations page may also be included, clearly marked as coming soon.

---

# Home Dashboard

The dashboard should immediately communicate the user’s competitive status.

Include:

## Competitive overview

* Current rating
* League and division
* Season record
* Current streak
* Global percentile
* Rank among MFFU traders
* Rank among NQ traders

## Main call to action

A prominent button:

**Find a Battle**

Also show:

* Next recommended battle window
* Selected market
* Selected account
* Expected opponent rating range

## Recent battle

Show the latest result with:

* Opponent
* Win or loss
* Final score
* Rating change
* Net P&L
* Maximum drawdown
* Discipline score
* Link to full battle review

## Performance insights

Include concise insight cards such as:

* “You are 7–2 in morning NQ battles.”
* “Your average drawdown is 18% lower than traders at your rating.”
* “You lose most often after taking more than five trades.”
* “Your rating has increased 96 points this season.”

## Active platform activity

Include a feed of simulated events:

* Major upsets
* Win streaks
* Promotions to higher leagues
* High-ranked traders entering battles
* Firm-versus-firm results

---

# Matchmaking Experience

Create a matchmaking screen where the user can configure and join a battle.

## Battle configuration

Allow selection of:

### Market

* NQ
* MNQ
* ES
* MES
* CL
* GC

The demo should default to NQ.

### Battle window

* Opening Bell: 9:30–11:00 a.m. ET
* Midday: 11:00 a.m.–1:00 p.m. ET
* Afternoon: 1:00–3:30 p.m. ET
* Full Session: 9:30 a.m.–4:00 p.m. ET

### Battle type

For the initial demo, include:

* Live Performance
* Replay Challenge
* Discipline Battle

Live Performance should be the default.

Replay Challenge may be presented as an additional mode, not the main concept.

### Account

Show a simulated connected account:

* MFFU 50K Rapid
* Status: Connected
* Current account balance
* Daily drawdown remaining
* Maximum contract size

## Matchmaking sequence

After joining:

1. Show a searching state.
2. Display an estimated rating range.
3. Cycle through short matchmaking status messages.
4. Match the user with a realistic opponent after several seconds.
5. Show an opponent reveal.
6. Display a short head-to-head comparison.
7. Begin the simulated battle.

Example opponent:

* Display name: DeltaHunter
* League: Gold I
* Rating: 1,712
* Record: 21–13
* Primary market: NQ
* Style: Aggressive
* Prop firm: Tradeify

---

# Live Battle Screen

This is the centerpiece of the demo.

The live battle screen should show both traders competing during the same simulated market window.

## Battle header

Include:

* Battle type
* Market
* Time remaining
* Battle status
* Battle ID
* Rating stakes or estimated rating movement
* Connected-account verification indicators

Do not describe rating movement as financial stakes.

## Head-to-head score

Display both traders prominently.

For each trader, show:

* Avatar or initials
* Display name
* Prop firm
* Current battle score
* Net P&L
* Maximum drawdown
* Number of trades
* Current position
* Discipline status
* Risk utilization

Make the current leader obvious without making the screen feel like a casino.

## Simulated price chart

Include a simple NQ intraday chart with generated price movement.

Overlay each trader’s:

* Entries
* Exits
* Long and short positions
* Winning trades
* Losing trades

The chart does not need to be a full trading terminal.

## Event timeline

Generate events throughout the match, such as:

* KevinV entered long 1 NQ
* DeltaHunter entered short 2 NQ
* KevinV closed for +$320
* DeltaHunter’s drawdown increased to $610
* KevinV took the lead
* DeltaHunter received an overtrading penalty
* KevinV earned a discipline bonus
* Five minutes remaining

## Match commentary

Include automated commentary that interprets the match:

* “KevinV has taken the lead with lower drawdown.”
* “DeltaHunter has generated more gross profit but is using substantially more risk.”
* “KevinV’s score improved after closing a profitable trade without increasing size.”
* “The battle remains close. A major drawdown could decide the result.”

## Controls

Since this is dummy data, include demo controls that allow the presenter to:

* Start battle
* Pause simulation
* Advance event
* Speed up simulation
* Reset battle
* Finish battle immediately

These controls may be hidden inside a “Demo Controls” panel so the primary interface still feels like a real product.

---

# Battle Scoring System

Create a transparent but adjustable scoring engine.

Use a score from 0 to 100.

Suggested initial components:

* Performance: 40%
* Risk efficiency: 25%
* Discipline: 20%
* Consistency: 15%

## Performance component

Consider:

* Net P&L
* Return relative to permitted risk
* Profit factor
* Percentage of gross gains retained

## Risk-efficiency component

Consider:

* Maximum drawdown
* Average risk per trade
* Net return divided by drawdown
* Contract usage relative to limits

## Discipline component

Consider:

* Staying within battle rules
* Avoiding excessive contract size
* Avoiding rapid size increases after losses
* Avoiding overtrading
* Avoiding daily-loss violations

## Consistency component

Consider:

* Whether gains came from multiple trades
* Dependence on one oversized winner
* Stability throughout the battle
* Percentage of the battle spent in severe drawdown

## Example score calculation

KevinV:

* Performance: 78
* Risk efficiency: 91
* Discipline: 88
* Consistency: 80
* Final score: 83.9

DeltaHunter:

* Performance: 86
* Risk efficiency: 63
* Discipline: 66
* Consistency: 71
* Final score: 73.6

KevinV wins despite earning slightly less gross profit because the performance was achieved with substantially less risk and better discipline.

Implement the scoring engine as an isolated server-side module with configurable weights.

For example:

`lib/scoring/calculateBattleScore.ts`

The UI should receive calculated scoring results. It should not calculate authoritative scores itself.

---

# Battle Completion

When the battle finishes, show a polished result state.

Include:

* Winner
* Final score
* Rating change
* Updated league progress
* Final P&L comparison
* Drawdown comparison
* Discipline comparison
* Trade count
* Biggest winning trade
* Biggest losing trade

Include a clear explanation:

## Why you won

Example:

* You used 34% less drawdown.
* You maintained consistent position sizing.
* Your opponent received an overtrading penalty.
* You retained 82% of your peak unrealized gains.

Or:

## Why you lost

* Your result depended heavily on one oversized trade.
* You exceeded your normal position size after a loss.
* Your opponent produced a similar return with lower drawdown.

Include actions:

* View full battle analysis
* Challenge another trader
* Share result
* View opponent profile
* Return to dashboard

---

# Battle Review

Create a detailed post-match analysis screen.

Include:

* Score breakdown
* P&L over time
* Drawdown over time
* Trade-by-trade table
* Position-size timeline
* Battle-event timeline
* Comparison with opponent
* AI-style coaching summary using prewritten dummy insights

Example coaching output:

> You won this match because you protected your gains and maintained consistent size. Your opponent generated a higher peak profit but surrendered much of it during a late-session drawdown. Your largest opportunity for improvement is reducing trades after your fourth completed position.

This should feel useful even outside the competitive experience.

---

# Leaderboards

Create multiple leaderboard views.

Filters:

* Global
* Friends
* Prop firm
* Market
* League
* Daily
* Weekly
* Season

Leaderboard columns:

* Rank
* Trader
* Rating
* League
* Record
* Win rate
* Current streak
* Primary market
* Prop firm
* Discipline score

Include realistic seeded traders from several fictional or real-seeming prop-firm categories.

Do not use insulting or unserious trader names.

---

# League System

Use a ranked structure similar to competitive games.

Suggested leagues:

* Bronze
* Silver
* Gold
* Platinum
* Diamond
* Elite

Each league may have divisions:

* III
* II
* I

Display:

* Current rating
* Current division
* Rating required for promotion
* Season-high rating
* Promotion progress
* Risk of demotion

Use an Elo-style or similar rating system.

The initial implementation can use a simplified formula, but isolate it in a dedicated rating module.

For example:

`lib/ratings/calculateRatingChange.ts`

Rating change may account for:

* Expected outcome based on both ratings
* Win or loss
* Margin of victory
* Match completion
* Rule violations

Avoid allowing raw P&L to dominate rating movement.

---

# Trader Profiles

Each trader should have a public competitive profile.

Include:

* Display name
* Avatar
* Prop firm
* Primary markets
* Current league
* Rating
* Season record
* Lifetime record
* Win rate
* Current streak
* Best streak
* Discipline score
* Risk score
* Performance score
* Battle style
* Recent matches
* Rating history
* Badges
* Favorite battle window

Suggested battle-style labels:

* Balanced
* Aggressive
* Defensive
* Momentum
* Selective
* High Frequency

These should be generated from performance behavior rather than manually selected in the eventual product.

---

# Firm Profiles

Include lightweight prop-firm team pages to demonstrate the broader network concept.

Example firms:

* MFFU
* Tradeify
* Apex
* Topstep
* Independent
* Brokerage Accounts

Each firm page should show:

* Active traders
* Average rating
* Weekly record
* Top-ranked traders
* Most-traded markets
* Firm-versus-firm results
* Current team standing

Do not imply these companies are official partners. Clearly use demo data.

---

# Match History

Provide a searchable and filterable list of previous battles.

Filters:

* Win or loss
* Market
* Battle type
* Date range
* Opponent
* Prop firm

Each result should include:

* Date
* Opponent
* Market
* Final score
* P&L
* Maximum drawdown
* Rating change
* Result
* Link to battle review

---

# Badges and Achievements

Include a modest achievement system.

Examples:

* First Victory
* Five-Win Streak
* Risk Manager
* Opening Bell Specialist
* NQ Contender
* Comeback Win
* Clean Battle
* Giant Slayer
* Ten Battles Completed
* Gold League Reached

Avoid making achievements too cartoonish.

Badges should reinforce:

* Participation
* Discipline
* Improvement
* Competitive success
* Market specialization

---

# Notifications

Simulate notifications such as:

* Match found
* Opponent entered the queue
* Battle begins in five minutes
* Battle result available
* Rating increased
* League promotion
* Rival passed you on the leaderboard
* New challenge available

A basic notification dropdown is sufficient.

---

# Data Architecture

The demo must use a clean domain model that supports future live integrations.

Suggested entities:

## User

* id
* displayName
* email
* avatarUrl
* createdAt

## TraderProfile

* userId
* rating
* league
* division
* primaryMarket
* secondaryMarkets
* battleStyle
* disciplineScore
* riskScore
* performanceScore
* seasonWins
* seasonLosses
* lifetimeWins
* lifetimeLosses

## TradingAccount

* id
* userId
* provider
* externalAccountId
* accountType
* propFirm
* startingBalance
* currentBalance
* status
* connectionStatus
* maximumContracts
* dailyLossLimit
* metadata

## IntegrationConnection

* id
* userId
* provider
* connectionType
* status
* externalUserId
* accessMetadata
* connectedAt
* lastSyncedAt

Do not store actual secrets or future access tokens in the demo seed data.

## Battle

* id
* battleType
* market
* status
* scheduledStart
* actualStart
* endTime
* battleWindow
* scoringConfigurationId
* winnerId
* createdAt

## BattleParticipant

* id
* battleId
* userId
* tradingAccountId
* startingRating
* endingRating
* finalScore
* result
* verificationStatus

## ExecutionEvent

This is the most important future-facing model.

* id
* providerEventId
* sourceProvider
* tradingAccountId
* battleId
* userId
* instrument
* side
* quantity
* price
* commission
* occurredAt
* receivedAt
* eventType
* verificationStatus
* rawPayload

Suggested event types:

* ORDER_SUBMITTED
* ORDER_ACCEPTED
* ORDER_CANCELLED
* ORDER_REJECTED
* PARTIAL_FILL
* FILL
* POSITION_OPENED
* POSITION_REDUCED
* POSITION_CLOSED
* ACCOUNT_SNAPSHOT

## AccountSnapshot

* id
* tradingAccountId
* battleId
* balance
* equity
* realizedPnl
* unrealizedPnl
* openPosition
* drawdown
* timestamp
* sourceProvider

## BattleMetricSnapshot

* id
* battleId
* participantId
* netPnl
* maximumDrawdown
* tradeCount
* riskUtilization
* disciplineScore
* consistencyScore
* performanceScore
* totalBattleScore
* timestamp

## RatingHistory

* id
* userId
* battleId
* previousRating
* newRating
* change
* createdAt

## Achievement

* id
* name
* description
* category
* icon

## UserAchievement

* userId
* achievementId
* earnedAt

---

# Integration Adapter Architecture

Create a provider-adapter interface even though only a mock provider will exist initially.

Suggested structure:

```text
lib/
  integrations/
    types.ts
    providers/
      mock/
        mockProvider.ts
        mockEventGenerator.ts
      ninjatrader/
        README.md
      tradovate/
        README.md
      rithmic/
        README.md
```

Define a normalized adapter interface such as:

```ts
interface TradingIntegrationProvider {
  providerName: string;
  connectAccount(input: ConnectAccountInput): Promise<ConnectedAccount>;
  disconnectAccount(accountId: string): Promise<void>;
  getAccountSnapshot(accountId: string): Promise<NormalizedAccountSnapshot>;
  getHistoricalExecutions(
    accountId: string,
    range: DateRange
  ): Promise<NormalizedExecutionEvent[]>;
  subscribeToExecutions?(
    accountId: string,
    callback: (event: NormalizedExecutionEvent) => void
  ): Promise<UnsubscribeFunction>;
}
```

The mock provider should implement this same interface.

All dummy battle activity should originate from the mock provider and be converted into normalized execution events before entering the scoring engine.

The battle engine should not know whether an event came from:

* Mock data
* NinjaTrader add-on
* Tradovate API
* Rithmic
* CQG
* ProjectX
* Another provider

---

# Event Ingestion Pipeline

Structure the application around this flow:

```text
External provider or mock provider
        ↓
Provider-specific adapter
        ↓
Normalized execution event
        ↓
Validation and deduplication
        ↓
Account and position-state update
        ↓
Battle metric calculation
        ↓
Battle-score calculation
        ↓
Database snapshot
        ↓
Live UI update
```

Create a service boundary for each major step.

Suggested modules:

```text
lib/
  battles/
    battleEngine.ts
    matchmaking.ts
    battleRules.ts

  scoring/
    calculateBattleScore.ts
    calculatePerformanceScore.ts
    calculateRiskScore.ts
    calculateDisciplineScore.ts
    calculateConsistencyScore.ts

  ratings/
    calculateRatingChange.ts

  executions/
    normalizeExecution.ts
    processExecutionEvent.ts
    deduplicateExecution.ts
    positionLedger.ts
```

---

# Mock Simulation Requirements

Create realistic deterministic battle simulations.

The simulation should:

* Generate market-price movement
* Generate orders and fills for both traders
* Open and close positions
* Produce winners and losers
* Include partial setbacks and lead changes
* Calculate realized and unrealized P&L
* Track maximum drawdown
* Apply scoring changes
* Generate event commentary
* End with a valid final score

Use seeded randomness so the same demo scenario can be replayed consistently.

Create at least three battle scenarios:

## Scenario 1: Discipline beats raw profit

The opponent earns more gross profit but uses much more drawdown and loses on normalized score.

## Scenario 2: Comeback victory

The demo user falls behind early, reduces risk, recovers, and wins late.

## Scenario 3: Aggression backfires

The demo user increases size after losses, violates discipline rules, and loses despite briefly holding the P&L lead.

Allow the presenter to choose a scenario from Demo Controls.

---

# Live Updates

For the demo, live updates may be handled through:

* Timed client-side simulation
* Server-sent events
* Polling
* A simple real-time abstraction

Choose the simplest Vercel-compatible option that creates a convincing experience.

Keep the real-time system modular so it can later be replaced with a production event stream.

---

# Matchmaking Logic

Build a simple but extensible matchmaking service.

Initial factors:

* Rating
* Selected market
* Selected battle window
* Battle type
* Account type
* Maximum risk parameters

The demo should search within an initial rating range and expand that range gradually.

Example:

* First 10 seconds: within 50 rating points
* Next 10 seconds: within 100 points
* Then: within 175 points

The actual wait can be shortened for the demonstration.

Add clear notes in the code showing where future matchmaking factors may be added:

* Recent performance
* Experience level
* Prop-firm rules
* Account size
* Geographic restrictions
* Rivalry history
* Suspected smurf accounts
* Match-completion reliability

---

# Verification States

Every account, execution, and battle should support verification status.

Suggested values:

* SIMULATED
* SELF_REPORTED
* CLIENT_VERIFIED
* PROVIDER_VERIFIED
* MANUALLY_REVIEWED
* DISPUTED

All demo activity should show as **Simulated Demo Data** or **Demo Verified**, not as genuinely provider-verified trading.

This distinction will become important when live integrations are added.

---

# Integrations Page

Create a future integrations page showing:

## Available in demo

* Simulated Account

## Planned

* NinjaTrader Desktop
* Tradovate
* Rithmic
* CQG
* ProjectX
* Brokerage integrations

For each planned integration, show:

* Status
* Intended connection method
* Data expected
* Verification level

Do not imply partnerships or confirmed API access.

Suggested descriptions:

### NinjaTrader Desktop

Planned desktop add-on that streams executions, account snapshots, order events, and position changes to Trader Battles.

### Tradovate

Planned direct account authorization and server-side execution-history integration.

### Rithmic

Planned provider-level connection subject to commercial access and technical approval.

### TradingView

Do not list TradingView as a primary execution-data integration. It may eventually be supported as a charting or alert layer, but not as an authoritative source for manual trade executions.

---

# Demo Disclosures

Include a subtle but visible notice:

> This product is an interactive concept demo. All traders, accounts, trades, performance figures, integrations, and battle results shown are simulated.

Do not use financial-performance disclaimers excessively throughout the interface. One global demo notice and contextual labels are sufficient.

---

# Security and Integrity Considerations

The demo does not need production-grade implementation, but the structure should acknowledge:

* Server-side authoritative scoring
* Event deduplication
* Signed provider events
* Replay-attack prevention
* Account-ownership verification
* Match manipulation
* Collusion
* Multiple-account abuse
* Delayed or missing execution events
* Corrections from providers
* Disputed results
* Time synchronization
* Audit logs

Add a document at:

`docs/integrity-and-verification.md`

Summarize how these issues would be addressed in a production version.

---

# Required Documentation

Include:

## README.md

Cover:

* Product summary
* Technology stack
* Local setup
* Environment variables
* Database setup
* Seed process
* Development commands
* Vercel deployment
* Demo credentials or automatic demo access
* Known limitations

## docs/architecture.md

Cover:

* Domain model
* Event-ingestion flow
* Mock-provider architecture
* Scoring architecture
* Rating system
* Future integration strategy
* Real-time update strategy

## docs/integration-roadmap.md

Describe the future phases:

### Phase 1: NinjaTrader desktop add-on

* Read executions, positions, and account snapshots
* Authenticate the user and account
* Send signed normalized events
* Support live battle scoring
* Provide CSV fallback

### Phase 2: Direct Tradovate integration

* User authorization
* Historical executions
* Account snapshots
* Live event stream where supported
* Provider-level verification

### Phase 3: Additional providers

* Rithmic
* CQG
* ProjectX
* Other broker or prop-firm systems

### Phase 4: Partner infrastructure

* Firm dashboards
* Sponsored leagues
* Private communities
* Webhooks
* Enterprise APIs
* Fraud and abuse monitoring

## docs/scoring.md

Clearly explain:

* Scoring components
* Weighting
* Penalties
* Example calculations
* Limitations
* How weights can be changed
* How scoring avoids rewarding reckless risk

---

# Seed Data

Seed enough data to make the platform feel established.

Include:

* At least 40 traders
* At least 5 firms or account affiliations
* At least 150 completed battles
* Several active streaks
* Traders across all leagues
* Multiple markets
* Rating histories
* Achievements
* Notifications
* Firm standings
* Realistic match-history records

Keep all seeded data deterministic.

---

# MVP Acceptance Criteria

The demo is complete when:

1. It can be cloned from Git and run locally using documented commands.
2. It can be deployed to Vercel.
3. A viewer can enter without completing registration.
4. The home dashboard displays a convincing competitive-trading ecosystem.
5. The viewer can enter matchmaking and receive an opponent.
6. A complete simulated battle can run from start to finish.
7. Scores change based on normalized execution events.
8. The battle result explains why one trader won.
9. Leaderboards, profiles, leagues, and match history contain realistic seeded data.
10. The mock provider implements the same normalized interface intended for future live providers.
11. Scoring and rating logic are isolated from UI components.
12. All simulated data is clearly labeled.
13. The repository includes architecture, scoring, integration, and integrity documentation.
14. The application contains no claims that users will become profitable or earn money by using it.

---

# Development Priorities

Prioritize in this order:

1. Live battle experience
2. Matchmaking flow
3. Scoring engine
4. Home dashboard
5. Battle result and review
6. Leaderboards
7. Trader profiles
8. Data architecture
9. Seed data
10. Documentation
11. Secondary polish

Do not overbuild authentication, payments, subscriptions, partner dashboards, or real integrations in this version.

The goal is to demonstrate the product loop and prove that live head-to-head trading competition feels compelling.

---

# Final Product Test

When the demo is shown to someone unfamiliar with the concept, they should understand within one minute:

* What Trader Battles is
* How a trader enters a match
* How two traders compete
* Why raw profit alone does not determine the winner
* Why someone would return each day
* How the product could eventually work across multiple prop firms and brokerages
