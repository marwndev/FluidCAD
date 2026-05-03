import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { buildSystem, GROUP_ACTIVE, GROUP_GROUND, loadSolveSpace, type BodyState } from '../src/solver';

function body(id: string, grounded: boolean, connectors: BodyState['connectors'] = []): BodyState {
  return {
    instanceId: id,
    position: new Vector3(),
    quaternion: new Quaternion(),
    grounded,
    connectors,
  };
}

describe('system-builder', () => {
  it('grounded body params land in group 1', async () => {
    const api = await loadSolveSpace();
    const built = buildSystem(api, { bodies: [body('g', true)], mates: [] });
    const params = (built.sys.params as { h: number; group: number }[]);
    expect(params.length).toBe(7);
    for (const p of params) {
      expect(p.group).toBe(GROUP_GROUND);
    }
    expect(built.expectedFreeParams).toBe(0);
  });

  it('free body params land in group 2', async () => {
    const api = await loadSolveSpace();
    const built = buildSystem(api, { bodies: [body('a', false)], mates: [] });
    const params = (built.sys.params as { h: number; group: number }[]);
    expect(params.length).toBe(7);
    for (const p of params) {
      expect(p.group).toBe(GROUP_ACTIVE);
    }
    expect(built.expectedFreeParams).toBe(6);
  });

  it('connector entities reference the body workplane', async () => {
    const api = await loadSolveSpace();
    const built = buildSystem(api, {
      bodies: [body('a', false, [{
        connectorId: 'c0',
        localOrigin: new Vector3(1, 2, 0),
        localXDirection: new Vector3(1, 0, 0),
        localNormal: new Vector3(0, 0, 1),
      }])],
      mates: [],
    });
    const handles = built.bodies[0];
    expect(handles.connectors.length).toBe(1);
    const connector = handles.connectors[0];
    expect(connector.connectorId).toBe('c0');

    // Look up the connector point entity and verify its workplane is the
    // body's workplane.
    const entities = built.sys.entities as { h: number; type: number; wrkpl: number; param: number[]; point: number[] }[];
    const point = entities.find(e => e.h === connector.point)!;
    expect(point.wrkpl).toBe(handles.workplane);
    // POINT_IN_2D has type 50001 in libslvs.
    expect(point.type).toBe(50001);

    // Phase 06 also adds an X-axis line segment per connector, in the body's
    // workplane, so mate compilers can use it for ANGLE constraints.
    const xLine = entities.find(e => e.h === connector.xAxisLine)!;
    expect(xLine).toBeDefined();
    // LINE_SEGMENT has type 80001 in libslvs.
    expect(xLine.type).toBe(80001);
    expect(xLine.wrkpl).toBe(handles.workplane);
    // The line points from the connector origin to the X tip; both should be
    // POINT_IN_2D entities in the body workplane.
    expect(xLine.point[0]).toBe(connector.point);
  });

  it('handles multiple bodies and connectors with monotonic handle ids', async () => {
    const api = await loadSolveSpace();
    const built = buildSystem(api, {
      bodies: [
        body('a', true, [
          { connectorId: 'c1', localOrigin: new Vector3(), localXDirection: new Vector3(1,0,0), localNormal: new Vector3(0,0,1) },
        ]),
        body('b', false, [
          { connectorId: 'c2', localOrigin: new Vector3(5,0,0), localXDirection: new Vector3(1,0,0), localNormal: new Vector3(0,0,1) },
          { connectorId: 'c3', localOrigin: new Vector3(0,5,0), localXDirection: new Vector3(0,1,0), localNormal: new Vector3(0,0,1) },
        ]),
      ],
      mates: [],
    });
    expect(built.bodies.length).toBe(2);
    expect(built.bodies[0].connectors.length).toBe(1);
    expect(built.bodies[1].connectors.length).toBe(2);
    // Handles are unique.
    const allHandles = built.bodies.flatMap(b => [
      ...b.originParams,
      ...b.quatParams,
      b.point, b.normal, b.workplane,
      ...b.connectors.flatMap(c => [c.point, c.xAxisLine, ...c.uvParams]),
    ]);
    expect(new Set(allHandles).size).toBe(allHandles.length);
  });
});
