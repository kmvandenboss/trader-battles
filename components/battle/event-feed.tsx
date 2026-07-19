"use client";

/**
 * Live event feed — chronological battle events from the engine feed
 * (delivered incrementally by the BattleClock via getFeedSince). Auto-sticks
 * to the newest entry unless the viewer has scrolled up to read history.
 * Commentary events are surfaced separately in the CommentaryStrip.
 */

import { useEffect, useRef } from "react";
import { Activity } from "lucide-react";
import type { BattleFeedEvent } from "@/lib/battles/battleEngine";
import { EventRow } from "./event-row";

interface EventFeedProps {
  /** Accumulated feed, oldest first (COMMENTARY excluded by the caller). */
  events: BattleFeedEvent[];
  className?: string;
}

export function EventFeed({ events, className }: EventFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <section
      className={`flex min-h-0 flex-col rounded-xl border border-border bg-card ${className ?? ""}`}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Activity className="size-3.5 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">Event feed</h3>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {events.length} events
        </span>
      </header>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {events.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Battle events will appear here once the session is underway.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
