/**
 * /signin — bridge-auth entry point (temporary until MFFU's identity system
 * owns login). Server component: resolves the session through the lib/auth
 * seam and renders the client sign-in / create-account forms. Already
 * signed-in users are sent home. On the zero-env demo (no DATABASE_URL) the
 * forms render disabled with an honest explanation.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AuthForms } from "@/components/auth/auth-forms";
import { isAuthEnabled } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth/currentUser";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Trader Battles or create a tester account. Without an account you browse as the demo trader on simulated data.",
};

export default async function SignInPage() {
  const authEnabled = isAuthEnabled();
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <Badge variant="outline" className="text-muted-foreground">
            MFFU testers
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Accounts are for MFFU testers in the v1 pilot. Without signing in you
          browse as the seeded demo trader — everything you see is simulated
          demo data.
        </p>
      </header>

      {!authEnabled ? (
        <p
          role="status"
          className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"
        >
          Sign-in is unavailable on this demo deployment — it runs entirely on
          the in-memory demo seed with no database configured. You are browsing
          as the demo trader.
        </p>
      ) : null}

      <AuthForms authEnabled={authEnabled} />
    </div>
  );
}
