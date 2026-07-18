# Tradovate provider (stub — not implemented)

Future real integration. A production adapter here will implement the
`TradingIntegrationProvider` interface from `lib/integrations/types.ts`,
translating Tradovate fills into raw provider events for
`lib/executions/normalizeExecution.ts`. No implementation ships in the demo;
this stub exists so the plug-in point is explicit.
