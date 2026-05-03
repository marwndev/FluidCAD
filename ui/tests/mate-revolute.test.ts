import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  Solver,
  type BodyState,
  type ConnectorState,
  type MateRecord,
} from '../src/solver';

const ID = (n: number) => `b${n}`;

function flatConnector(connectorId: string, ox = 0, oy = 0): ConnectorState {
  return {
    connectorId,
    localOrigin: new Vector3(ox, oy, 0),
    localXDirection: new Vector3(1, 0, 0),
    localNormal: new Vector3(0, 0, 1),
  };
}

function body(
  instanceId: string,
  grounded: boolean,
  position: Vector3,
  connectors: ConnectorState[],
): BodyState {
  return {
    instanceId,
    position,
    quaternion: new Quaternion(),
    grounded,
    connectors,
  };
}

function revolute(
  a: { i: string; c: string },
  b: { i: string; c: string },
  options?: MateRecord['options'],
): MateRecord {
  return {
    mateId: `${a.i}:${a.c}->${b.i}:${b.c}`,
    type: 'revolute',
    connectorA: { instanceId: a.i, connectorId: a.c },
    connectorB: { instanceId: b.i, connectorId: b.c },
    options,
  };
}

describe('mate(revolute) — phase 07', () => {
  it('grounded + free body, revolute mate → 1 DOF', async () => {
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        body(ID(0), true, new Vector3(0, 0, 0), [flatConnector('c0')]),
        body(ID(1), false, new Vector3(50, 30, 0), [flatConnector('c1')]),
      ],
      mates: [revolute({ i: ID(0), c: 'c0' }, { i: ID(1), c: 'c1' })],
    });
    expect(out.result).toBe('okay');
    expect(out.dof).toBe(1);
  });

  it('connector origins coincide after solve', async () => {
    const a = flatConnector('c0', 2, 3);
    const b = flatConnector('c1', -1, 4);
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        body(ID(0), true, new Vector3(0, 0, 0), [a]),
        body(ID(1), false, new Vector3(50, 0, 0), [b]),
      ],
      mates: [revolute({ i: ID(0), c: 'c0' }, { i: ID(1), c: 'c1' })],
    });
    expect(out.result).toBe('okay');
    const sa = out.bodies.find(o => o.instanceId === ID(0))!;
    const sb = out.bodies.find(o => o.instanceId === ID(1))!;
    const aWorld = a.localOrigin.clone().applyQuaternion(sa.quaternion).add(sa.position);
    const bWorld = b.localOrigin.clone().applyQuaternion(sb.quaternion).add(sb.position);
    expect(bWorld.distanceTo(aWorld)).toBeLessThan(1e-5);
  });

  it('connector Z axes are parallel after solve', async () => {
    const a = flatConnector('c0');
    const b = flatConnector('c1');
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        body(ID(0), true, new Vector3(0, 0, 0), [a]),
        body(ID(1), false, new Vector3(50, 0, 30), [b]),
      ],
      mates: [revolute({ i: ID(0), c: 'c0' }, { i: ID(1), c: 'c1' })],
    });
    expect(out.result).toBe('okay');
    const sa = out.bodies.find(o => o.instanceId === ID(0))!;
    const sb = out.bodies.find(o => o.instanceId === ID(1))!;
    const aZ = a.localNormal.clone().applyQuaternion(sa.quaternion);
    const bZ = b.localNormal.clone().applyQuaternion(sb.quaternion);
    // PARALLEL allows either sign; default warm-start picks face-to-face.
    expect(Math.abs(Math.abs(aZ.dot(bZ)) - 1)).toBeLessThan(1e-5);
  });

  it('two free bodies + revolute → 7 DOF (12 - 5)', async () => {
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        body(ID(0), false, new Vector3(0, 0, 0), [flatConnector('c0')]),
        body(ID(1), false, new Vector3(50, 0, 0), [flatConnector('c1')]),
      ],
      mates: [revolute({ i: ID(0), c: 'c0' }, { i: ID(1), c: 'c1' })],
    });
    expect(out.result).toBe('okay');
    expect(out.dof).toBe(7);
  });

  it('drag from either end of a centered bar rotates the same direction', async () => {
    // The reverse-rotation bug: a long bar with the connector at body
    // center, mated revolute at world origin. Grabbing the +x end and
    // dragging cursor +y should rotate the bar CCW; grabbing the -x end
    // and dragging cursor +y should rotate the bar CW. Pre-fix, the
    // body-origin formulation gave the same sign for both ends because
    // the grab point's arc direction wasn't considered.
    //
    // Concretely: drag-of-grab-+y should rotate the GRAB POINT in the
    // +y direction along its arc. The other end then moves in -y. Grab
    // direction differs → rotation sign differs.
    const solver = new Solver();
    await solver.ensureReady();
    // Bar from (-L, 0, 0) to (L, 0, 0), connector at body center
    // (which equals body origin for this test).
    const L = 10;
    const flat: ConnectorState = {
      connectorId: 'mid',
      localOrigin: new Vector3(0, 0, 0),
      localXDirection: new Vector3(1, 0, 0),
      localNormal: new Vector3(0, 0, 1),
    };

    // Driver bar grounded at origin, follower bar grounded somewhere else
    // (we use the follower for the rotation test).
    const dragOnce = (grabLocal: Vector3, cursorWorld: Vector3) => {
      return solver.solve({
        bodies: [
          { instanceId: 'A', position: new Vector3(0, 0, 0), quaternion: new Quaternion(), grounded: true, connectors: [flat] },
          { instanceId: 'B', position: new Vector3(0, 0, 0), quaternion: new Quaternion(), grounded: false, connectors: [flat] },
        ],
        mates: [{
          mateId: 'm1', type: 'revolute',
          connectorA: { instanceId: 'A', connectorId: 'mid' },
          connectorB: { instanceId: 'B', connectorId: 'mid' },
        }],
        draggedInstanceId: 'B',
        draggedCursorWorld: cursorWorld,
        draggedGrabLocal: grabLocal,
      });
    };

    // Grab the +x end, drag cursor up in +y. Expected: B rotates CCW
    // about Z so the grab point moves +y. After rotation, grab world
    // should be in the +y half-plane.
    const outRight = dragOnce(new Vector3(L, 0, 0), new Vector3(L, 5, 0));
    const bRight = outRight.bodies.find(o => o.instanceId === 'B')!;
    const grabRightWorld = new Vector3(L, 0, 0).applyQuaternion(bRight.quaternion).add(bRight.position);
    expect(grabRightWorld.y).toBeGreaterThan(0);

    // Grab the -x end, drag cursor up in +y. Expected: B rotates CW so
    // the grab point moves +y. After rotation, grab world (which started
    // at -x) should be in the +y half-plane and -x quadrant.
    const outLeft = dragOnce(new Vector3(-L, 0, 0), new Vector3(-L, 5, 0));
    const bLeft = outLeft.bodies.find(o => o.instanceId === 'B')!;
    const grabLeftWorld = new Vector3(-L, 0, 0).applyQuaternion(bLeft.quaternion).add(bLeft.position);
    expect(grabLeftWorld.y).toBeGreaterThan(0);

    // Sanity check: the rotations are *opposite* signs (one CCW, one CW)
    // because the grab points are on opposite sides of the pivot.
    // Reading the body's qz (about world Z) gives the rotation sign
    // when the rotation axis is +Z.
    expect(bRight.quaternion.z * bLeft.quaternion.z).toBeLessThan(0);
  });

  it('default warm-starts face-to-face (Z anti-parallel)', async () => {
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        body(ID(0), true, new Vector3(0, 0, 0), [flatConnector('c0')]),
        body(ID(1), false, new Vector3(50, 0, 0), [flatConnector('c1')]),
      ],
      mates: [revolute({ i: ID(0), c: 'c0' }, { i: ID(1), c: 'c1' })],
    });
    expect(out.result).toBe('okay');
    const sa = out.bodies.find(o => o.instanceId === ID(0))!;
    const sb = out.bodies.find(o => o.instanceId === ID(1))!;
    const aZ = new Vector3(0, 0, 1).applyQuaternion(sa.quaternion);
    const bZ = new Vector3(0, 0, 1).applyQuaternion(sb.quaternion);
    // Default revolute warm-start is face-to-face (anti-parallel), matching
    // fastened. Slvs's PARALLEL preserves whichever sign the warm-start chose.
    expect(bZ.dot(aZ)).toBeCloseTo(-1, 4);
  });

  it('flip() warm-starts back-to-back (Z parallel)', async () => {
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        body(ID(0), true, new Vector3(0, 0, 0), [flatConnector('c0')]),
        body(ID(1), false, new Vector3(50, 0, 0), [flatConnector('c1')]),
      ],
      mates: [
        revolute({ i: ID(0), c: 'c0' }, { i: ID(1), c: 'c1' }, { flip: true }),
      ],
    });
    expect(out.result).toBe('okay');
    const sa = out.bodies.find(o => o.instanceId === ID(0))!;
    const sb = out.bodies.find(o => o.instanceId === ID(1))!;
    const aZ = new Vector3(0, 0, 1).applyQuaternion(sa.quaternion);
    const bZ = new Vector3(0, 0, 1).applyQuaternion(sb.quaternion);
    expect(bZ.dot(aZ)).toBeCloseTo(1, 4);
  });

  it('offset(0, 0, 5) gaps the bodies along the shared Z', async () => {
    // The JS-side warm-start handles offset analytically (the slvs
    // POINT_IN_2D limitation that previously dropped this is bypassed —
    // revolute no longer goes through slvs constraints).
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        body(ID(0), true, new Vector3(0, 0, 0), [flatConnector('c0')]),
        body(ID(1), false, new Vector3(50, 0, 0), [flatConnector('c1')]),
      ],
      mates: [
        revolute({ i: ID(0), c: 'c0' }, { i: ID(1), c: 'c1' }, { offset: [0, 0, 5] }),
      ],
    });
    expect(out.result).toBe('okay');
    const sa = out.bodies.find(o => o.instanceId === ID(0))!;
    const sb = out.bodies.find(o => o.instanceId === ID(1))!;
    const aWorld = new Vector3(0, 0, 0).applyQuaternion(sa.quaternion).add(sa.position);
    const bWorld = new Vector3(0, 0, 0).applyQuaternion(sb.quaternion).add(sb.position);
    expect(bWorld.distanceTo(aWorld)).toBeCloseTo(5, 4);
  });

  it('top-face connectors meet face-to-face in world (no Z-projection bug)', async () => {
    // Reproduces the user-reported issue: two boxes 10x10x10 with a
    // connector on the top face. Default revolute should put them face-to-
    // face with the connector world positions coincident — not offset by
    // 20 in Z (the slvs POINT_IN_2D Z-projection bug that motivated
    // moving revolute to JS-side handling).
    const topConnector: ConnectorState = {
      connectorId: 'top',
      localOrigin: new Vector3(5, 5, 10),
      localXDirection: new Vector3(1, 0, 0),
      localNormal: new Vector3(0, 0, 1),
    };
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        { instanceId: 'A', position: new Vector3(0, 0, 0), quaternion: new Quaternion(), grounded: true, connectors: [topConnector] },
        { instanceId: 'B', position: new Vector3(200, 0, 0), quaternion: new Quaternion(), grounded: false, connectors: [topConnector] },
      ],
      mates: [{
        mateId: 'm1', type: 'revolute',
        connectorA: { instanceId: 'A', connectorId: 'top' },
        connectorB: { instanceId: 'B', connectorId: 'top' },
      }],
    });
    expect(out.result).toBe('okay');
    expect(out.dof).toBe(1);
    const a = out.bodies.find(o => o.instanceId === 'A')!;
    const b = out.bodies.find(o => o.instanceId === 'B')!;
    const aConnWorld = topConnector.localOrigin.clone()
      .applyQuaternion(a.quaternion).add(a.position);
    const bConnWorld = topConnector.localOrigin.clone()
      .applyQuaternion(b.quaternion).add(b.position);
    expect(bConnWorld.distanceTo(aConnWorld)).toBeLessThan(1e-5);
  });

  it('drag-of-driver pulls follower along (post-fixup)', async () => {
    // Both bodies free, revolute mate. Drag the driver (A); the follower
    // (B) should track A's connector via the post-solve fixup. Equivalent
    // to fastened's "driver drag carries follower" test for revolute.
    const flat: ConnectorState = {
      connectorId: 'c',
      localOrigin: new Vector3(0, 0, 5),
      localXDirection: new Vector3(1, 0, 0),
      localNormal: new Vector3(0, 0, 1),
    };
    const solver = new Solver();
    await solver.ensureReady();
    const out = solver.solve({
      bodies: [
        { instanceId: 'A', position: new Vector3(0, 0, 0), quaternion: new Quaternion(), grounded: false, connectors: [flat] },
        { instanceId: 'B', position: new Vector3(0, 0, 0), quaternion: new Quaternion(), grounded: false, connectors: [flat] },
      ],
      mates: [{
        mateId: 'm1', type: 'revolute',
        connectorA: { instanceId: 'A', connectorId: 'c' },
        connectorB: { instanceId: 'B', connectorId: 'c' },
      }],
      draggedInstanceId: 'A',
      draggedTargetOrigin: new Vector3(20, 0, 0),
    });
    expect(out.result).toBe('okay');
    const a = out.bodies.find(o => o.instanceId === 'A')!;
    const b = out.bodies.find(o => o.instanceId === 'B')!;
    expect(a.position.x).toBeCloseTo(20, 4);
    const aConnWorld = flat.localOrigin.clone().applyQuaternion(a.quaternion).add(a.position);
    const bConnWorld = flat.localOrigin.clone().applyQuaternion(b.quaternion).add(b.position);
    expect(bConnWorld.distanceTo(aConnWorld)).toBeLessThan(1e-4);
  });
});
