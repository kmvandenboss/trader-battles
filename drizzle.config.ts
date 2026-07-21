/**
 * drizzle-kit configuration.
 *
 * - Schema source: lib/data/schema/tables.ts (the canonical domain model).
 * - Migrations out-dir: drizzle/ (committed SQL; `npm run db:generate`).
 * - Credentials: migrations prefer DATABASE_URL_UNPOOLED (Neon's DIRECT
 *   connection — required for long-running DDL) and fall back to
 *   DATABASE_URL (the pooled string the app uses at runtime). Generation
 *   (`db:generate`) is offline and needs neither.
 */

import { defineConfig } from "drizzle-kit";

import { loadLocalEnv } from "./scripts/load-env";

loadLocalEnv();

export default defineConfig({
  schema: "./lib/data/schema/tables.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
