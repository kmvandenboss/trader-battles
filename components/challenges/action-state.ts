/**
 * Serializable useActionState shapes shared by the /challenges server
 * actions (app/challenges/actions.ts) and the client form components.
 * Plain types only — no logic, no framework imports.
 */

export interface ChallengeFormState {
  status: "idle" | "success" | "error";
  /** User-facing ServiceError message, rendered inline. */
  error: string | null;
}

export const INITIAL_CHALLENGE_FORM_STATE: ChallengeFormState = {
  status: "idle",
  error: null,
};

export interface ChallengeResponseState {
  /** User-facing ServiceError message, rendered inline (null = no error). */
  error: string | null;
}

export const INITIAL_CHALLENGE_RESPONSE_STATE: ChallengeResponseState = {
  error: null,
};

export interface InviteFormState {
  status: "idle" | "success" | "error";
  error: string | null;
  /** Set on success — the created invite's shareable code. */
  inviteCode?: string;
}

export const INITIAL_INVITE_FORM_STATE: InviteFormState = {
  status: "idle",
  error: null,
};
