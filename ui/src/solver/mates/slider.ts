// Slider mate (1 DOF translate): two connectors share an axis line; both
// connector Z and X axes are parallel; only translation along the shared
// line remains free.
//
// Like fastened and revolute, slider is solved entirely JS-side via
// warm-start + post-solve fixup (`warm-start.ts:applySliderWarmStarts` /
// `applySliderFixup`). The compiler adds **no** slvs constraints — see
// `features-spec/assembly/mate-implementation-pattern.md` for why
// (slvs's POINT_IN_2D entities silently drop connector local Z, which
// breaks position coincidence for any connector authored above/below
// the body's xy plane).
//
// XY-offset validation lives upstream in `lib/features/mate.ts`'s
// `MateBuilder.offset()` so it surfaces at parse time with file/line
// info; the compiler trusts that contract.

import type { CompileCtx } from '../mate-compiler.js';
import type { MateRecord } from '../types.js';

export function compileSlider(_ctx: CompileCtx, _mate: MateRecord): number[] {
  return [];
}
