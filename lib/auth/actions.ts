"use server";

/**
 * Bridge-auth server actions: sign-up, sign-in, sign-out.
 *
 * Part of the temporary identity bridge (see ./currentUser.ts). Sign-up is
 * OUR account-creation path — the Auth.js adapter never creates users. One
 * auth user ↔ one domain user/trader:
 *
 *   auth_users (credentials)  ←  users.auth_user_id  →  trader_profiles
 *
 * New traders get honest fresh-competitor defaults: rating 1500 (Silver II
 * via leagueForRating), 0–0 records, no streaks, neutral 50/100 skill
 * indicators (no battles have informed them yet), MFFU affiliation, NQ
 * primary market.
 *
 * MFFU ACCOUNT-ID CAPTURE IS DEFERRED TO PHASE D: the CSV-import flow owns
 * account identity (which MFFU account a trader competes with), so sign-up
 * collects display name + email + password only.
 *
 * All actions are no-ops with a clear error when DATABASE_URL is unset —
 * the zero-env demo has no accounts.
 */

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { eq } from "drizzle-orm";

import { signIn, signOut } from "./index";
import { getAuthDb, isAuthEnabled } from "./db";
import { authUsers } from "@/lib/data/schema/authTables";
import { firms, traderProfiles, users } from "@/lib/data/schema/tables";
import { leagueForRating } from "@/lib/data/leagues";

/** bcryptjs cost factor — 10 keeps serverless sign-in latency reasonable. */
const BCRYPT_COST = 10;

/** Fresh-competitor starting rating (Silver II under lib/data/leagues.ts). */
const NEW_TRADER_RATING = 1500;

/**
 * Neutral 0–100 skill-indicator baseline for a trader with zero battles.
 * Deliberately the midpoint: it claims neither strength nor weakness until
 * settled battles (Phase D) inform these values.
 */
const NEW_TRADER_SKILL_BASELINE = 50;

export interface AuthFormState {
  error: string | null;
}

const AUTH_DISABLED_ERROR =
  "Accounts require the database-backed deployment. This demo build has no sign-in — you are browsing as the demo trader.";

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,23}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Sign in with email + password. Redirects home on success. */
export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isAuthEnabled()) return { error: AUTH_DISABLED_ERROR };
  const email = fieldString(formData, "email").trim().toLowerCase();
  const password = fieldString(formData, "password");
  if (!email || !password) {
    return { error: "Enter your email and password." };
  }
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return { error: null }; // Unreachable — signIn redirects on success.
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "That email and password combination didn't match." };
    }
    throw error; // Next.js redirect — must propagate.
  }
}

/**
 * Create an account: auth_users row (bcrypt hash) + linked domain user +
 * fresh trader profile, then sign the new user in.
 */
export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isAuthEnabled()) return { error: AUTH_DISABLED_ERROR };

  const displayName = fieldString(formData, "displayName").trim();
  const email = fieldString(formData, "email").trim().toLowerCase();
  const password = fieldString(formData, "password");

  if (!DISPLAY_NAME_PATTERN.test(displayName)) {
    return {
      error:
        "Display name must be 3–24 characters: letters, numbers, spaces, and _ . - only.",
    };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const db = getAuthDb();

  // Uniqueness pre-checks (unique constraints still backstop races).
  const [existingEmail, existingName] = await Promise.all([
    db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1),
    db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.displayName, displayName))
      .limit(1),
  ]);
  if (existingEmail.length > 0) {
    return { error: "An account with this email already exists — sign in instead." };
  }
  if (existingName.length > 0) {
    return { error: "That display name is taken. Pick another." };
  }

  // New traders join under MFFU — the single firm v1 is built for.
  const firmRows = await db
    .select({ id: firms.id })
    .from(firms)
    .where(eq(firms.slug, "mffu"))
    .limit(1);
  if (firmRows.length === 0) {
    return {
      error:
        "Platform data is not initialized on this deployment (missing MFFU firm). Run the database seed first.",
    };
  }
  const firmId = firmRows[0].id;

  const authUserId = crypto.randomUUID();
  const domainUserId = `user-${crypto.randomUUID()}`;
  const passwordHash = await hash(password, BCRYPT_COST);
  const placement = leagueForRating(NEW_TRADER_RATING);

  // neon-http has no transactions; insert sequentially and best-effort
  // unwind the auth row if the domain rows fail, so a retry can succeed.
  try {
    await db.insert(authUsers).values({
      id: authUserId,
      name: displayName,
      email,
      passwordHash,
    });
  } catch {
    return { error: "Could not create the account. Try again." };
  }

  try {
    await db.insert(users).values({
      id: domainUserId,
      displayName,
      email,
      avatarUrl: null,
      isDemoUser: false,
      authUserId,
      createdAt: new Date().toISOString(),
    });
    await db.insert(traderProfiles).values({
      userId: domainUserId,
      firmId,
      rating: NEW_TRADER_RATING,
      league: placement.league,
      division: placement.division,
      primaryMarket: "NQ",
      secondaryMarkets: [],
      battleStyle: "BALANCED",
      disciplineScore: NEW_TRADER_SKILL_BASELINE,
      riskScore: NEW_TRADER_SKILL_BASELINE,
      performanceScore: NEW_TRADER_SKILL_BASELINE,
      seasonWins: 0,
      seasonLosses: 0,
      lifetimeWins: 0,
      lifetimeLosses: 0,
      currentStreak: 0,
      bestWinStreak: 0,
      seasonStartRating: NEW_TRADER_RATING,
      seasonHighRating: NEW_TRADER_RATING,
    });
  } catch {
    // Unwind so the email isn't left claimed by a half-created account.
    await db
      .delete(traderProfiles)
      .where(eq(traderProfiles.userId, domainUserId))
      .catch(() => {});
    await db.delete(users).where(eq(users.id, domainUserId)).catch(() => {});
    await db.delete(authUsers).where(eq(authUsers.id, authUserId)).catch(() => {});
    return { error: "Could not create the trader profile. Try again." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return { error: null }; // Unreachable — signIn redirects on success.
  } catch (error) {
    if (error instanceof AuthError) {
      // Account exists but auto sign-in failed; let them sign in manually.
      return { error: "Account created — sign in with your new credentials." };
    }
    throw error; // Next.js redirect — must propagate.
  }
}

/** Sign out and return to the demo-identity home. */
export async function signOutAction(): Promise<void> {
  if (!isAuthEnabled()) return;
  await signOut({ redirectTo: "/" });
}
