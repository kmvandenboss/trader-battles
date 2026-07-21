/**
 * VerificationChip — honest data-source chip (Rule 1). Renders the
 * repo-provided verification status through the label map in labels.ts:
 * imported battles read "Self-reported (CSV import)"; seeded content keeps
 * its "Simulated Demo Data" label. Never anything else.
 */

import type { VerificationStatus } from "@/lib/data/schema";
import { cn } from "@/lib/utils";
import { VERIFICATION_LABELS } from "./labels";

export function VerificationChip({
  status,
  className,
}: {
  status: VerificationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-sm border border-border bg-secondary/40 px-1.5 text-[11px] font-medium tracking-wide whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {VERIFICATION_LABELS[status]}
    </span>
  );
}
