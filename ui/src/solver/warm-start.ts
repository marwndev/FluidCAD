// Warm-start + post-solve fixup for fastened mates.
//
// Slvs has no primitive for "Q_B = Q_A · R_fixed", and its 2D-in-workplane
// connector entities project onto the body's xy plane (the connector's
// local Z component is dropped), so POINTS_COINCIDENT can't faithfully
// represent a connector that lives on a face above/below the body's
// origin. Both problems disappear if we keep the fastened follower fully
// outside the solver's hands:
//
//   1. **Warm-start** (pre-solve, `applyFastenedWarmStarts`): pick a
//      driver/follower from each fastened mate, compute the follower's
//      full target pose (origin + quat) analytically, and write it back
//      into the BodyState that buildSystem will consume. Set
//      `lockPosition` and `lockOrientation` so all 7 of the follower's
//      params are placed in GROUP_GROUND — the solver does not touch
//      them, and DOF count is correct (a grounded driver + fastened
//      follower → 0 DOF).
//
//   2. **Fixup** (post-solve, `applyFastenedFixup`): after the solver
//      runs, the driver's pose may have changed (drag, other constraint).
//      Recompute the follower's target from the *solved* driver pose
//      and overwrite `out.bodies[follower]`. State.group then reflects
//      the correct face-to-face relation in every frame.
//
// Driver/follower picking (`pickRoles`):
//   - Two grounded bodies → null (no warm-start; immovable pair, mate is
//     either pre-satisfied or permanently violated).
//   - One grounded → grounded body is driver.
//   - Both free → dragged body is driver if a drag is in flight;
//     otherwise mate-author order picks `connectorA`'s body.
//
// Phase 06 supports trees only. Closed loops or chains require ordering
// the warm-start by graph topology and are deferred.

import { Matrix4, Quaternion, Vector3 } from 'three';
import type { BodyState, ConnectorState, MateRecord, SolvedBody } from './types.js';

/**
 * Revolute warm-start.
 *
 * Like fastened, revolute is solved analytically in JS rather than via
 * slvs. The motivation is the same: slvs's POINT_IN_2D entities project
 * the connector's local Z component to zero, which silently breaks face
 * coincidence for any connector that lives above/below the body's xy
 * plane (top/bottom/side faces — the common case in user-authored parts).
 *
 * Per solve:
 *   1. Pick a driver / follower for each revolute mate.
 *   2. If the follower is being dragged, convert the cursor target into
 *      the corresponding rotation angle about the driver's connector Z
 *      axis. This is what lets the user "spin" the follower with the
 *      mouse without slvs ever seeing a constraint.
 *   3. Recompute the follower's body pose from the (possibly rotated)
 *      orientation so the connector frames meet (face-to-face by default,
 *      back-to-back on `.flip()`, with `.rotate()` as the initial seed
 *      for fresh assemblies).
 *   4. Set `lockPosition` and `lockOrientation` so slvs treats the
 *      follower's params as constants. The 1 free DOF the revolute
 *      contributes is added back to slvs's reported DOF in `Solver.solve()`.
 *
 * The post-solve fixup (`applyRevoluteFixup`) reapplies the analytical
 * relation against the *solved* driver pose so a drag of the driver
 * pulls the follower along.
 */
export type RevoluteDragInfo = {
  draggedInstanceId?: string;
  /** Raw cursor world position on the drag plane. */
  draggedCursorWorld?: Vector3;
  /** Grab point in body-local frame. */
  draggedGrabLocal?: Vector3;
};

