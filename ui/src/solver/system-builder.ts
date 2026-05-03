// Translates a SolverInput into a populated solvespace System.
//
// Layout (per body):
//   - 3 origin params (px, py, pz)
//   - 4 quaternion params (qw, qx, qy, qz)
//   - POINT_IN_3D entity referencing the origin params
//   - NORMAL_IN_3D entity referencing the quaternion params
//   - WORKPLANE entity referencing point + normal
//
// Per connector on body i (only when local Z ≈ 0):
//   - 2 POINT_IN_2D params (u, v) in workplane i
//   - 1 NORMAL_IN_3D entity (separate quat params) — the connector's world
//     orientation. Placed in group 1 so it's a known; phase 06+ adds
//     constraints relating connectors that need orientation.
//
// Group assignment:
//   - Grounded body params → group 1 (fixed by the solver).
//   - Ungrounded body params → group 2 (active group; what Slvs_Solve solves).
//   - Connector-local constants (u, v, connector quat) → group 1 always.
//
// Phase 05 adds no constraints to the system. Phase 06+ will reference
// connector entity handles by (instanceId, connectorId) via BodyHandles.

import { Quaternion, Vector3 } from 'three';
import { ConnectorState, SolverInput } from './types.js';
import type { SolveSpaceApi } from './solvespace-loader.js';

export const GROUP_GROUND = 1;
export const GROUP_ACTIVE = 2;

export type ParamHandle = number;
export type EntityHandle = number;

export type ConnectorHandles = {
  connectorId: string;
  /** Workplane-local 2D point referencing (u, v) params. */
  point: EntityHandle;
  /** World-space normal entity (4 quat params, fixed in group 1 — phase 05). */
  normal: EntityHandle;
  /** Param handles for the connector's u, v in the body's workplane. */
  uvParams: [ParamHandle, ParamHandle];
};

export type BodyHandles = {
  instanceId: string;
  /** Param handles for px, py, pz. */
  originParams: [ParamHandle, ParamHandle, ParamHandle];
  /** Param handles for qw, qx, qy, qz. */
  quatParams: [ParamHandle, ParamHandle, ParamHandle, ParamHandle];
  point: EntityHandle;
  normal: EntityHandle;
  workplane: EntityHandle;
  grounded: boolean;
  connectors: ConnectorHandles[];
};

export type BuiltSystem = {
  sys: any;
  bodies: BodyHandles[];
  /** Sum of group-2 free params minus the implicit unit-norm constraint count.
   *  Used as a hint; the real DOF comes back from `Slvs_Solve`. */
  expectedFreeParams: number;
};

const Z_EPS = 1e-9;

/**
 * Walks the input and returns a fresh, fully-populated System ready to solve.
 * The handle tables let the caller (drag setup, mate compilation) reach back
 * into specific params/entities without re-walking the input.
 */
export function buildSystem(api: SolveSpaceApi, input: SolverInput): BuiltSystem {
  const sys = new api.System(api.module);
  const bodies: BodyHandles[] = [];
  let nextH = 1;
  const newH = () => nextH++;

  let expectedFreeParams = 0;

  for (const body of input.bodies) {
    const group = body.grounded ? GROUP_GROUND : GROUP_ACTIVE;
    if (!body.grounded) {
      // 3 origin params + 4 quat params, but quaternion has an implicit
      // unit-norm constraint, costing 1 DOF. So contributes 6 free DOFs.
      expectedFreeParams += 6;
    }

    const px = sys.addParam(newH(), group, body.position.x);
    const py = sys.addParam(newH(), group, body.position.y);
    const pz = sys.addParam(newH(), group, body.position.z);
    const point = sys.addPoint3d(newH(), group, px, py, pz);

    // Three.js Quaternion is (x, y, z, w); libslvs is (w, x, y, z).
    const qw = sys.addParam(newH(), group, body.quaternion.w);
    const qx = sys.addParam(newH(), group, body.quaternion.x);
    const qy = sys.addParam(newH(), group, body.quaternion.y);
    const qz = sys.addParam(newH(), group, body.quaternion.z);
    const normal = sys.addNormal3d(newH(), group, qw, qx, qy, qz);

    const workplane = sys.addWorkplane(newH(), group, point, normal);

    const connectorHandles: ConnectorHandles[] = [];
    for (const c of body.connectors) {
      const handles = addConnectorEntities(sys, api, workplane, c, newH);
      connectorHandles.push(handles);
    }

    bodies.push({
      instanceId: body.instanceId,
      originParams: [px, py, pz],
      quatParams: [qw, qx, qy, qz],
      point,
      normal,
      workplane,
      grounded: body.grounded,
      connectors: connectorHandles,
    });
  }

  // Phase 05 adds no constraints. Phase 06+ will iterate input.mates here.
  return { sys, bodies, expectedFreeParams };
}

