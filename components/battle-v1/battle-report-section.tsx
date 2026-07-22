/**
 * BattleReportSection — the detailed report for a SETTLED PNL_V1 (CSV-import)
 * battle, rendered below the aggregate SettledPnlResult on /battles/[id].
 *
 * Server component (Rule 4): it renders an already-assembled V1BattleReport
 * (built server-side in report.ts from persisted telemetry). It computes
 * nothing. The interactive replay is delegated to the client BattleReplay
 * component, which receives only serializable arrays.
 *
 * FRAMING (Rules 2 & 3): PNL_V1 decides the battle; the 4-factor scores are
 * shown FOR INSIGHT ONLY. No gambling language, no profitability claims.
 */

import { PairLineChart } from "@/components/battle-review/pair-line-chart";
import { TradeTable } from "@/components/battle-review/trade-table";
import { EventTimeline } from "@/components/battle-review/event-timeline";
import { ComponentBreakdown } from "@/components/battle/component-breakdown";
import { VerificationChip } from "./verification-chip";
import { BattleReplay } from "./battle-replay";
import type { V1BattleReport } from "./report";

export function BattleReportSection({ report }: { report: V1BattleReport }) {
  const { meta, self, opponent } = report;
  const demoName = self.displayName;
  const opponentName = opponent.displayName;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Battle report</h2>
          <VerificationChip status={meta.verificationStatus} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            PNL_V1 (realized P&amp;L + a capped participation bonus) decides this
            battle.
          </span>{" "}
          The 4-factor scores (performance, risk efficiency, discipline,
          consistency) are shown for insight only and do not affect the result.
          Drawdown and mark-to-market P&amp;L are reconstructed at 1-minute mark
          granularity — round-trip CSVs do not expose intra-trade excursions, so
          these curves reflect bar-close marks, not tick-level extremes.
        </p>
      </div>

      <BattleReplay
        startTimestampMs={meta.startTimestampMs}
        durationMin={meta.durationMin}
        winnerName={meta.winnerName}
        self={self}
        opponent={opponent}
        scoreSeries={report.scoreSeries}
        pnlSeries={report.pnlSeries}
        timeline={report.timeline}
      />

      <PairLineChart
        title="Running score progression"
        subtitle="PNL_V1 outcome score (dollars-points) — converges to the final score at the buzzer"
        data={report.scoreSeries}
        demoName={demoName}
        opponentName={opponentName}
        startTimestampMs={meta.startTimestampMs}
        durationMin={meta.durationMin}
        valueKind="points"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PairLineChart
          title="Mark-to-market P&L"
          subtitle="Equity (realized + unrealized) at each 1-minute mark"
          data={report.pnlSeries}
          demoName={demoName}
          opponentName={opponentName}
          startTimestampMs={meta.startTimestampMs}
          durationMin={meta.durationMin}
          valueKind="pnl"
        />
        <PairLineChart
          title="Drawdown"
          subtitle="Instantaneous drawdown at each 1-minute mark"
          data={report.drawdownSeries}
          demoName={demoName}
          opponentName={opponentName}
          startTimestampMs={meta.startTimestampMs}
          durationMin={meta.durationMin}
          valueKind="drawdown"
        />
      </div>

      <ComponentBreakdown
        edges={report.componentEdges}
        demoName={demoName}
        opponentName={opponentName}
        weightsNote="4-factor model (Performance 40% · Risk 25% · Discipline 20% · Consistency 15%) — shown for insight only; it does not decide the battle."
      />

      {report.fourFactorSeries.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {report.fourFactorSeries.map((series) => (
            <PairLineChart
              key={series.key}
              title={`${series.label} over time`}
              subtitle="4-factor insight (0–100) — does not decide the battle"
              data={series.data}
              demoName={demoName}
              opponentName={opponentName}
              startTimestampMs={meta.startTimestampMs}
              durationMin={meta.durationMin}
              valueKind="score"
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <TradeTable
          rows={report.tradeRows}
          demoName={demoName}
          opponentName={opponentName}
        />
        <EventTimeline rows={report.timeline} />
      </div>
    </section>
  );
}
