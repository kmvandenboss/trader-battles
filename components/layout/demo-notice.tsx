/**
 * Global demo disclosure. This is the single persistent "simulated data"
 * notice for the whole app — individual screens add contextual
 * "Simulated Demo Data" labels only where it matters, not on every element.
 */
export function DemoNotice() {
  return (
    <div
      role="note"
      className="border-b border-border bg-secondary/60 px-4 py-1.5 text-center text-xs text-muted-foreground"
    >
      Interactive concept demo — all traders, trades, and results are
      simulated.
    </div>
  );
}