export function applyRevoluteWarmStarts(
  bodies: BodyState[],
  mates: MateRecord[],
  drag: RevoluteDragInfo = {},
): void {
  const { draggedInstanceId, draggedCursorWorld, draggedGrabLocal } = drag;
  const byId = new Map(bodies.map(b => [b.instanceId, b]));
  for (const mate of mates) {
    if (mate.type !== 'revolute') continue;
    const aBody = byId.get(mate.connectorA.instanceId);
    const bBody = byId.get(mate.connectorB.instanceId);
    if (!aBody || !bBody) continue;
    const aConn = aBody.connectors.find(c => c.connectorId === mate.connectorA.connectorId);
    const bConn = bBody.connectors.find(c => c.connectorId === mate.connectorB.connectorId);
    if (!aConn || !bConn) continue;

    const roles = pickRoles(aBody, bBody, aConn, bConn, mate, draggedInstanceId);
    if (!roles) continue;
    const { driver, follower, driverConn, followerConn } = roles;
    const options = mate.options ?? {};

    // Initial seed (face-to-face / flipped chirality, plus `.rotate()`
    // angle) only when current pose doesn't satisfy the mate. After that
    // we preserve the orientation across solves so drags are persistent
    // and `.rotate()` truly is a hint, not a snap-back.
    if (!isRevoluteSatisfied(driver, follower, driverConn, followerConn, options)) {
      const seed = computeFastenedTargetPose(driver, driverConn, followerConn, options);
      follower.position = seed.position;
      follower.quaternion = seed.quaternion;
    }

    // Drag of the follower: rotate it about the pivot Z by the angle that
    // makes the *grab point* track the cursor. Using the grab point
    // (rather than body origin) is what gives a sign-correct rotation
    // regardless of which side of the pivot the user grabbed from.
    if (
      draggedCursorWorld
      && draggedGrabLocal
      && draggedInstanceId === follower.instanceId
      && !follower.grounded
    ) {
      rotateFollowerToward(driver, follower, driverConn, draggedCursorWorld, draggedGrabLocal);
    }

    // Re-derive position from the (possibly rotated) orientation so the
    // connector frames truly coincide in world space, regardless of which
    // path set the orientation above.
    follower.position = followerPositionFromOrientation(
      driver, driverConn, followerConn, follower.quaternion, options,
    );

    // Slvs treats revolute followers as constants; the 1 free DOF is
    // added to the reported DOF count by Solver.solve().
    follower.lockPosition = true;
    follower.lockOrientation = true;
  }
}

/**
 * Re-derive each revolute follower's pose from the *solved* driver pose.
 * This is what carries a drag of the driver through to the follower —
 * slvs only saw the driver's params; the follower stayed wherever the
 * warm-start put it. The fixup snaps the follower onto the manifold
 * defined by the now-current driver pose.
 *
 * Runs before the fastened fixup so a chain of revolute → fastened
 * propagates correctly (the fastened side reads the revolute follower's
 * fixed-up pose, not its stale warm-started pose).
 */
export function applyRevoluteFixup(
  inputBodies: BodyState[],
  out: SolvedBody[],
  mates: MateRecord[],
  draggedInstanceId?: string,
): void {
  const inputById = new Map(inputBodies.map(b => [b.instanceId, b]));
  const outById = new Map(out.map(b => [b.instanceId, b]));
  for (const mate of mates) {
    if (mate.type !== 'revolute') continue;
    const aInput = inputById.get(mate.connectorA.instanceId);
    const bInput = inputById.get(mate.connectorB.instanceId);
    if (!aInput || !bInput) continue;
    const aConn = aInput.connectors.find(c => c.connectorId === mate.connectorA.connectorId);
    const bConn = bInput.connectors.find(c => c.connectorId === mate.connectorB.connectorId);
    if (!aConn || !bConn) continue;

    const roles = pickRoles(aInput, bInput, aConn, bConn, mate, draggedInstanceId);
    if (!roles) continue;
    const driverOut = outById.get(roles.driver.instanceId);
    const followerOut = outById.get(roles.follower.instanceId);
    if (!driverOut || !followerOut) continue;

    const driverState: BodyState = {
      ...roles.driver,
      position: driverOut.position,
      quaternion: driverOut.quaternion,
    };
    // Keep the follower's solved orientation (which equals warm-start's
    // because we locked it) and re-derive position from the driver's
    // possibly-updated pose.
    followerOut.position = followerPositionFromOrientation(
      driverState, roles.driverConn, roles.followerConn, followerOut.quaternion,
      mate.options ?? {},
    );
  }
}

const REVOLUTE_EPS = 1e-4;

