// Per-mate residual functions for the LM relaxation pass.
//
// A residual function takes the current pose of two bodies (driver and
// follower) and returns a vector that's zero iff the mate is satisfied.
// Higher residual norm = more violation. The LM driver minimizes the
// sum of squares across all residuals in a loop component.
//
// Residuals are pure: same input → same output, no scene-graph state,
// no slvs. They're reused both as the LM cost (during relaxation) and
// as a post-LM consistency check (for the joints panel red dots in
// stage 5).
//
// Stage 2 ships only `residualRevolute` and `residualDrag`; later
// stages add fastened, slider, cylindrical, planar.

import { Vector3 } from 'three';
import type { BodyState, ConnectorState } from './types.js';

export type MateOptions = {
  rotate?: number;
  flip?: boolean;
  offset?: [number, number, number];
};

/**
 * Revolute residual (5 components):
 *   [0..2] position: follower-connector world origin minus driver-connector
 *          world origin (with optional offset). Zero iff origins coincide.
 *   [3..4] axis parallelism: projection of follower-connector world Z onto
 *          the driver's connector X and Y axes. Zero iff fZ is parallel
 *          (or anti-parallel) to dZ.
 *
 * The 2D parallelism residual is satisfied for both `fZ = +dZ` (flip)
 * and `fZ = -dZ` (face-to-face). Chirality is set by the warm-start
 * before LM runs; LM stays on whichever side it's already on because
 * the gradient pulls toward the nearest minimum.
 */
export function residualRevolute(
  driver: BodyState,
  follower: BodyState,
  driverConn: ConnectorState,
  followerConn: ConnectorState,
  options: MateOptions = {},
): number[] {
  const dOriginWorld = driverConn.localOrigin.clone()
    .applyQuaternion(driver.quaternion).add(driver.position);
  const dXWorld = driverConn.localXDirection.clone()
    .applyQuaternion(driver.quaternion).normalize();
  const dZWorld = driverConn.localNormal.clone()
    .applyQuaternion(driver.quaternion).normalize();
  const dYWorld = new Vector3().crossVectors(dZWorld, dXWorld).normalize();

  let target = dOriginWorld;
  if (options.offset) {
    const [ox, oy, oz] = options.offset;
    target = dOriginWorld.clone()
      .addScaledVector(dXWorld, ox)
      .addScaledVector(dYWorld, oy)
      .addScaledVector(dZWorld, oz);
  }

  const fOriginWorld = followerConn.localOrigin.clone()
    .applyQuaternion(follower.quaternion).add(follower.position);
  const fZWorld = followerConn.localNormal.clone()
    .applyQuaternion(follower.quaternion).normalize();

  const dx = fOriginWorld.x - target.x;
  const dy = fOriginWorld.y - target.y;
  const dz = fOriginWorld.z - target.z;
  // Axis parallelism: 2 perpendicular components of fZ in driver basis.
  const ax = fZWorld.dot(dXWorld);
  const ay = fZWorld.dot(dYWorld);
  return [dx, dy, dz, ax, ay];
}

/**
 * Drag residual (3 components): grab world position minus cursor world
 * position. Zero iff the body's grab point sits at the cursor target.
 *
 * Used in the LM cost when the dragged body is in a loop component, so
 * the cursor pin enters as a soft constraint that competes with the
 * closure mates. The caller weights this residual (typically 100×) so
 * reachable cursor targets pull to zero while unreachable ones settle
 * for the closest manifold point.
 */
export function residualDrag(
  body: BodyState,
  grabLocal: Vector3,
  cursorWorld: Vector3,
): number[] {
  const grabWorld = grabLocal.clone()
    .applyQuaternion(body.quaternion)
    .add(body.position);
  return [
    grabWorld.x - cursorWorld.x,
    grabWorld.y - cursorWorld.y,
    grabWorld.z - cursorWorld.z,
  ];
}
