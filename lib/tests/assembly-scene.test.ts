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
    const top = connector(select(face().planar().onPlane("xy", 10)));
    const bottom = connector(select(face().planar().onPlane("xy", 0)));
    return { connectors: { top, bottom } };
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

  it("Instance.connectors is a record keyed by features.connectors names", () => {
    const { p } = startAssemblyWithPart();
    const inst = insert(p);
    expect(typeof inst.connectors).toBe("object");
    expect(Array.isArray(inst.connectors)).toBe(false);
    expect(Object.keys(inst.connectors).sort()).toEqual(["bottom", "top"]);
    expect(inst.connectors.top).toBeInstanceOf(BoundConnector);
    expect(inst.connectors.bottom).toBeInstanceOf(BoundConnector);
  });

  it("each named connector carries the instance's id; two instances produce distinct refs", () => {
    const { p } = startAssemblyWithPart();
    const a = insert(p);
    const b = insert(p);
    expect(a.connectors.top.instanceId).toBe(a.record.instanceId);
    expect(b.connectors.top.instanceId).toBe(b.record.instanceId);
    expect(a.connectors.top.instanceId).not.toBe(b.connectors.top.instanceId);
    // Same underlying connector, distinct bound refs.
    expect(a.connectors.top.connector).toBe(b.connectors.top.connector);
  });

  it("getCurrentScene() returns an AssemblyScene after startAssemblyScene", () => {
    startAssemblyWithPart();
    expect(getCurrentScene()).toBeInstanceOf(AssemblyScene);
  });

  it("connectors that aren't exposed in features.connectors don't appear on the instance", () => {
    getSceneManager().startScene();
    const p = part("hidden", () => {
      sketch("xy", () => rect(20, 20));
      extrude(10);
      // Connector is created but NOT returned in features.connectors.
      connector(select(face().planar().onPlane("xy", 10)));
      return { something: "else" };
    }) as unknown as Part;
    getSceneManager().startAssemblyScene();
    const inst = insert(p);
    // The part still has the connector as a child (it renders), but the
    // instance's named-map is empty because the part didn't expose it.
    expect(p.getConnectors()).toHaveLength(1);
    expect(Object.keys(inst.connectors)).toEqual([]);
  });

  it("renaming a connector in features.connectors changes the instance key", () => {
    getSceneManager().startScene();
    const p = part("housing", () => {
      sketch("xy", () => rect(20, 20));
      extrude(10);
      const onTop = connector(select(face().planar().onPlane("xy", 10)));
      // Author chose the name "mountTop"; instance.connectors mirrors it.
      return { connectors: { mountTop: onTop } };
    }) as unknown as Part;
    getSceneManager().startAssemblyScene();
    const inst = insert(p);
    expect(Object.keys(inst.connectors)).toEqual(["mountTop"]);
    expect(inst.connectors.mountTop).toBeInstanceOf(BoundConnector);
  });
});