function isRevoluteSatisfied(
  driver: BodyState,
  follower: BodyState,
  driverConn: ConnectorState,
  followerConn: ConnectorState,
  options: { rotate?: number; flip?: boolean; offset?: [number, number, number] },
): boolean {
  const dOriginWorld = driverConn.localOrigin.clone()
    .applyQuaternion(driver.quaternion).add(driver.position);
  const dZWorld = driverConn.localNormal.clone()
    .applyQuaternion(driver.quaternion).normalize();
  const fOriginWorld = followerConn.localOrigin.clone()
    .applyQuaternion(follower.quaternion).add(follower.position);
  const fZWorld = followerConn.localNormal.clone()
    .applyQuaternion(follower.quaternion).normalize();

  let target = dOriginWorld.clone();
  if (options.offset) {
    const dXWorld = driverConn.localXDirection.clone()
      .applyQuaternion(driver.quaternion).normalize();
    const dYWorld = new Vector3().crossVectors(dZWorld, dXWorld).normalize();
    const [ox, oy, oz] = options.offset;
    target.addScaledVector(dXWorld, ox)
      .addScaledVector(dYWorld, oy)
      .addScaledVector(dZWorld, oz);
  }

  if (fOriginWorld.distanceTo(target) > REVOLUTE_EPS) return false;
  // The two valid chiralities (parallel vs anti-parallel Z) both count as
  // satisfied here — the chirality is set by the initial seed and
  // preserved by the warm-start preserving the follower's quaternion.
  return Math.abs(Math.abs(fZWorld.dot(dZWorld)) - 1) < REVOLUTE_EPS;
}

/**
 * Rotate the follower about the driver-connector Z axis by the angle
 * that makes the *grab point* track the cursor.
 *
 * Why grab point and not body origin: when the user clicks on a part
 * far from the body's coordinate origin (e.g., the right-hand end of a
 * long bar mated at its center), the body origin and the grab point
 * are on opposite sides of the pivot. A rotation that moves the body
 * origin to "cursor + grabOffset" then moves the grab point in the
 * *opposite* direction along its arc — visibly rotating the body the
 * wrong way under the cursor. Measuring the angle from the grab
 * point's current world position to the cursor's world position
 * eliminates this sign error regardless of where on the body the user
 * grabbed.
 */
function rotateFollowerToward(
  driver: BodyState,
  follower: BodyState,
  driverConn: ConnectorState,
  cursorWorld: Vector3,
  grabLocal: Vector3,
): void {
  const pivot = driverConn.localOrigin.clone()
    .applyQuaternion(driver.quaternion).add(driver.position);
  const axis = driverConn.localNormal.clone()
    .applyQuaternion(driver.quaternion).normalize();

  const grabWorld = grabLocal.clone()
    .applyQuaternion(follower.quaternion).add(follower.position);
  const fromVec = grabWorld.sub(pivot);
  const fromInPlane = fromVec.clone()
    .sub(axis.clone().multiplyScalar(fromVec.dot(axis)));
  const toVec = cursorWorld.clone().sub(pivot);
  const toInPlane = toVec.clone()
    .sub(axis.clone().multiplyScalar(toVec.dot(axis)));

  if (fromInPlane.length() < 1e-9 || toInPlane.length() < 1e-9) {
    return;
  }
  fromInPlane.normalize();
  toInPlane.normalize();

  const cos = Math.min(1, Math.max(-1, fromInPlane.dot(toInPlane)));
  const cross = new Vector3().crossVectors(fromInPlane, toInPlane);
  // Sign of the angle: positive when cross is in the +axis direction.
  const sin = cross.dot(axis);
  const angle = Math.atan2(sin, cos);
  if (Math.abs(angle) < 1e-9) return;

  const dq = new Quaternion().setFromAxisAngle(axis, angle);
  follower.quaternion = dq.multiply(follower.quaternion);
}

/**
 * Returns the follower body position that would make follower-connector
 * world position equal to (driver-connector world position + offset),
 * given a fixed follower orientation.
 */
function followerPositionFromOrientation(
  driver: BodyState,
  driverConn: ConnectorState,
  followerConn: ConnectorState,
  followerQuat: Quaternion,
  options: { rotate?: number; flip?: boolean; offset?: [number, number, number] },
): Vector3 {
  const dOriginWorld = driverConn.localOrigin.clone()
    .applyQuaternion(driver.quaternion).add(driver.position);
  let target = dOriginWorld.clone();
  if (options.offset) {
    const dZWorld = driverConn.localNormal.clone()
      .applyQuaternion(driver.quaternion).normalize();
    const dXWorld = driverConn.localXDirection.clone()
      .applyQuaternion(driver.quaternion).normalize();
    const dYWorld = new Vector3().crossVectors(dZWorld, dXWorld).normalize();
    const [ox, oy, oz] = options.offset;
    target.addScaledVector(dXWorld, ox)
      .addScaledVector(dYWorld, oy)
      .addScaledVector(dZWorld, oz);
  }
  return target.clone().sub(
    followerConn.localOrigin.clone().applyQuaternion(followerQuat),
  );
}

