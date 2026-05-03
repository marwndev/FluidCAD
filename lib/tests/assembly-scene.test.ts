import { describe, it, expect, beforeEach } from "vitest";
import { getSceneManager, getCurrentScene } from "../scene-manager.js";
import { AssemblyScene } from "../rendering/assembly-scene.js";
import sketch from "../core/sketch.js";
import extrude from "../core/extrude.js";
import select from "../core/select.js";
import part from "../core/part.js";
import connector from "../core/connector.js";
import insert from "../core/insert.js";
import { rect } from "../core/2d/index.js";
import { face } from "../filters/index.js";
import { Part } from "../features/part.js";
import { BoundConnector } from "../features/connector.js";

function buildHousing(name = "housing"): Part {
  return part(name, () => {
    sketch("xy", () => rect(20, 20));
    extrude(10);
    connector(select(face().planar().onPlane("xy", 10)));
    connector(select(face().planar().onPlane("xy", 0)));
  }) as unknown as Part;
}

function startAssemblyWithPart(): { p: Part; scene: AssemblyScene } {
  getSceneManager().startScene();
  const p = buildHousing();
  const scene = getSceneManager().startAssemblyScene();
  return { p, scene };
}

describe("assembly scene", () => {
  beforeEach(() => {
    getSceneManager().startScene();
  });

  it("multiple inserts of the same part share the same partId", () => {
    const { p, scene } = startAssemblyWithPart();
    insert(p);
    insert(p);
    const instances = scene.getInstances();
    expect(instances).toHaveLength(2);
    expect(instances[0].part.id).toBe(instances[1].part.id);
    expect(instances[0].instanceId).not.toBe(instances[1].instanceId);
  });

  it("every instance starts at world origin with identity quaternion", () => {
    const { p, scene } = startAssemblyWithPart();
    insert(p);
    insert(p);
    for (const inst of scene.getInstances()) {
      expect(inst.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(inst.quaternion).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    }
  });

  it("re-parsing always restarts instances at the origin", () => {
    {
      const { p, scene } = startAssemblyWithPart();
      const inst = insert(p);
      // Simulate a session-only drag by mutating the runtime pose.
      inst.record.position = { x: 50, y: 0, z: 0 };
      expect(scene.getInstances()[0].position.x).toBe(50);
    }
    // A fresh parse: new assembly scene + fresh insert.
    const { p, scene } = startAssemblyWithPart();
    insert(p);
    expect(scene.getInstances()[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("Instance has grounded(), name(), and at(), but no orient() yet", () => {
    const { p } = startAssemblyWithPart();
    const inst = insert(p);
    expect(typeof inst.grounded).toBe("function");
    expect(typeof inst.name).toBe("function");
    expect(typeof inst.at).toBe("function");
    expect("orient" in inst).toBe(false);
  });

  it(".grounded().name('foo') and .name('foo').grounded() produce identical records", () => {
    {
      const { p } = startAssemblyWithPart();
      const a = insert(p).grounded().name("foo");
      expect(a.record.grounded).toBe(true);
      expect(a.record.name).toBe("foo");
    }
    {
      const { p } = startAssemblyWithPart();
      const b = insert(p).name("foo").grounded();
      expect(b.record.grounded).toBe(true);
      expect(b.record.name).toBe("foo");
    }
  });

  it("default name is the part's name; override replaces it", () => {
    const { p } = startAssemblyWithPart();
    const a = insert(p);
    expect(a.record.name).toBe("housing");
    const b = insert(p).name("housing-2");
    expect(b.record.name).toBe("housing-2");
    // Renaming one doesn't affect the other.
    expect(a.record.name).toBe("housing");
  });

  it("Instance.connectors is an array length-matching part connectors, in source order", () => {
    const { p } = startAssemblyWithPart();
    const inst = insert(p);
    expect(Array.isArray(inst.connectors)).toBe(true);
    expect(inst.connectors).toHaveLength(2);
    const [topC, bottomC] = inst.connectors;
    expect(topC).toBeInstanceOf(BoundConnector);
    expect(bottomC).toBeInstanceOf(BoundConnector);
  });

  it("each instance.connectors[i] carries the instance's id; two instances produce distinct refs", () => {
    const { p } = startAssemblyWithPart();
    const a = insert(p);
    const b = insert(p);
    expect(a.connectors[0].instanceId).toBe(a.record.instanceId);
    expect(b.connectors[0].instanceId).toBe(b.record.instanceId);
    expect(a.connectors[0].instanceId).not.toBe(b.connectors[0].instanceId);
    // Same underlying connector, distinct bound refs.
    expect(a.connectors[0].connector).toBe(b.connectors[0].connector);
  });

  it("getCurrentScene() returns an AssemblyScene after startAssemblyScene", () => {
    startAssemblyWithPart();
    expect(getCurrentScene()).toBeInstanceOf(AssemblyScene);
  });
});
