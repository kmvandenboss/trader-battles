/**
 * Serializable useActionState shapes shared by the /battles/[id] server
 * actions (app/battles/[id]/actions.ts) and the client card components.
 * Plain types only — no logic, no framework imports. Every numeric field is
 * copied verbatim from the settlement-service result; nothing is computed
 * client-side.
 */

export interface RejectedRowView {
  line: number;
  reason: string;
}

/** Honest pre-settlement preview (settlementService ImportWindowPreview). */
export interface WindowPreviewView {
  tradesInWindow: number;
  tradesOutsideWindow: number;
  openAtBuzzer: number;
}

export interface ImportTradesResultView {
  /** The MFFU account id the file belongs to (from the CSV itself). */
  accountLabel: string;
  parsedRows: number;
  accepted: number;
  duplicates: number;
  rejectedRows: RejectedRowView[];
  /** Newly persisted events vs. re-import duplicates skipped. */
  inserted: number;
  skippedDuplicates: number;
  preview: WindowPreviewView;
}

export interface ImportTradesState {
  status: "idle" | "success" | "error";
  error: string | null;
  result: ImportTradesResultView | null;
}

export const INITIAL_IMPORT_TRADES_STATE: ImportTradesState = {
  status: "idle",
  error: null,
  result: null,
};

export interface ImportBarsResultView {
  instrument: string;
  parsedBars: number;
  rejectedRows: RejectedRowView[];
  inserted: number;
  replaced: number;
}

export interface ImportBarsState {
  status: "idle" | "success" | "error";
  error: string | null;
  result: ImportBarsResultView | null;
}

export const INITIAL_IMPORT_BARS_STATE: ImportBarsState = {
  status: "idle",
  error: null,
  result: null,
};

export interface SettleState {
  /** User-facing ServiceError message (window not closed, waiting on an
   * import, ...) rendered inline. Success redirects instead. */
  error: string | null;
}

export const INITIAL_SETTLE_STATE: SettleState = { error: null };