/**
 * Mutates each follower body in `bodies` so its pose is consistent with
 * its driver's pose under the fastened mate semantics. Sets
 * `lockOrientation = true` on every follower so the solver freezes its
 * quaternion params.
 */
export function applyFastenedWarmStarts(
  bodies: BodyState[],
  mates: MateRecord[],
  draggedInstanceId?: string,
): void {
  const byId = new Map(bodies.map(b => [b.instanceId, b]));
  for (const mate of mates) {
    if (mate.type !== 'fastened') continue;
    const aBody = byId.get(mate.connectorA.instanceId);
    const bBody = byId.get(mate.connectorB.instanceId);
    if (!aBody || !bBody) continue;
    const aConn = aBody.connectors.find(c => c.connectorId === mate.connectorA.connectorId);
    const bConn = bBody.connectors.find(c => c.connectorId === mate.connectorB.connectorId);
    if (!aConn || !bConn) continue;

    const roles = pickRoles(
      aBody, bBody, aConn, bConn, mate, draggedInstanceId,
    );
    if (!roles) continue;
    const { driver, follower, driverConn, followerConn } = roles;

    const target = computeFastenedTargetPose(
      driver, driverConn, followerConn, mate.options ?? {},
    );
    follower.position = target.position;
    follower.quaternion = target.quaternion;
    follower.lockPosition = true;
    follower.lockOrientation = true;
  }
}

/**
 * After the solver runs, the driver's pose may have moved (a drag pin or
 * another constraint resolved its position). Recompute each follower's
 * pose from the SOLVED driver pose and overwrite the corresponding entry
 * in `out`. This is what keeps a fastened pair rigid during a drag — the
 * follower tracks the driver every frame, regardless of whether slvs
 * happened to look at the constraint.
 */
export function applyFastenedFixup(
  inputBodies: BodyState[],
  out: SolvedBody[],
  mates: MateRecord[],
  draggedInstanceId?: string,
): void {
  const inputById = new Map(inputBodies.map(b => [b.instanceId, b]));
  const outById = new Map(out.map(b => [b.instanceId, b]));
  for (const mate of mates) {
    if (mate.type !== 'fastened') continue;
    const aInput = inputById.get(mate.connectorA.instanceId);
    const bInput = inputById.get(mate.connectorB.instanceId);
    if (!aInput || !bInput) continue;
    const aConn = aInput.connectors.find(c => c.connectorId === mate.connectorA.connectorId);
    const bConn = bInput.connectors.find(c => c.connectorId === mate.connectorB.connectorId);
    if (!aConn || !bConn) continue;

    const roles = pickRoles(aInput, bInput, aConn, bConn, mate, draggedInstanceId);
    if (!roles) continue;
    const driverOut = outById.get(roles.driver.instanceId);
    const followerOut = outById.get(roles.follower.instanceId);
    if (!driverOut || !followerOut) continue;

    // Re-derive the follower's pose from the driver's solved pose. The
    // driver's solved pose may differ from its input pose if a drag pin
    // or another constraint moved it.
    const driverState: BodyState = {
      ...roles.driver,
      position: driverOut.position,
      quaternion: driverOut.quaternion,
    };
    const target = computeFastenedTargetPose(
      driverState, roles.driverConn, roles.followerConn, mate.options ?? {},
    );
    followerOut.position = target.position;
    followerOut.quaternion = target.quaternion;
  }
}

type Roles = {
  driver: BodyState;
  follower: BodyState;
  driverConn: ConnectorState;
  followerConn: ConnectorState;
};

