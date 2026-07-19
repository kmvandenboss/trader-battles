/**
 * Demo firm / affiliation catalog.
 *
 * These are demo entities only. Firm names are used illustratively to show
 * the cross-firm network concept — no partnership, endorsement, or real data
 * is implied (isDemoData is always true and the UI must label firm pages as
 * simulated).
 *
 * Standings (active traders, avg rating, weekly record, firm-vs-firm) are
 * derived from traders + battles by FirmRepository, not stored here.
 */

import type { Firm } from "../schema/types";

export const FIRMS: Firm[] = [
  {
    id: "firm-mffu",
    slug: "mffu",
    name: "MFFU",
    kind: "PROP_FIRM",
    description:
      "Demo prop-firm affiliation. Traders competing on simulated MFFU evaluation and funded accounts.",
    isDemoData: true,
  },
  {
    id: "firm-tradeify",
    slug: "tradeify",
    name: "Tradeify",
    kind: "PROP_FIRM",
    description:
      "Demo prop-firm affiliation. Traders competing on simulated Tradeify accounts.",
    isDemoData: true,
  },
  {
    id: "firm-apex",
    slug: "apex",
    name: "Apex",
    kind: "PROP_FIRM",
    description:
      "Demo prop-firm affiliation. Traders competing on simulated Apex accounts.",
    isDemoData: true,
  },
  {
    id: "firm-topstep",
    slug: "topstep",
    name: "Topstep",
    kind: "PROP_FIRM",
    description:
      "Demo prop-firm affiliation. Traders competing on simulated Topstep accounts.",
    isDemoData: true,
  },
  {
    id: "firm-independent",
    slug: "independent",
    name: "Independent",
    kind: "AFFILIATION",
    description:
      "Traders competing on simulated self-funded futures accounts without a prop-firm affiliation.",
    isDemoData: true,
  },
  {
    id: "firm-brokerage",
    slug: "brokerage",
    name: "Brokerage Accounts",
    kind: "AFFILIATION",
    description:
      "Traders competing on simulated retail brokerage futures accounts.",
    isDemoData: true,
  },
];

export function firmIdForSlug(slug: string): string {
  const firm = FIRMS.find((f) => f.slug === slug);
  if (!firm) throw new Error(`Unknown firm slug: ${slug}`);
  return firm.id;
}
