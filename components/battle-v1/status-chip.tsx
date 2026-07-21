/**
 * BattleStatusChip — compact lifecycle chip for v1 scheduled battles
 * (Scheduled / Settling / Settled / Cancelled). Pure presentation of a
 * repo-provided status.
 */

import type { BattleStatus } from "@/lib/data/schema";
import { cn } from "@/lib/utils";
import { BATTLE_STATUS_LABELS } from "./labels";

const STATUS_CLASSES: Record<BattleStatus, string> = {
  SCHEDULED: "border-sky-300/30 bg-sky-300/10 text-sky-300",
  MATCHMAKING: "border-border bg-secondary/40 text-muted-foreground",
  LIVE: "border-primary/40 bg-primary/10 text-primary",
  SETTLING: "border-amber-300/30 bg-amber-300/10 text-amber-300",
  COMPLETED: "border-positive/30 bg-positive/10 text-positive",
  CANCELLED: "border-border bg-secondary/40 text-muted-foreground",
};

export function BattleStatusChip({
  status,
  className,
}: {
  status: BattleStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-sm border px-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase",
        STATUS_CLASSES[status],
        className,
      )}
    >
      {BATTLE_STATUS_LABELS[status]}
    </span>
  );
}
