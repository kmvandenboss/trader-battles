/**
 * /firms/[slug] — a demo firm/affiliation profile. Server component reading
 * already-derived FirmStandings + firm-vs-firm records through the repositories.
 * Firms are DEMO entities only; the page states plainly that no real
 * partnership is implied. Nothing is computed in the UI.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getRepositories } from "@/lib/data/repositories";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import { StatPill } from "@/components/battle/stat-pill";
import {
  FIRM_KIND_LABELS,
  formatRecord,
  marketName,
} from "@/components/battle/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const standings = await getRepositories().firms.getBySlug(slug);
  return {
    title: standings ? `${standings.firm.name} · Firm` : "Firm",
    description:
      "Demo firm profile — active traders, average rating, weekly record, and cross-firm results. Simulated demo data; no real partnership implied.",
  };
}

export default async function FirmProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { firms } = getRepositories();
  const standings = await firms.getBySlug(slug);
  if (!standings) notFound();

  const vsFirm = await firms.getFirmVsFirm(slug);
  const { firm } = standings;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/40 text-muted-foreground"
          >
            <Building2 className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {firm.name}
              </h1>
              <Badge variant="outline" className="text-muted-foreground">
                {FIRM_KIND_LABELS[firm.kind]}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                Simulated Demo Data
              </Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {firm.description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Demo firm — no real partnership, endorsement, or affiliation is
            implied. Names are used illustratively to show the cross-firm
            competition concept.
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill
            label="Active traders"
            value={String(standings.activeTraders)}
          />
          <StatPill
            label="Avg rating"
            value={standings.averageRating.toLocaleString("en-US")}
          />
          <StatPill
            label="Weekly record"
            value={formatRecord(standings.weeklyWins, standings.weeklyLosses)}
          />
          <StatPill
            label="Top markets"
            value={
              standings.mostTradedMarkets.map((m) => m.market).join(" · ") ||
              "—"
            }
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top traders */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Top traders</h2>
          {standings.topTraders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No traders yet.</p>
          ) : (
            <ul className="space-y-2">
              {standings.topTraders.map((t, i) => (
                <li key={t.user.id}>
                  <Link
                    href={`/profile/${t.user.id}`}
                    className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 transition-colors hover:bg-secondary/40"
                  >
                    <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <TraderAvatar
                      displayName={t.user.displayName}
                      accent={t.user.isDemoUser ? "demo" : "opponent"}
                      size="sm"
                    />
                    <span className="flex-1 truncate text-sm font-medium">
                      {t.user.displayName}
                    </span>
                    <LeagueBadge
                      league={t.profile.league}
                      division={t.profile.division}
                    />
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {t.profile.rating.toLocaleString("en-US")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Most traded markets + firm vs firm */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Most-contested markets</h2>
            {standings.mostTradedMarkets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No battles yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {standings.mostTradedMarkets.map((m) => (
                  <li
                    key={m.market}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {marketName(m.market)}
                      <span className="ml-1.5 font-medium text-foreground">
                        {m.market}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {m.battles} battle{m.battles === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Firm vs firm</h2>
            {vsFirm.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cross-firm battles recorded.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {vsFirm.map((row) => (
                  <li
                    key={row.opponentFirm.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <Link
                      href={`/firms/${row.opponentFirm.slug}`}
                      className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      vs {row.opponentFirm.name}
                    </Link>
                    <span className="tabular-nums">
                      <span className="text-positive">{row.wins}W</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-negative">{row.losses}L</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
