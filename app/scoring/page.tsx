/**
 * /scoring — "How Scoring Works". Static server-rendered explainer built
 * verbatim from docs/scoring.md.
 *
 * IMPORTANT: this page renders documented weight/threshold copy only. It does
 * NOT import from lib/scoring or lib/ratings and computes no authoritative
 * score (Rule 4 — the UI never derives scores). Every figure below is fixed
 * display copy that mirrors DEFAULT_SCORING_CONFIG as documented.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Gauge, Scale, ShieldCheck, Repeat, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ComponentWeightBar,
  SubFactorRow,
} from "@/components/scoring/scoring-primitives";

export const metadata: Metadata = { title: "How Scoring Works" };

const CHART = {
  performance: "var(--chart-1)",
  risk: "var(--chart-2)",
  discipline: "var(--chart-3)",
  consistency: "var(--chart-4)",
} as const;

const COMPONENTS = [
  {
    key: "performance",
    icon: TrendingUp,
    name: "Performance",
    weight: 40,
    color: CHART.performance,
    summary:
      "What a trader made relative to what they were allowed to risk — never raw dollars in isolation.",
    factors: [
      {
        label: "Return vs permitted risk",
        share: 50,
        detail:
          "Net P&L ÷ permitted risk, mapped linearly so $0 → 50 points and ±100% of the risk budget → 100 / 0. The ratio is capped at ±1, so a monster P&L cannot run the score away.",
      },
      {
        label: "Profit factor",
        share: 30,
        detail:
          "Gross profit ÷ gross loss. 1.0 → 50 points; the full-credit factor (default 3.0) → 100. No losing trades with positive gross profit → 100.",
      },
      {
        label: "Gains retained",
        share: 20,
        detail:
          "Net P&L as a share of peak equity — how much of the peak unrealized gain was kept. Finishing negative after never holding gains scores 0.",
      },
    ],
  },
  {
    key: "risk",
    icon: Scale,
    name: "Risk efficiency",
    weight: 25,
    color: CHART.risk,
    summary:
      "The component that lets a smaller, cleaner P&L beat a bigger reckless one.",
    factors: [
      {
        label: "Drawdown vs risk budget",
        share: 35,
        detail:
          "Max drawdown as a fraction of permitted risk; less is better, linearly (0% usage → 100, 100% → 0).",
      },
      {
        label: "Return over drawdown",
        share: 30,
        detail:
          "Net P&L per dollar of max drawdown; ratio 0 → 50, the full-credit ratio (default 2×) → 100, −2× → 0. Positive return with zero drawdown → 100.",
      },
      {
        label: "Average risk per trade",
        share: 20,
        detail:
          "Mean |trade P&L| against a per-trade guideline (default 50% of permitted risk) — a proxy for per-trade risk until live stop data exists.",
      },
      {
        label: "Contract usage vs limit",
        share: 15,
        detail:
          "Peak open contracts vs the account limit. At or below comfortable utilization (default 50%) → 100; up to 60 points fall away linearly between there and 100% of the limit.",
      },
    ],
  },
  {
    key: "consistency",
    icon: Repeat,
    name: "Consistency",
    weight: 15,
    color: CHART.consistency,
    summary:
      "Rewards steady, repeatable results over one lucky oversized winner.",
    factors: [
      {
        label: "Gain distribution",
        share: 30,
        detail:
          "The largest win's share of gross profit. At or below 40% concentration → 100; 100% concentration (one trade made all the money) → 0.",
      },
      {
        label: "Gains from multiple trades",
        share: 25,
        detail: "Winning-trade count, full credit at 3.",
      },
      {
        label: "Result stability",
        share: 20,
        detail:
          "Standard deviation of trade P&L against a guideline (default 35% of permitted risk).",
      },
      {
        label: "Time in severe drawdown",
        share: 25,
        detail:
          "Share of the battle spent below the severe-drawdown threshold (drawdown > 50% of permitted risk); hits 0 at 50% of the battle.",
      },
    ],
  },
] as const;

const PENALTIES = [
  {
    type: "CONTRACT_LIMIT_EXCEEDED",
    trigger: "Held more contracts than the battle allows",
    penalty: "−30 flat",
  },
  {
    type: "EXCESSIVE_CONTRACT_SIZE",
    trigger: "Trades sized above 80% of the contract limit (while within it)",
    penalty: "−5 per trade, capped at −15",
  },
  {
    type: "REVENGE_SIZING",
    trigger: "Size-up of ≥1.5× within 5 minutes of a losing exit",
    penalty: "−12 per occurrence, capped at −24",
  },
  {
    type: "OVERTRADING",
    trigger: "Trade count beyond the battle's budget: max(6, ceil(hours × 6))",
    penalty: "−3 per excess trade, capped at −25",
  },
  {
    type: "DAILY_LOSS_VIOLATION",
    trigger: "Equity fell to or beyond the daily loss limit",
    penalty: "−40 flat",
  },
] as const;

// Worked-example figures are the fixture values documented in
// docs/scoring.md / lib/scoring/workedExample.ts — rendered as copy, not computed here.
const WORKED = {
  kevin: { performance: 78, risk: 91, discipline: 88, consistency: 80, final: "83.55" },
  delta: { performance: 86, risk: 63, discipline: 66, consistency: 71, final: "74.00" },
} as const;

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon?: typeof Gauge;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon ? (
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      ) : null}
      <h2 className="text-sm font-semibold">{children}</h2>
    </div>
  );
}

export default function ScoringPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            How Scoring Works
          </h1>
          <Badge variant="outline" className="text-muted-foreground">
            Simulated Demo Data
          </Badge>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every battle is scored 0–100 on the quality of competitive execution —
          not on returns. A disciplined trader with less drawdown can beat
          someone who made more gross dollars with reckless risk. Raw P&L only
          enters through the performance component, where it is normalized
          against permitted risk and capped.
        </p>
      </header>

      {/* Weight overview */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeading icon={Gauge}>
          The battle score — four weighted components
        </SectionHeading>
        <p className="mb-4 max-w-3xl text-xs text-muted-foreground">
          The score combines four component scores using the default weights
          below. Each component is clamped to 0–100 before weighting, and
          weights auto-normalize by their sum.
        </p>
        <div className="space-y-2.5">
          <ComponentWeightBar
            label="Performance"
            weight={40}
            color={CHART.performance}
            emphasized
          />
          <ComponentWeightBar
            label="Risk efficiency"
            weight={25}
            color={CHART.risk}
            emphasized
          />
          <ComponentWeightBar
            label="Discipline"
            weight={20}
            color={CHART.discipline}
            emphasized
          />
          <ComponentWeightBar
            label="Consistency"
            weight={15}
            color={CHART.consistency}
            emphasized
          />
        </div>
        <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          Weights, thresholds, and penalties are configurable server-side (they
          live in one place, <code className="text-foreground">DEFAULT_SCORING_CONFIG</code>).
          An operator can retune the model or run alternate configs per battle
          type without touching any math.
        </p>
      </section>

      {/* Component detail cards */}
      <section className="grid gap-4 lg:grid-cols-2">
        {COMPONENTS.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex size-7 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `color-mix(in oklab, ${c.color} 18%, transparent)` }}
                  >
                    <Icon className="size-4" style={{ color: c.color }} aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold">{c.name}</h3>
                </div>
                <span
                  className="rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums"
                  style={{
                    color: c.color,
                    backgroundColor: `color-mix(in oklab, ${c.color} 14%, transparent)`,
                  }}
                >
                  {c.weight}%
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{c.summary}</p>
              <div>
                {c.factors.map((f) => (
                  <SubFactorRow
                    key={f.label}
                    label={f.label}
                    share={f.share}
                    detail={f.detail}
                    color={c.color}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Discipline card — penalty-based, full width to pair the grid */}
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-lg"
                style={{ backgroundColor: `color-mix(in oklab, ${CHART.discipline} 18%, transparent)` }}
              >
                <ShieldCheck className="size-4" style={{ color: CHART.discipline }} aria-hidden />
              </span>
              <h3 className="text-sm font-semibold">Discipline</h3>
            </div>
            <span
              className="rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums"
              style={{
                color: CHART.discipline,
                backgroundColor: `color-mix(in oklab, ${CHART.discipline} 14%, transparent)`,
              }}
            >
              20%
            </span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Starts at 100 and deducts explicit, explainable penalties. Each
            violation is a structured record, so the review UI can show penalty
            events and &ldquo;why you won / lost&rdquo; bullets without
            re-deriving anything.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Violation</th>
                  <th className="py-2 pr-3 font-medium">Trigger (defaults)</th>
                  <th className="py-2 font-medium">Penalty (defaults)</th>
                </tr>
              </thead>
              <tbody>
                {PENALTIES.map((p) => (
                  <tr
                    key={p.type}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2.5 pr-3">
                      <code className="text-[11px] text-foreground">
                        {p.type}
                      </code>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {p.trigger}
                    </td>
                    <td className="py-2.5 font-semibold tabular-nums text-foreground">
                      {p.penalty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Worked example */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeading>Worked example — KevinV vs DeltaHunter</SectionHeading>
        <p className="mb-4 max-w-3xl text-xs text-muted-foreground">
          The disciplined trader wins by roughly ten points despite earning less
          gross profit. DeltaHunter&rsquo;s edge in performance is overwhelmed by
          KevinV&rsquo;s advantages in risk efficiency, discipline, and
          consistency.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] tracking-wide text-muted-foreground uppercase">
                <th className="py-2 pr-3 font-medium">Component</th>
                <th className="py-2 pr-3 text-right font-medium">Weight</th>
                <th className="py-2 pr-3 text-right font-medium">KevinV</th>
                <th className="py-2 text-right font-medium">DeltaHunter</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(
                [
                  ["Performance", "40%", WORKED.kevin.performance, WORKED.delta.performance, CHART.performance],
                  ["Risk efficiency", "25%", WORKED.kevin.risk, WORKED.delta.risk, CHART.risk],
                  ["Discipline", "20%", WORKED.kevin.discipline, WORKED.delta.discipline, CHART.discipline],
                  ["Consistency", "15%", WORKED.kevin.consistency, WORKED.delta.consistency, CHART.consistency],
                ] as const
              ).map(([name, weight, a, b, color]) => (
                <tr key={name} className="border-b border-border/50">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {name}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-muted-foreground">
                    {weight}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium text-foreground">
                    {a}
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">{b}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 pr-3 text-sm font-semibold" colSpan={2}>
                  Weighted final
                </td>
                <td className="pt-3 pr-3 text-right text-base font-semibold text-primary tabular-nums">
                  {WORKED.kevin.final}
                </td>
                <td className="pt-3 text-right text-base font-semibold tabular-nums">
                  {WORKED.delta.final}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-lg border border-border/60 bg-secondary/20 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <p>
            KevinV&nbsp;&nbsp;&nbsp;: 78·0.40 + 91·0.25 + 88·0.20 + 80·0.15 ={" "}
            <span className="font-semibold text-primary">83.55</span>
          </p>
          <p>
            DeltaHunter: 86·0.40 + 63·0.25 + 66·0.20 + 71·0.15 ={" "}
            <span className="font-semibold text-foreground">74.00</span>
          </p>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          The engine always does this honest arithmetic. DeltaHunter finished
          ahead on net P&amp;L; KevinV still wins the battle because dollars are
          only one capped input among four.
        </p>
      </section>

      {/* Rating change */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeading icon={TrendingUp}>
          Rating change — Elo-style, not dollar-driven
        </SectionHeading>
        <p className="mb-3 max-w-3xl text-xs text-muted-foreground">
          Rating movement is a competitive result, not a financial one. Its
          inputs deliberately exclude raw P&amp;L.
        </p>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              An Elo expectation is set from the two ratings; a win, draw, or
              loss counts as 1, 0.5, or 0.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <span className="text-foreground">Margin of victory is measured in normalized battle-score points</span>,
              never dollars (full multiplier at a 25-point margin). Dollars
              cannot dominate rating movement any more than they dominate the
              score.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              A completion factor shrinks movement for partial matches.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <span className="text-foreground">Violation dampening applies to gains only</span>: each
              rule violation removes 15% of a rating gain, capped at 50% — a
              rule-breaking winner earns less, while a rule-breaking loser has
              already paid in battle score and margin.
            </span>
          </li>
        </ul>
        <p className="mt-3 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          With no violations the winner&rsquo;s gain equals the loser&rsquo;s
          loss (up to integer rounding). All defaults (K = 32, Elo divisor 400,
          25-point margin reference, 0.75–1.5 multiplier, 0.15-per-violation
          dampening capped at 0.5) are overridable per call.
        </p>
      </section>

      {/* Why reckless risk doesn't pay */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <SectionHeading icon={ShieldCheck}>
          Why reckless risk doesn&rsquo;t pay
        </SectionHeading>
        <ol className="space-y-2 text-xs text-muted-foreground">
          {[
            "Return-on-risk is capped at ±100% of the permitted risk budget — extra dollars beyond the budget buy nothing.",
            "The drawdown, per-trade-risk, and contract-utilization factors directly punish how the dollars were made.",
            "Oversizing, revenge sizing, overtrading, and loss-limit breaches take explicit discipline penalties.",
            "One oversized winner scores poorly on gain distribution and stability.",
            "Rating movement keys off score margin, not P&L, and violations dampen rating gains on top of the score damage.",
          ].map((text, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary tabular-nums">
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-primary/20 pt-3 text-[11px] text-muted-foreground">
          A high score reflects the quality of a single battle window — it is not
          a prediction of future results, and nothing here implies users will
          make money. See the{" "}
          <Link href="/integrations" className="text-primary hover:underline">
            integration roadmap
          </Link>{" "}
          for how verified live data would later replace this simulated data.
        </p>
      </section>
    </div>
  );
}
