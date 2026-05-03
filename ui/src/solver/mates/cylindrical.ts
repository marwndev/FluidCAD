// Cylindrical mate (2 DOF: slide along Z + rotation about Z). Two
// connectors share an axis line and have parallel (or, with .flip(),
// anti-parallel) Z; both translation along the shared axis and
// rotation about it remain free.
//
// Like fastened, revolute, and slider, cylindrical is solved entirely
// JS-side via warm-start + post-solve fixup
// (`warm-start.ts:applyCylindricalWarmStarts` /
// `applyCylindricalFixup`). The compiler adds **no** slvs constraints
// — see `features-spec/assembly/mate-implementation-pattern.md` for
// why (slvs's POINT_IN_2D entities silently drop connector local Z,
// which breaks position coincidence for any connector authored
// above/below the body's xy plane).
//
// Drag projection is intentionally a no-op for cylindrical: the
// mate's 2-D manifold (axial × angular) matches the cursor's 2 screen
// DOFs, so the warm-start's cursor decomposition into (axial, angular)
// updates lets the user steer both DOFs at once with no projection
// hack. The XY-only offset validation lives upstream in
// `lib/features/mate.ts`'s `MateBuilder.offset()` so it surfaces at
// parse time with file/line info; the compiler trusts that contract.

import type { CompileCtx } from '../mate-compiler.js';
import type { MateRecord } from '../types.js';

export function compileCylindrical(_ctx: CompileCtx, _mate: MateRecord): number[] {
  return [];
}
