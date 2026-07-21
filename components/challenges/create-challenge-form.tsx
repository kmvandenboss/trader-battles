"use client";

/**
 * CreateChallengeForm — the "challenge a specific trader to a named future
 * window" form (docs/v1-divergences.md → Battle formats).
 *
 * Pure form state + presentation: submits to createChallengeAction
 * (app/challenges/actions.ts) via useActionState and renders the returned
 * ServiceError message inline — same pattern as /signin. The acting user is
 * resolved server-side from the session; this form never sends its own
 * identity. Opponent options arrive as already-formatted serializable props.
 */

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createChallengeAction } from "@/app/challenges/actions";
import {
  INITIAL_CHALLENGE_FORM_STATE,
} from "./action-state";

export interface OpponentOption {
  userId: string;
  /** "DeltaHunter · 1,712 · Gold I" — formatted server-side. */
  label: string;
}

export interface WindowOption {
  value: string;
  /** "Opening Bell · 9:30–11:00 ET" */
  label: string;
}

export interface MarketOption {
  value: string;
  label: string;
}

export interface BracketOption {
  value: string;
  label: string;
}

interface CreateChallengeFormProps {
  opponents: OpponentOption[];
  windows: WindowOption[];
  markets: MarketOption[];
  brackets: BracketOption[];
  /** Today's ET calendar date ("YYYY-MM-DD") — the earliest valid session. */
  minSessionDate: string;
  /** Pre-selects the opponent (e.g. deep-linked from a trader's profile). */
  defaultOpponentUserId?: string;
}

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

export function CreateChallengeForm({
  opponents,
  windows,
  markets,
  brackets,
  minSessionDate,
  defaultOpponentUserId,
}: CreateChallengeFormProps) {
  const [state, formAction, pending] = useActionState(
    createChallengeAction,
    INITIAL_CHALLENGE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field id="challenge-opponent" label="Opponent">
        <select
          id="challenge-opponent"
          name="opponentUserId"
          required
          disabled={pending}
          className={INPUT_CLASS}
          defaultValue={defaultOpponentUserId ?? ""}
        >
          <option value="" disabled>
            Pick a trader…
          </option>
          {opponents.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="challenge-date" label="Session date">
          <input
            id="challenge-date"
            name="sessionDate"
            type="date"
            required
            min={minSessionDate}
            defaultValue={minSessionDate}
            disabled={pending}
            className={INPUT_CLASS}
          />
        </Field>
        <Field id="challenge-bracket" label="Account bracket">
          <select
            id="challenge-bracket"
            name="accountBracket"
            required
            disabled={pending}
            className={INPUT_CLASS}
            defaultValue="50K"
          >
            {brackets.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="challenge-window" label="Battle window">
        <select
          id="challenge-window"
          name="battleWindow"
          required
          disabled={pending}
          className={INPUT_CLASS}
          defaultValue="OPENING_BELL"
        >
          {windows.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="challenge-market"
        label="Instrument"
        hint="Open by default — each trader trades what they want in the window."
      >
        <select
          id="challenge-market"
          name="market"
          disabled={pending}
          className={INPUT_CLASS}
          defaultValue=""
        >
          <option value="">Open — trader&apos;s choice</option>
          {markets.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>

      <Field id="challenge-message" label="Message (optional)">
        <textarea
          id="challenge-message"
          name="message"
          rows={2}
          maxLength={280}
          disabled={pending}
          className={INPUT_CLASS}
          placeholder="e.g. Opening bell tomorrow — let's settle this."
        />
      </Field>

      {state.status === "error" && state.error ? (
        <p
          role="alert"
          className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative"
        >
          {state.error}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-xs text-positive">
          Challenge sent. It appears under Outgoing until your opponent
          responds.
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send challenge"}
      </Button>
    </form>
  );
}
