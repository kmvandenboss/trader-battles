import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Crown,
  Flag,
  LogIn,
  LogOut,
  MinusCircle,
  PlusCircle,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  BattleFeedEvent,
  BattleFeedEventType,
} from "@/lib/battles/battleEngine";
import { formatSessionTime } from "./format";

const EVENT_META: Record<
  BattleFeedEventType,
  { icon: LucideIcon; iconClassName: string; rowClassName?: string }
> = {
  BATTLE_START: { icon: Flag, iconClassName: "text-primary" },
  ENTRY: { icon: LogIn, iconClassName: "text-foreground" },
  SCALE_IN: { icon: PlusCircle, iconClassName: "text-foreground" },
  SCALE_OUT: { icon: MinusCircle, iconClassName: "text-foreground" },
  EXIT: { icon: LogOut, iconClassName: "text-foreground" },
  LEAD_CHANGE: {
    icon: Crown,
    iconClassName: "text-primary",
    rowClassName: "border-primary/40 bg-primary/10",
  },
  DRAWDOWN_ALERT: {
    icon: TrendingDown,
    iconClassName: "text-negative",
    rowClassName: "border-negative/30 bg-negative/5",
  },
  DISCIPLINE_PENALTY: {
    icon: TriangleAlert,
    iconClassName: "text-negative",
    rowClassName: "border-negative/40 bg-negative/10",
  },
  TIME_REMAINING: { icon: Clock3, iconClassName: "text-muted-foreground" },
  COMMENTARY: { icon: Clock3, iconClassName: "text-muted-foreground" },
  BATTLE_END: {
    icon: Flag,
    iconClassName: "text-primary",
    rowClassName: "border-primary/40 bg-primary/10",
  },
};

/** Exit rows get a P&L-direction icon when the engine attached realizedPnl. */
function iconFor(event: BattleFeedEvent): {
  Icon: LucideIcon;
  className: string;
} {
  if (event.type === "EXIT" && typeof event.data.realizedPnl === "number") {
    return event.data.realizedPnl >= 0
      ? { Icon: ArrowUpRight, className: "text-positive" }
      : { Icon: ArrowDownRight, className: "text-negative" };
  }
  const meta = EVENT_META[event.type];
  return { Icon: meta.icon, className: meta.iconClassName };
}

interface EventRowProps {
  event: BattleFeedEvent;
}

/** One battle-feed entry. Penalties are flagged, lead changes emphasized. */
export function EventRow({ event }: EventRowProps) {
  const meta = EVENT_META[event.type];
  const { Icon, className } = iconFor(event);
  const emphasized =
    event.type === "LEAD_CHANGE" ||
    event.type === "BATTLE_END" ||
    event.type === "DISCIPLINE_PENALTY";

  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs",
        meta.rowClassName,
      )}
    >
      <Icon className={cn("mt-px size-3.5 shrink-0", className)} aria-hidden />
      <p
        className={cn(
          "min-w-0 flex-1",
          emphasized ? "font-medium text-foreground" : "text-foreground/90",
        )}
      >
        {event.message}
      </p>
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
        {formatSessionTime(event.timestampMs)}
      </span>
    </li>
  );
}
