"use client";

/**
 * AnimatedNumber — eases a displayed number toward its target value.
 *
 * Pure presentation: the target always comes from engine output; this only
 * interpolates what is painted between updates. tabular-nums prevents jitter.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  /** Decimal places to render. */
  decimals?: number;
  /** Ease duration in ms. */
  durationMs?: number;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 1,
  durationMs = 400,
  className,
}: AnimatedNumberProps) {
  const [displayed, setDisplayed] = useState(value);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (value - from) * eased;
      setDisplayed(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return (
    <span className={cn("tabular-nums", className)}>
      {displayed.toFixed(decimals)}
    </span>
  );
}
