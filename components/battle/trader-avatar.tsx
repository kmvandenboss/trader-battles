import { cn } from "@/lib/utils";
import { initialsFor } from "./format";

/** Per-trader accent used consistently across scorecards, charts, and feed. */
export type TraderAccent = "demo" | "opponent";

/** Chart/series color per trader (amber = demo user, blue = opponent). */
export const TRADER_COLORS: Record<TraderAccent, string> = {
  demo: "var(--chart-1)",
  opponent: "var(--chart-2)",
};

const ACCENT_CLASSES: Record<TraderAccent, string> = {
  demo: "border-primary/40 bg-primary/15 text-primary",
  opponent: "border-[var(--chart-2)]/40 bg-[var(--chart-2)]/15 text-[var(--chart-2)]",
};

const SIZE_CLASSES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
} as const;

interface TraderAvatarProps {
  displayName: string;
  accent: TraderAccent;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

/** Initials avatar with the trader's series color. Reused across screens. */
export function TraderAvatar({
  displayName,
  accent,
  size = "md",
  className,
}: TraderAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-semibold",
        ACCENT_CLASSES[accent],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initialsFor(displayName)}
    </span>
  );
}
