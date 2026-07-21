/**
 * Global data-source disclosure. This is the single persistent notice for the
 * whole app. Since v1 the platform carries TWO kinds of data, so the one
 * shared string labels both honestly (Rule 1): seeded demo content is
 * simulated; CSV-imported battles are real but self-reported — never claimed
 * as simulated and never as broker-verified. Individual screens add
 * contextual labels only where it matters, not on every element.
 */
export function DemoNotice() {
  return (
    <div
      role="note"
      className="border-b border-border bg-secondary/60 px-4 py-1.5 text-center text-xs text-muted-foreground"
    >
      Seeded demo traders and battles are simulated; imported battles are
      self-reported (CSV) and not broker-verified.
    </div>
  );
}