function pickRoles(
  aBody: BodyState,
  bBody: BodyState,
  aConn: ConnectorState,
  bConn: ConnectorState,
  _mate: MateRecord,
  draggedInstanceId?: string,
): Roles | null {
  // Grounded bodies are immovable and must always be drivers. Two grounded
  // bodies have nothing to warm-start (the mate is either pre-satisfied or
  // permanently violated; the latter is detected separately).
  if (aBody.grounded && bBody.grounded) {
    return null;
  }
  if (aBody.grounded) {
    return { driver: aBody, follower: bBody, driverConn: aConn, followerConn: bConn };
  }
  if (bBody.grounded) {
    return { driver: bBody, follower: aBody, driverConn: bConn, followerConn: aConn };
  }
  // Neither grounded: the dragged body is the driver, since the user is
  // steering it. With no drag, mate-author order picks A as driver.
  if (draggedInstanceId === bBody.instanceId) {
    return { driver: bBody, follower: aBody, driverConn: bConn, followerConn: aConn };
  }
  return { driver: aBody, follower: bBody, driverConn: aConn, followerConn: bConn };
}

/**
 * Compute the follower body's world pose (origin + quat) so that the
 * follower's connector lines up face-to-face with the driver's connector,
 * with optional rotate / flip / offset applied.
 */
export function computeFastenedTargetPose(
  driver: BodyState,
  driverConn: ConnectorState,
  followerConn: ConnectorState,
  options: { rotate?: number; flip?: boolean; offset?: [number, number, number] },
): { position: Vector3; quaternion: Quaternion } {
  // Driver's connector world frame.
  const dOriginWorld = driverConn.localOrigin.clone()
    .applyQuaternion(driver.quaternion)
    .add(driver.position);
  const dXWorld = driverConn.localXDirection.clone()
    .applyQuaternion(driver.quaternion).normalize();
  const dZWorld = driverConn.localNormal.clone()
    .applyQuaternion(driver.quaternion).normalize();
  const dYWorld = new Vector3().crossVectors(dZWorld, dXWorld).normalize();

  // Optional offset: shift the target origin in the driver-connector frame.
  let targetOriginWorld = dOriginWorld.clone();
  if (options.offset) {
    const [ox, oy, oz] = options.offset;
    targetOriginWorld
      .addScaledVector(dXWorld, ox)
      .addScaledVector(dYWorld, oy)
      .addScaledVector(dZWorld, oz);
  }

  // Default fastened semantics is face-to-face: follower's Z = -driver's Z.
  // .flip() toggles to back-to-back (Z parallel) for cases where the user
  // explicitly wants that.
  const faceToFace = !options.flip;
  const targetZ = faceToFace ? dZWorld.clone().negate() : dZWorld.clone();

  // Rotate driver X around the driver Z axis by `rotate` degrees. The
  // follower's X should land there. Rotating around dZ rather than targetZ
  // matches Onshape semantics — flip is "anti-parallel Z" only, not a
  // re-axis of the rotation.
  let targetX = dXWorld.clone();
  if (options.rotate) {
    targetX.applyAxisAngle(dZWorld, options.rotate * Math.PI / 180);
  }
  // Re-orthogonalize against targetZ in case targetZ flipped the chirality.
  targetX.sub(targetZ.clone().multiplyScalar(targetX.dot(targetZ))).normalize();
  const targetY = new Vector3().crossVectors(targetZ, targetX).normalize();

  const targetMatrix = new Matrix4().makeBasis(targetX, targetY, targetZ);

  // Follower's local frame as a basis matrix.
  const fLocalY = new Vector3().crossVectors(followerConn.localNormal, followerConn.localXDirection).normalize();
  const fLocalMatrix = new Matrix4().makeBasis(
    followerConn.localXDirection.clone().normalize(),
    fLocalY,
    followerConn.localNormal.clone().normalize(),
  );

  // body_quat = target_world * follower_local^(-1) (rotation transpose).
  const fLocalInverse = fLocalMatrix.clone().transpose();
  const bodyMatrix = new Matrix4().multiplyMatrices(targetMatrix, fLocalInverse);
  const bodyQuat = new Quaternion().setFromRotationMatrix(bodyMatrix);

  // body_pos = target_origin - body_quat · follower.localOrigin.
  const localOriginRotated = followerConn.localOrigin.clone().applyQuaternion(bodyQuat);
  const bodyPos = targetOriginWorld.clone().sub(localOriginRotated);

  return { position: bodyPos, quaternion: bodyQuat };
}
