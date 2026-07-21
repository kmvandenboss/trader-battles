"use client";

/**
 * InviteFriendForm — captures a not-yet-signed-up trader's contact info so
 * the inviter can share a join link themselves (docs: refer-a-friend). No
 * email is sent by this build; app/challenges/actions.ts only records the
 * invite and returns a shareable code. Mirrors CreateChallengeForm's shape.
 */

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { createInviteAction } from "@/app/challenges/actions";
import { INITIAL_INVITE_FORM_STATE } from "./action-state";

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

function InviteLink({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/signin?ref=${inviteCode}`
      : `/signin?ref=${inviteCode}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-positive/30 bg-positive/10 px-3 py-2.5">
      <p className="text-xs text-positive">
        Invite saved. Share this link yourself — email delivery isn&apos;t
        wired up yet in this build.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}

export function InviteFriendForm() {
  const [state, formAction, pending] = useActionState(
    createInviteAction,
    INITIAL_INVITE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field id="invite-name" label="Name (optional)">
        <input
          id="invite-name"
          name="inviteeName"
          type="text"
          maxLength={80}
          disabled={pending}
          className={INPUT_CLASS}
          placeholder="e.g. Jordan"
        />
      </Field>

      <Field id="invite-email" label="Email">
        <input
          id="invite-email"
          name="inviteeEmail"
          type="email"
          required
          disabled={pending}
          className={INPUT_CLASS}
          placeholder="jordan@example.com"
        />
      </Field>

      <Field id="invite-message" label="Message (optional)">
        <textarea
          id="invite-message"
          name="message"
          rows={2}
          maxLength={280}
          disabled={pending}
          className={INPUT_CLASS}
          placeholder="e.g. Come battle me on Trader Battles."
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
      {state.status === "success" && state.inviteCode ? (
        <InviteLink inviteCode={state.inviteCode} />
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Invite a friend"}
      </Button>
    </form>
  );
}
