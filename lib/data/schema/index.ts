/**
 * Public entrypoint for the Trader Battles domain model.
 *
 * - enums.ts   — categorical unions (league, market, verification states...)
 * - tables.ts  — Drizzle pg-core tables (Postgres-portable; no DB needed
 *                for the demo)
 * - types.ts   — inferred domain row types the rest of the app consumes
 */

export * from "./enums";
export * from "./tables";
export * from "./types";
