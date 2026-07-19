"use client";

/**
 * Commentary strip — the engine's COMMENTARY feed events, surfaced as a
 * dedicated "match analysis" strip. Latest line is prominent; the previous
 * line fades behind it for context.
 */

import { Radio } from "lucide-react";
import type { BattleFeedEvent } from "@/lib/battles/battleEngine";
import { formatSessionTime } from "./format";

interface CommentaryStripProps {
  /** COMMENTARY events only, oldest first. */
  commentary: BattleFeedEvent[];
}

export function CommentaryStrip({ commentary }: CommentaryStripProps) {
  const latest = commentary[commentary.length - 1] ?? null;
  const previous = commentary[commentary.length - 2] ?? null;

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Radio className="size-3.5 text-primary" aria-hidden />
        <h3 className="text-xs font-semibold tracking-wide uppercase">
          Battle commentary
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Auto-generated
        </span>
      </div>
      {latest ? (
        <div className="mt-2 space-y-1.5">
          <p key={latest.id} className="text-sm leading-snug">
            {latest.message}
            <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
              {formatSessionTime(latest.timestampMs)}
            </span>
          </p>
          {previous ? (
            <p className="truncate text-xs text-muted-foreground">
              {previous.message}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Commentary will interpret the battle as it develops.
        </p>
      )}
    </section>
  );
}
