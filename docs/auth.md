# Bridge auth (Auth.js v5)

**Status: temporary bridge.** This layer exists so a handful of real MFFU testers can hold accounts
during the v1 pilot. It is deliberately minimal and replaceable: when MFFU's real identity system
owns login, `lib/auth/*` (and the `auth_*` tables) are swapped out wholesale and nothing else
changes — every page resolves identity through the `getCurrentUser()` / `getCurrentTrader()` seam,
never from the session directly.

## Shape

- **Provider: credentials only** (email + password). Passwords are bcryptjs hashes (cost 10) in
  `auth_users.password_hash`. No OAuth, no magic links — enough for tester accounts, nothing more.
- **Sessions: JWT** (required by the credentials provider). The Drizzle adapter is still configured
  with the namespaced `auth_*` tables (`lib/data/schema/authTables.ts`) so OAuth/email providers can
  be added later; under JWT + credentials it persists almost nothing.
- **Account creation is ours, not the adapter's.** The sign-up server action
  (`lib/auth/actions.ts`) creates, in order: an `auth_users` row, a domain `users` row linked via
  `users.auth_user_id` (one auth user ↔ one domain user/trader), and a fresh `trader_profiles` row.
- **New-trader defaults**: rating 1500 → Silver II (via `leagueForRating`), 0–0 season and lifetime
  records, no streaks, MFFU affiliation, NQ primary market, `BALANCED` style, and neutral 50/100
  skill indicators (no battles have informed them yet). Sign-up collects display name, email, and
  password only — **MFFU account-id capture is deferred to Phase D**, where the CSV-import flow owns
  account identity.

## The seam (`lib/auth/currentUser.ts`)

| Function | Resolves to |
| --- | --- |
| `getCurrentUser()` | The session's auth user (`auth_users` id), or `null`. |
| `getCurrentTrader()` | The session user's linked `TraderWithProfile` via the repositories; **falls back to the seeded demo trader (KevinV)** when unauthenticated, unlinked, or when `DATABASE_URL` is unset. |
| `getCurrentIdentity()` | Trader + `isAuthenticated` / `isDemoFallback` flags for the header's sign-in/sign-out affordances and the "Demo user" hint. |

## Requirements & demo behavior

- **Auth requires `DATABASE_URL`.** Without it there are no accounts: `/signin` renders disabled
  forms with an honest notice, `getCurrentUser()` cheaply returns `null` without touching the
  session (so no cookie read forces dynamic rendering), and the whole app renders as the seeded
  demo trader — the zero-env demo is unchanged and `npm run build` passes with no environment.
- **`AUTH_SECRET`** must be set alongside `DATABASE_URL` (`npx auth secret` or
  `openssl rand -base64 32`; see `.env.example`). If `DATABASE_URL` is set without `AUTH_SECRET`,
  auth stays disabled with a logged warning (everyone resolves to the demo-fallback identity)
  rather than erroring — Postgres reads keep working. In demo mode the `/api/auth/*` surface
  returns 404.
- **`npm run db:seed` is safe to re-run**: it refreshes only seed-authored rows and never deletes
  real accounts, their trader profiles, or the firm/achievement rows they reference
  (see `docs/database.md`).
- Seeded demo users never have auth accounts (`users.auth_user_id` is null for all seed rows);
  real sign-ups are never labeled "Simulated Demo Data" (identity-adjacent demo badges key off the
  missing auth link).
- Route handlers live at `app/api/auth/[...nextauth]/route.ts`; the sign-in/sign-up UI at
  `/signin`.
