/**
 * Public entrypoint for the Trader Battles domain model.
 *
 * - enums.ts      — categorical unions (league, market, verification
 *                   states...)
 * - tables.ts     — Drizzle pg-core tables (Postgres-portable; no DB needed
 *                   for the demo)
 * - authTables.ts — Auth.js bridge tables (auth_* namespace; replaced when
 *                   MFFU's real identity system lands)
 * - types.ts      — inferred domain row types the rest of the app consumes
 */

export * from "./enums";
export * from "./tables";
export * from "./authTables";
export * from "./types";
