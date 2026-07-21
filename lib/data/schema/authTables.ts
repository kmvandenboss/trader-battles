/**
 * Bridge-auth tables for Auth.js (NextAuth v5) + @auth/drizzle-adapter.
 *
 * TEMPORARY IDENTITY BRIDGE — these tables exist only until MFFU's real
 * identity system owns login, at which point they are replaced wholesale and
 * the domain `users.authUserId` link is repointed. Nothing in the domain
 * model, repositories, or seed data depends on them.
 *
 * Shape notes:
 * - Columns replicate the @auth/drizzle-adapter default Postgres schema
 *   exactly (same TS property names, types, and primary keys) so the adapter
 *   can be configured with these tables in the wiring step. Only the SQL
 *   table names are namespaced (`auth_*`) to avoid colliding with the
 *   existing domain `users` table.
 * - `authUsers.passwordHash` is our one addition: the v1 auth method is
 *   credentials (email + password) with JWT sessions. It is nullable — the
 *   adapter never touches it. `authSessions` / `authVerificationTokens` may
 *   go unused under JWT sessions; they exist to satisfy the adapter's
 *   expected shape.
 * - Auth rows are runtime-only (created by sign-up). They are never seeded
 *   and never carry demo data.
 * - NEVER store plaintext secrets here. `passwordHash` holds a hash only;
 *   the OAuth token columns exist for adapter compatibility and stay empty
 *   under the credentials provider.
 */

import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Mirror of Auth.js `AdapterAccountType` — declared locally so the schema
 * layer has zero dependency on the next-auth package.
 */
export type AuthAccountType = "oauth" | "oidc" | "email" | "webauthn";

export const authUsers = pgTable("auth_users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", {
    withTimezone: true,
    mode: "date",
  }),
  image: text("image"),
  /** Credentials-provider password hash (bcrypt/argon2). NEVER plaintext. */
  passwordHash: text("password_hash"),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").$type<AuthAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);
