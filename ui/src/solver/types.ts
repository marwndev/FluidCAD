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
   */
  draggedTargetOrigin?: Vector3;
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
