import { Quaternion, Vector3 } from 'three';

/** Frame attached to a body, expressed in the body's local coordinates. */
export type ConnectorState = {
  connectorId: string;
  localOrigin: Vector3;
  localXDirection: Vector3;
  localNormal: Vector3;
};

/** One rigid body in the solver. Pose is in world space. */
export type BodyState = {
  instanceId: string;
  position: Vector3;
  quaternion: Quaternion;
  grounded: boolean;
  connectors: ConnectorState[];
  /**
   * When true, the body's quaternion params are placed in GROUP_GROUND while
   * its origin params stay in GROUP_ACTIVE. The solver treats orientation as
   * a known constant and only solves the body's position. Mate compilers
   * (e.g. fastened) flip this on for follower bodies whose orientation is
   * fully determined by a "driver" body's pose, after the controller has
   * pre-set the right quaternion via warm-start.
   */
  lockOrientation?: boolean;
  /**
   * When true, the body's origin params are placed in GROUP_GROUND too.
   * Set on fastened-mate followers whose full pose (origin + orientation) is
   * fully determined by the driver. The solver then doesn't move the body at
   * all, and a post-solve fixup writes the follower's pose from the actual
   * solved driver pose.
   */
  lockPosition?: boolean;
};

/**
 * Mate compilation lands in phases 06+. Kept here so phase 05's solver can
 * accept an empty array now and not change shape later.
 */
export type MateRecord = {
  mateId: string;
  type: 'fastened' | 'revolute' | 'slider' | 'cylindrical' | 'planar' | 'parallel' | 'pin-slot';
  connectorA: { instanceId: string; connectorId: string };
  connectorB: { instanceId: string; connectorId: string };
  options?: { rotate?: number; flip?: boolean; offset?: [number, number, number] };
};

export type SolverInput = {
  bodies: BodyState[];
  mates: MateRecord[];
  /** When set, the solver translates this body so its origin tracks `draggedTargetOrigin`. */
  draggedInstanceId?: string;
  /**
   * World-space target for the dragged body's origin. Caller is responsible
   * for converting "cursor world point" to "body origin" using a grab offset
   * captured at drag-start (`origin_start - grab_start`); the solver does
   * not re-derive it. This avoids the offset drifting as the body moves
   * across successive solves.
   *
   * Used by free-body slvs `dragged[]` pinning. Mate-aware drag handlers
   * use `draggedCursorWorld` + `draggedGrabLocal` instead — see those
   * fields for why.
   */
  draggedTargetOrigin?: Vector3;
  /**
   * Raw cursor world position on the drag plane. JS-side mate handlers
   * (warm-start) read this together with `draggedGrabLocal` so the
   * rotation they apply makes the *grab point* track the cursor.
   *
   * Why not just `draggedTargetOrigin`? Because deriving rotation from
   * body-origin motion produces the wrong sign whenever the grab is on
   * the opposite side of the pivot from the body origin. Using the
   * grab point's world position as the "from" of the rotation arc is
   * the only formulation that's sign-correct everywhere.
   */
  draggedCursorWorld?: Vector3;
  /**
   * The grabbed point in the dragged body's *local* frame, captured at
   * drag-start. Combined with the body's live pose this gives the
   * grab point's current world position, which mate-aware drag handlers
   * use as the "from" of the rotation arc.
   */
  draggedGrabLocal?: Vector3;
};

export type SolverResult = 'okay' | 'inconsistent' | 'didnt-converge' | 'too-many-unknowns';

export type SolvedBody = {
  instanceId: string;
  position: Vector3;
  quaternion: Quaternion;
};

export type SolverOutput = {
  bodies: SolvedBody[];
  result: SolverResult;
  dof: number;
  failed: string[];
};
