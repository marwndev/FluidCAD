// Revolute mate (1 DOF rotate): two connectors share an origin; their Z
// axes are parallel; X/Y free to rotate around the shared Z.
//
// Like fastened, the entire mate is handled JS-side via warm-start +
// post-solve fixup (`warm-start.ts:applyRevoluteWarmStarts` /
// `applyRevoluteFixup`). Slvs has no constraints for revolute because:
//
//   1. POINT_IN_2D entities project the connector's local Z to zero, so
//      slvs's view of "the connector's world position" disagrees with the
//      true world position whenever the connector lives off the body's
//      xy plane (top/bottom/side faces — i.e., the common case).
//      POINTS_COINCIDENT on those projected points produces a body offset
//      that visibly misses the actual face coincidence.
//
//   2. PARALLEL between body normals is correct only when each connector's
//      local Z is aligned with its body's Z, which isn't true in general.
//
// Both problems vanish when the relation is computed analytically. The
// trade-off is that slvs no longer counts the revolute's 1 free DOF —
// the JS code adds it to the reported total in `Solver.solve()`.
//
// Limitations:
//   - `.offset(...)` semantics need work. Phase 06's fastened bakes offset
//     into the warm-start; revolute does the same, but the post-fixup
//     re-derives position from rotation about the *driver* connector,
//     which should compose correctly with offset along the driver Z. Tests
//     cover the common XY/Z offsets; pathological cases may need future
//     polish.

import type { CompileCtx } from '../mate-compiler.js';
import type { MateRecord } from '../types.js';

export function compileRevolute(_ctx: CompileCtx, _mate: MateRecord): number[] {
  return [];
}
