import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

// Phase 0 smoke test. Real suites (scoring, ratings, ledger) arrive with
// their engines in later phases.
describe("scaffold", () => {
  it("merges class names via cn()", () => {
    expect(cn("px-2", "text-sm")).toBe("px-2 text-sm");
  });
});
