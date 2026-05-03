import { describe, it, expect, beforeEach } from "vitest";
import { getSceneManager } from "../scene-manager.js";
import sketch from "../core/sketch.js";
import extrude from "../core/extrude.js";
import select from "../core/select.js";
import part from "../core/part.js";
import connector from "../core/connector.js";
import insert from "../core/insert.js";
import mate from "../core/mate.js";
import { rect } from "../core/2d/index.js";
import { face } from "../filters/index.js";
import { Part } from "../features/part.js";
import { AssemblyScene } from "../rendering/assembly-scene.js";

function buildHousing(name = "housing"): Part {
  return part(name, () => {
    sketch("xy", () => rect(20, 20));
    extrude(10);
    connector(select(face().planar().onPlane("xy", 10)));
    connector(select(face().planar().onPlane("xy", 0)));
  }) as unknown as Part;
}

function startAssembly(): { p: Part; scene: AssemblyScene } {
  getSceneManager().startScene();
  const p = buildHousing();
  const scene = getSceneManager().startAssemblyScene();
  return { p, scene };
}

describe("mate scope and validation", () => {
  beforeEach(() => {
    getSceneManager().startScene();
  });

  it("mate() outside an assembly scene throws", () => {
    expect(() => mate("fastened", null as any, null as any)).toThrow(/assembly\.js/i);
  });

  it("mate() with unknown type throws", () => {
    const { p } = startAssembly();
    const a = insert(p);
    const b = insert(p);
    expect(() =>
      mate("not-a-real-mate" as any, a.connectors[0], b.connectors[0]),
    ).toThrow(/unknown mate type/i);
  });

  it("mate() with non-connector arguments throws", () => {
    startAssembly();
    expect(() => mate("fastened", "nope" as any, "nope" as any)).toThrow(/connector/i);
  });

  it("mate() across two instances records the connector refs in source order", () => {
    const { p, scene } = startAssembly();
    const a = insert(p);
    const b = insert(p);
    const builder = mate("fastened", a.connectors[0], b.connectors[0]);
    expect(builder).toBeDefined();
    const mates = scene.getMates();
    expect(mates).toHaveLength(1);
    expect(mates[0].type).toBe("fastened");
    expect(mates[0].connectorA.instanceId).toBe(a.record.instanceId);
    expect(mates[0].connectorB.instanceId).toBe(b.record.instanceId);
    // Live Connector refs (not snapshotted ids) — see AssemblyMate docs.
    expect(mates[0].connectorA.connector).toBe(a.connectors[0].connector);
    expect(mates[0].connectorB.connector).toBe(b.connectors[0].connector);
  });

  it("self-referencing mate throws", () => {
    const { p } = startAssembly();
    const a = insert(p);
    expect(() => mate("fastened", a.connectors[0], a.connectors[0])).toThrow(
      /cannot be mated to itself/i,
    );
  });

  it("mate options chain (.flip, .rotate, .offset) record on the mate", () => {
    const { p, scene } = startAssembly();
    const a = insert(p);
    const b = insert(p);
    mate("fastened", a.connectors[0], b.connectors[0])
      .flip()
      .rotate(45)
      .offset(1, 2, 3);
    const m = scene.getMates()[0];
    expect(m.options?.flip).toBe(true);
    expect(m.options?.rotate).toBe(45);
    expect(m.options?.offset).toEqual([1, 2, 3]);
  });

  it("rotate() accumulates across calls", () => {
    const { p, scene } = startAssembly();
    const a = insert(p);
    const b = insert(p);
    mate("fastened", a.connectors[0], b.connectors[0]).rotate(30).rotate(60);
    expect(scene.getMates()[0].options?.rotate).toBe(90);
  });

  it("flip() toggles", () => {
    const { p, scene } = startAssembly();
    const a = insert(p);
    const b = insert(p);
    mate("fastened", a.connectors[0], b.connectors[0]).flip().flip();
    expect(scene.getMates()[0].options?.flip).toBe(false);
  });
});
