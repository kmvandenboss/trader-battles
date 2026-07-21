/**
 * serviceErrors — typed errors for the v1 battle services
 * (settlementService, challengeService).
 *
 * Design choice: services THROW `ServiceError` (never plain Error) for every
 * expected caller mistake — unknown ids, wrong actor, window not closed yet,
 * missing imports, unusable CSV files. Callers (server actions / API
 * routes) catch, switch on `code` if they need to branch, and surface
 * `message` verbatim — every message is written as honest, user-facing copy.
 * Unexpected failures (repo bugs, invariant breaks) still surface as plain
 * errors so they are not mistaken for user input problems.
 */

export type ServiceErrorCode =
  // Import / settlement
  | "BATTLE_NOT_FOUND"
  | "NOT_A_PARTICIPANT"
  | "BATTLE_NOT_SETTLEABLE"
  | "WINDOW_NOT_CLOSED"
  | "WAITING_ON_IMPORT"
  | "EMPTY_IMPORT"
  | "CSV_INVALID"
  | "ACCOUNT_MISMATCH"
  // Challenges
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_NOT_PENDING"
  | "NOT_CHALLENGE_OPPONENT"
  | "NOT_CHALLENGER"
  | "TRADER_NOT_FOUND"
  | "SELF_CHALLENGE"
  | "INVALID_SESSION_DATE";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function isServiceError(value: unknown): value is ServiceError {
  return value instanceof ServiceError;
}
