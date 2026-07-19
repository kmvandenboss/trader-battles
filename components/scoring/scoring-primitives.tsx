/**
 * Static presentation primitives for the "How Scoring Works" page.
 *
 * These render documented, hardcoded weight/threshold copy from docs/scoring.md.
 * Nothing here imports from lib/scoring or computes an authoritative score —
 * every number is display copy (Rule 4). The bar widths are purely cosmetic
 * renderings of the fixed documented weights.
 */

import { cn } from "@/lib/utils";

/** A single component's headline weight, drawn as a proportional bar. */
export function ComponentWeightBar({
  label,
  weight,
  color,
  emphasized = false,
}: {
  label: string;
  weight: number;
  color: string;
  emphasized?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-xs sm:grid-cols-[10rem_1fr_2.5rem]">
      <span
        className={cn(
          "truncate font-medium",
          emphasized ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full"
          style={{ width: `${weight}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-right font-semibold tabular-nums text-foreground">
        {weight}%
      </span>
    </div>
  );
}

/** A sub-factor row inside a component card: label, its share of the component, detail. */
export function SubFactorRow({
  label,
  share,
  detail,
  color,
}: {
  label: string;
  share: number;
  detail: string;
  color: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border/60 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
      <span className="text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
        {share}% of component
      </span>
      <p className="col-span-2 pl-3.5 text-[11px] leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}
