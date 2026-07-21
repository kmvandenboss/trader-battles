/**
 * Minimal .env loader for CLI tooling (drizzle.config.ts, scripts/db-seed.ts).
 *
 * Next.js loads .env.local automatically for the app, but drizzle-kit and
 * plain tsx scripts do not — this fills that gap without adding a dotenv
 * dependency. Existing process.env values always win; files are optional.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnv(files: string[] = [".env.local", ".env"]): void {
  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}
