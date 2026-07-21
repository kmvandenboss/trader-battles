/**
 * THE identity seam — the replaceable bridge until MFFU's real identity
 * system owns login.
 *
 * Every page and server loader that needs "who is looking at this" resolves
 * identity HERE, never from the session or the demo trader directly:
 *
 *   getCurrentUser()     → the Auth.js session user (auth_users id) or null.
 *   getCurrentTrader()   → the session user's linked domain trader
 *                          (users.auth_user_id → TraderWithProfile), falling
 *                          back to the seeded demo trader (KevinV) when
 *                          unauthenticated, unlinked, or when DATABASE_URL
 *                          is unset (the zero-env demo).
 *   getCurrentIdentity() → trader + flags for UI affordances (sign-in vs
 *                          sign-out, demo-user hint).
 *
 * When MFFU's identity system lands, only lib/auth/* is replaced; callers of
 * these three functions do not change.
 *
 * Server-only (no "use client"): touches the session and repositories.
 * IMPORT-TIME SAFE without DATABASE_URL: getCurrentUser() short-circuits to
 * null before touching auth(), so the no-env build keeps every currently
 * static route static and byte-equivalent to the pre-auth demo.
 */

import { cache } from "react";
import { eq } from "drizzle-orm";

import { auth } from "./index";
import { getAuthDb, isAuthEnabled } from "./db";
import { users } from "@/lib/data/schema/tables";
import { getRepositories } from "@/lib/data/repositories";
import type { TraderWithProfile } from "@/lib/data/repositories/types";

/** The authenticated bridge-auth user (an auth_users row), session-scoped. */
export interface CurrentAuthUser {
  /** auth_users.id — NOT a domain user id. */
  id: string;
  email: string | null;
  name: string | null;
}

/** Identity + the flags the header/UI needs to stay honest. */
export interface CurrentIdentity {
  trader: TraderWithProfile;
  /** True when a session exists (controls the sign-out affordance). */
  isAuthenticated: boolean;
  /** True when `trader` is the seeded demo fallback, not the session user. */
  isDemoFallback: boolean;
}

/**
 * The session's auth user, or null when unauthenticated. Cheap no-op when
 * DATABASE_URL is unset: auth() is never called, so no cookie/header read
 * forces dynamic rendering in the zero-env demo build.
 */
export const getCurrentUser = cache(
  async (): Promise<CurrentAuthUser | null> => {
    if (!isAuthEnabled()) return null;
    const session = await auth();
    const user = session?.user;
    if (!user?.id) return null;
    return {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  },
);

/** Domain trader linked to an auth user via users.auth_user_id, or null. */
async function findLinkedTrader(
  authUserId: string,
): Promise<TraderWithProfile | null> {
  const rows = await getAuthDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  if (rows.length === 0) return null;
  return getRepositories().traders.getById(rows[0].id);
}

/**
 * Resolve the full current identity: the signed-in user's linked trader, or
 * the seeded demo trader as the honest fallback (unauthenticated, unlinked,
 * or no database). Request-scoped via React cache, so the layout and page
 * share one resolution.
 */
export const getCurrentIdentity = cache(async (): Promise<CurrentIdentity> => {
  const { traders } = getRepositories();
  const authUser = await getCurrentUser();
  if (authUser) {
    const linked = await findLinkedTrader(authUser.id);
    if (linked) {
      return { trader: linked, isAuthenticated: true, isDemoFallback: false };
    }
    // Signed in but no linked domain trader (should not happen — sign-up
    // creates both). Fall back to the demo trader so the app still renders,
    // and keep the session visible so the user can sign out.
    return {
      trader: await traders.getDemoTrader(),
      isAuthenticated: true,
      isDemoFallback: true,
    };
  }
  return {
    trader: await traders.getDemoTrader(),
    isAuthenticated: false,
    isDemoFallback: true,
  };
});

/**
 * The trader every page renders as "you". Session user's trader when signed
 * in; the seeded demo trader otherwise. This is the drop-in replacement for
 * the old hardcoded `traders.getDemoTrader()` call sites.
 */
export async function getCurrentTrader(): Promise<TraderWithProfile> {
  return (await getCurrentIdentity()).trader;
}
