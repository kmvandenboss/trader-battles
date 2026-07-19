/**
 * Mock provider contract tests: the demo provider honors the same
 * TradingIntegrationProvider interface a real integration will implement.
 */

import { describe, expect, it } from "vitest";

import { mockProvider, setMockActiveScenario } from "@/lib/integrations/providers/mock/mockProvider";
import { generateBattleScript } from "@/lib/integrations/providers/mock/mockEventGenerator";
import type { NormalizedExecutionEvent } from "@/lib/integrations/types";

const KEVIN_ACCOUNT = "MFFU-50K-84127";

describe("mockProvider (TradingIntegrationProvider)", () => {
  it("connects and disconnects known demo accounts as SIMULATED", async () => {
    const account = await mockProvider.connectAccount({
      userId: "user-kevinv",
      externalAccountId: KEVIN_ACCOUNT,
    });
    expect(account.provider).toBe("mock");
    expect(account.status).toBe("CONNECTED");
    expect(account.verificationStatus).toBe("SIMULATED");
    expect(account.displayName).toBe("MFFU 50K Rapid");
    await mockProvider.disconnectAccount(account.accountId);
  });

  it("rejects unknown accounts", async () => {
    await expect(
      mockProvider.connectAccount({
        userId: "user-kevinv",
        externalAccountId: "NOT-A-DEMO-ACCOUNT",
      }),
    ).rejects.toThrow(/unknown demo account/);
  });

  it("serves normalized, SIMULATED execution history for a scenario", async () => {
    setMockActiveScenario("discipline-beats-raw-profit");
    const script = generateBattleScript("discipline-beats-raw-profit");
    const events = await mockProvider.getHistoricalExecutions(KEVIN_ACCOUNT, {
      start: new Date(script.startTimestampMs).toISOString(),
      end: new Date(script.startTimestampMs + script.durationMs).toISOString(),
    });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.sourceProvider).toBe("mock");
      expect(event.instrument).toBe("NQ");
      expect(event.verificationStatus).toBe("SIMULATED");
      expect(event.accountId).toBe(KEVIN_ACCOUNT);
    }
    // 5 KevinV round trips -> 10 orders + 10 fills, duplicates excluded.
    expect(events.filter((e) => e.eventType === "FILL")).toHaveLength(10);
  });

  it("produces an end-of-session account snapshot from the ledger", async () => {
    setMockActiveScenario("discipline-beats-raw-profit");
    const snapshot = await mockProvider.getAccountSnapshot(KEVIN_ACCOUNT);
    expect(snapshot.sourceProvider).toBe("mock");
    expect(snapshot.verificationStatus).toBe("SIMULATED");
    expect(snapshot.openPosition).toBe(0); // scenario ends flat
    expect(snapshot.balance).toBeCloseTo(50_000 + snapshot.realizedPnl, 2);
    expect(snapshot.realizedPnl).toBeGreaterThan(0);
  });

  it("streams executions through subscribeToExecutions until unsubscribed", async () => {
    setMockActiveScenario("discipline-beats-raw-profit");
    const received: NormalizedExecutionEvent[] = [];
    const unsubscribe = await mockProvider.subscribeToExecutions!(
      KEVIN_ACCOUNT,
      (event) => received.push(event),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received.length).toBeGreaterThan(0);
    const countAtUnsubscribe = received.length;
    unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received.length).toBe(countAtUnsubscribe);
  });
});
