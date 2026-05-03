// Top-level Solver orchestrator.
//
// Each `solve()` call (re-)builds a fresh System from the input, optionally
// pins drag params, runs Slvs_Solve on the active group, and reads back
// poses. The wrapper rebuilds System on every call by design (keeps state
// on the JS side stateless), and per-call costs measured so far are well
// under 1 ms for assemblies of 10–50 bodies — fine for 60 fps.

import { GROUP_ACTIVE, buildSystem, readBackPoses, type BodyHandles, type BuiltSystem } from './system-builder.js';
import { loadSolveSpace, type SolveSpaceApi } from './solvespace-loader.js';
import type { SolverInput, SolverOutput, SolverResult } from './types.js';

export class Solver {
  private api: SolveSpaceApi | null = null;

  /** Awaits the WASM module if it isn't loaded yet. Idempotent. */
  async ensureReady(): Promise<void> {
    if (!this.api) {
      this.api = await loadSolveSpace();
    }
  }

  /** True only after `ensureReady()` resolved. Used by sync paths. */
  isReady(): boolean {
    return this.api !== null;
  }

  /**
   * Synchronous solve. Throws if `ensureReady()` hasn't completed yet —
   * callers (drag handler) must await `ensureReady()` first.
   */
  solve(input: SolverInput): SolverOutput {
    if (!this.api) {
      throw new Error('Solver.solve() called before ensureReady() resolved.');
    }
    const built = buildSystem(this.api, input);

    if (input.draggedInstanceId && input.draggedTargetOrigin) {
      this.applyDragTarget(built, input);
    }

    built.sys.calculateFaileds = true;
    built.sys.solve(GROUP_ACTIVE);

    return this.readResult(built);
  }

  /**
   * Pin the dragged body's origin params to the caller-supplied target.
   * The caller (AssemblyController) is responsible for converting cursor
   * world coords to a body-origin target using the grab offset captured
   * at drag-start. Doing the offset arithmetic JS-side avoids re-deriving
   * it from the moving origin every frame, which would drift after each
   * solve.
   */
  private applyDragTarget(built: BuiltSystem, input: SolverInput): void {
    const handles = built.bodies.find(b => b.instanceId === input.draggedInstanceId);
    if (!handles || handles.grounded) return;

    const targetOrigin = input.draggedTargetOrigin!;
    // Overwrite the params in place. The wrapper reads `sys.params[i].val`
    // when it serializes to wasm memory at solve time, so mutating after
    // addParam but before solve() is safe.
    setParamByHandle(built.sys, handles.originParams[0], targetOrigin.x);
    setParamByHandle(built.sys, handles.originParams[1], targetOrigin.y);
    setParamByHandle(built.sys, handles.originParams[2], targetOrigin.z);

    built.sys.dragged = [
      handles.originParams[0],
      handles.originParams[1],
      handles.originParams[2],
      0,
    ];
  }

  private readResult(built: BuiltSystem): SolverOutput {
    const api = this.api!;
    const sys = built.sys;
    const code = sys.result as number;
    let result: SolverResult;
    switch (code) {
      case api.RESULT.OKAY: result = 'okay'; break;
      case api.RESULT.INCONSISTENT: result = 'inconsistent'; break;
      case api.RESULT.DIDNT_CONVERGE: result = 'didnt-converge'; break;
      case api.RESULT.TOO_MANY_UNKNOWNS: result = 'too-many-unknowns'; break;
      default: result = 'inconsistent';
    }

    // libslvs reports DOF on the active group only. For an assembly of
    // ungrounded bodies with no mates, that's 6N. With one grounded body
    // and one free, dof = 6.
    const dof = sys.dof as number;

    const failed: string[] = [];
    if (result === 'inconsistent' || result === 'didnt-converge') {
      // sys.failed contains constraint handles in input.mates ordering.
      // Phase 05 adds no constraints, so this list will be empty in
      // practice; phase 06+ wires real mate-id mapping.
      const failedHandles = (sys.failed ?? []) as number[];
      // Constraint handles are 1-indexed in build order; phase 06 will
      // populate input.mates and we'll map handles → mateId here.
      void failedHandles;
    }

    const solvedBodies = readBackPoses(built);
    return {
      bodies: solvedBodies,
      result,
      dof,
      failed,
    };
  }
}

function setParamByHandle(sys: any, handle: number, val: number): void {
  const params = sys.params as { h: number; val: number }[];
  for (const p of params) {
    if (p.h === handle) {
      p.val = val;
      return;
    }
  }
}

/** Convenience: returns true if a SolverOutput should leave poses applied. */
export function isUsableSolution(out: SolverOutput): boolean {
  return out.result === 'okay';
}

// Re-export BodyHandles so callers building inputs externally can inspect
// the handle layout.
export type { BodyHandles };
