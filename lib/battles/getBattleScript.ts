/**
 * getBattleScript — read-only accessor for the script behind a battle state.
 *
 * ADDITIVE UI helper (Phase 4). The Live Battle screen needs the scenario's
 * authored price path to draw the intraday chart. The engine already resolves
 * scripts through the registered `BattleScriptSource` (memoized inside the
 * mock source); this helper exposes the same resolution without duplicating
 * any data into UI components and without touching engine functions.
 *
 * Importing from "./battleEngine" (a value import) guarantees the default
 * mock script source is registered before any lookup happens.
 */

import type { BattleEngineState } from "./battleEngine";
import "./battleEngine"; // side effect: registers the default mock script source
import { getBattleScriptSource, type BattleScript } from "./battleScript";

/** Resolve the deterministic script a battle state was created from. */
export function getBattleScriptForState(
  state: BattleEngineState,
): BattleScript {
  return getBattleScriptSource(state.scriptSourceId).getScript(
    state.scenarioId,
  );
}
