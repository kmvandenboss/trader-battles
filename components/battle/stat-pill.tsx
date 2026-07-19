import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "positive" | "negative";

const TONE_CLASSES: Record<StatTone, string> = {
  neutral: "text-foreground",
  positive: "text-positive",
  negative: "text-negative",
};

interface StatPillProps {
  label: string;
  value: string;
  tone?: StatTone;
  className?: string;
}

/**
 * Compact label/value stat block. Values render with tabular-nums so live
 * updates never cause layout jitter. Reused across battle + result screens.
 */
export function StatPill({
  label,
  value,
  tone = "neutral",
  className,
}: StatPillProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-secondary/40 px-2.5 py-1.5",
        className,
      )}
    >
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          TONE_CLASSES[tone],
        )}
      >
        {value}
      </p>
    </div>
  );
}