function addConnectorEntities(
  sys: any,
  api: SolveSpaceApi,
  workplane: EntityHandle,
  c: ConnectorState,
  newH: () => number,
): ConnectorHandles {
  // Connector params live in group 1 — they're constants relative to the
  // body, not solver unknowns. The body's own params drive how the connector
  // moves in world space (via the workplane reference).
  if (Math.abs(c.localOrigin.z) > Z_EPS) {
    // Phase 05 limitation: connectors with non-zero local Z are projected
    // onto the body's workplane. Mates wiring is unaffected for phase 06's
    // fastened/coplanar-coincident cases; phase 06+ will revisit.
  }
  const u = sys.addParam(newH(), GROUP_GROUND, c.localOrigin.x);
  const v = sys.addParam(newH(), GROUP_GROUND, c.localOrigin.y);
  const point = sys.addPoint2d(newH(), GROUP_GROUND, workplane, u, v);

  // Connector's world-orientation quaternion.
  // localXDirection and localNormal are in body-local coords.
  const [qw, qx, qy, qz] = api.makeQuaternion(
    api.module,
    c.localXDirection.x, c.localXDirection.y, c.localXDirection.z,
    crossX(c.localNormal, c.localXDirection),
    crossY(c.localNormal, c.localXDirection),
    crossZ(c.localNormal, c.localXDirection),
  );
  const pw = sys.addParam(newH(), GROUP_GROUND, qw);
  const px = sys.addParam(newH(), GROUP_GROUND, qx);
  const py = sys.addParam(newH(), GROUP_GROUND, qy);
  const pz = sys.addParam(newH(), GROUP_GROUND, qz);
  const normal = sys.addNormal3d(newH(), GROUP_GROUND, pw, px, py, pz);

  return {
    connectorId: c.connectorId,
    point,
    normal,
    uvParams: [u, v],
  };
}

// Inline cross-product helpers — Slvs_MakeQuaternion takes the U axis and
// the V axis as 6 doubles, so we synthesize V = N × U inside the solver
// builder rather than allocating a Vector3. Keeps the Three.js Vector3
// API away from the wasm marshaling.
function crossX(n: Vector3, u: Vector3): number { return n.y * u.z - n.z * u.y; }
function crossY(n: Vector3, u: Vector3): number { return n.z * u.x - n.x * u.z; }
function crossZ(n: Vector3, u: Vector3): number { return n.x * u.y - n.y * u.x; }

/**
 * Read body poses back from a solved system into BodyState.position/quaternion
 * shape. Returns the same {instanceId, position, quaternion} list, in input
 * order, so callers can map outputs by index without re-checking ids.
 */
export function readBackPoses(
  built: BuiltSystem,
): { instanceId: string; position: Vector3; quaternion: Quaternion }[] {
  const sys = built.sys;
  return built.bodies.map(handles => {
    const px = sys.getParam(handles.originParams[0]);
    const py = sys.getParam(handles.originParams[1]);
    const pz = sys.getParam(handles.originParams[2]);
    const qw = sys.getParam(handles.quatParams[0]);
    const qx = sys.getParam(handles.quatParams[1]);
    const qy = sys.getParam(handles.quatParams[2]);
    const qz = sys.getParam(handles.quatParams[3]);
    // Three.js Quaternion ctor takes (x, y, z, w).
    const q = new Quaternion(qx, qy, qz, qw);
    // Defensive normalize — solvespace generally keeps unit norm but tiny
    // numerical drift can creep in. Three.js multiplies use the bare
    // values, so a sub-unit quaternion would bleed scale into the next solve.
    q.normalize();
    return {
      instanceId: handles.instanceId,
      position: new Vector3(px, py, pz),
      quaternion: q,
    };
  });
}
