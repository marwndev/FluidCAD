// Fastened mate (0 DOF): two connectors are coincident face-to-face.
//
// Phase 06 implementation lives entirely in `warm-start.ts`:
//   - Pre-solve, the follower's full pose (origin + quat) is computed from
//     the driver and written into the BodyState; both `lockPosition` and
//     `lockOrientation` are set so the solver doesn't touch the follower.
//   - Post-solve, the follower's pose is re-derived from the *solved*
//     driver pose so it tracks drags.
//
// As a result, this compiler adds **no** slvs constraints. Slvs's
// 2D-in-workplane connector entities project the connector's local Z
// component to zero, which makes POINTS_COINCIDENT unfaithful for any
// connector that lives on a face above/below the body's origin (the
// common case — connectors on top / bottom faces). The full geometric
// relation is computed analytically instead.
//
// Limitations:
//   - `offset.z` is recorded on the mate and applied by the warm-start.
//     There is no slvs verification, so this just works.

import type { CompileCtx } from '../mate-compiler.js';
import type { MateRecord } from '../types.js';

export function compileFastened(_ctx: CompileCtx, _mate: MateRecord): number[] {
  return [];
}
