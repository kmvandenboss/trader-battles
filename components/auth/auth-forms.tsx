"use client";

/**
 * Sign-in / create-account forms for the bridge-auth /signin page.
 *
 * Pure presentation + form state: both forms submit to the server actions in
 * lib/auth/actions (signInAction / signUpAction) via useActionState and show
 * the returned inline error. No auth logic, no repositories, no scoring —
 * identity resolution stays server-side behind the lib/auth seam.
 */

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  signInAction,
  signUpAction,
  type AuthFormState,
} from "@/lib/auth/actions";

const INITIAL_STATE: AuthFormState = { error: null };

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative"
    >
      {error}
    </p>
  );
}

export function AuthForms({ authEnabled }: { authEnabled: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInFormAction, signInPending] = useActionState(
    signInAction,
    INITIAL_STATE,
  );
  const [signUpState, signUpFormAction, signUpPending] = useActionState(
    signUpAction,
    INITIAL_STATE,
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Mode tabs */}
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="grid grid-cols-2 border-b border-border/60"
      >
        {(
          [
            ["signin", "Sign in"],
            ["signup", "Create account"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "border-b-2 px-4 py-3 text-sm transition-colors",
              mode === value
                ? "-mb-px border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {mode === "signin" ? (
          <form action={signInFormAction} className="space-y-4">
            <Field id="signin-email" label="Email">
              <input
                id="signin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={!authEnabled || signInPending}
                className={INPUT_CLASS}
                placeholder="you@example.com"
              />
            </Field>
            <Field id="signin-password" label="Password">
              <input
                id="signin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={!authEnabled || signInPending}
                className={INPUT_CLASS}
              />
            </Field>
            <FormError error={signInState.error} />
            <Button
              type="submit"
              className="w-full"
              disabled={!authEnabled || signInPending}
            >
              {signInPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <form action={signUpFormAction} className="space-y-4">
            <Field
              id="signup-name"
              label="Display name"
              hint="3–24 characters. This is your public competitor handle."
            >
              <input
                id="signup-name"
                name="displayName"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={24}
                disabled={!authEnabled || signUpPending}
                className={INPUT_CLASS}
                placeholder="e.g. OpeningRangeOllie"
              />
            </Field>
            <Field id="signup-email" label="Email">
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={!authEnabled || signUpPending}
                className={INPUT_CLASS}
                placeholder="you@example.com"
              />
            </Field>
            <Field
              id="signup-password"
              label="Password"
              hint="At least 8 characters."
            >
              <input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={!authEnabled || signUpPending}
                className={INPUT_CLASS}
              />
            </Field>
            <FormError error={signUpState.error} />
            <Button
              type="submit"
              className="w-full"
              disabled={!authEnabled || signUpPending}
            >
              {signUpPending ? "Creating account…" : "Create account"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              New accounts start fresh: rating 1,500 (Silver II), a 0–0 record,
              and an MFFU affiliation. Linking your MFFU trading account happens
              when you import trades for a battle.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
