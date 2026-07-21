/**
 * Auth.js (NextAuth v5) configuration — the TEMPORARY identity bridge.
 *
 * This module (with ./currentUser) is the replaceable seam that exists only
 * until MFFU's real identity system owns login. Everything identity-shaped
 * flows through `getCurrentUser()` / `getCurrentTrader()`; when MFFU's
 * system lands, this module is swapped out and no page, component, or engine
 * changes.
 *
 * Shape of the bridge:
 * - Credentials provider (email + password), bcryptjs hashes stored in
 *   auth_users.password_hash (see lib/data/schema/authTables.ts).
 * - JWT session strategy — required for the credentials provider. The
 *   DrizzleAdapter is still configured (with our namespaced auth_* tables)
 *   so OAuth/email providers can be added later without rewiring; under
 *   JWT + credentials it persists almost nothing, which is fine — auth_users
 *   rows are created by OUR sign-up action (lib/auth/actions.ts), never by
 *   the adapter.
 * - IMPORT-TIME SAFE without DATABASE_URL: the adapter/DB client is only
 *   constructed when DATABASE_URL is set, and `authorize` refuses to run
 *   without it. The zero-env demo build imports this module freely.
 *
 * AUTH_SECRET is read from the environment by Auth.js itself (required at
 * request time when auth is actually used; see .env.example).
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";

import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
} from "@/lib/data/schema/authTables";
import { getAuthDb, isAuthEnabled } from "./db";

export { isAuthEnabled } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Adapter only exists on database-backed deployments; without it (the
  // zero-env demo) the config is still valid and simply never authenticates.
  ...(isAuthEnabled()
    ? {
        adapter: DrizzleAdapter(getAuthDb(), {
          usersTable: authUsers,
          accountsTable: authAccounts,
          sessionsTable: authSessions,
          verificationTokensTable: authVerificationTokens,
        }),
      }
    : {}),
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  // The bridge deploys behind Vercel/localhost; host trust is acceptable for
  // this temporary layer and removed with it.
  trustHost: true,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!isAuthEnabled()) return null;
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const rows = await getAuthDb()
          .select()
          .from(authUsers)
          .where(eq(authUsers.email, email))
          .limit(1);
        const user = rows[0];
        if (!user?.passwordHash) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    // JWT strategy: carry the auth_users id in the token and surface it on
    // session.user.id so the currentUser seam can resolve the linked domain
    // trader without a session table.
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
