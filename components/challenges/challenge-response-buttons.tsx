"use client";

/**
 * ChallengeResponseButtons — Accept/Decline (incoming) or Cancel (outgoing)
 * controls for one pending challenge. Submits to the server actions in
 * app/challenges/actions.ts via useActionState; ServiceError messages render
 * inline. The challengeId names the challenge — WHO is acting is resolved
 * server-side from the session, never from this form.
 */

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptChallengeAction,
  cancelChallengeAction,
  declineChallengeAction,
} from "@/app/challenges/actions";
import { INITIAL_CHALLENGE_RESPONSE_STATE } from "./action-state";

function InlineError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="w-full rounded-md border border-negative/30 bg-negative/10 px-2.5 py-1.5 text-xs text-negative"
    >
      {error}
    </p>
  );
}

export function IncomingChallengeButtons({
  challengeId,
}: {
  challengeId: string;
}) {
  const [acceptState, acceptAction, acceptPending] = useActionState(
    acceptChallengeAction,
    INITIAL_CHALLENGE_RESPONSE_STATE,
  );
  const [declineState, declineAction, declinePending] = useActionState(
    declineChallengeAction,
    INITIAL_CHALLENGE_RESPONSE_STATE,
  );
  const pending = acceptPending || declinePending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={acceptAction}>
        <input type="hidden" name="challengeId" value={challengeId} />
        <Button type="submit" size="sm" disabled={pending}>
          {acceptPending ? "Accepting…" : "Accept"}
        </Button>
      </form>
      <form action={declineAction}>
        <input type="hidden" name="challengeId" value={challengeId} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {declinePending ? "Declining…" : "Decline"}
        </Button>
      </form>
      <InlineError error={acceptState.error ?? declineState.error} />
    </div>
  );
}

export function OutgoingChallengeButtons({
  challengeId,
}: {
  challengeId: string;
}) {
  const [state, action, pending] = useActionState(
    cancelChallengeAction,
    INITIAL_CHALLENGE_RESPONSE_STATE,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action}>
        <input type="hidden" name="challengeId" value={challengeId} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel challenge"}
        </Button>
      </form>
      <InlineError error={state.error} />
    </div>
  );
}
