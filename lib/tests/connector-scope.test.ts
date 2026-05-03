import { describe, it, expect } from "vitest";
import { setupOC, render } from "./setup.js";
import sketch from "../core/sketch.js";
import extrude from "../core/extrude.js";
import select from "../core/select.js";
import part from "../core/part.js";
import connector from "../core/connector.js";
import { rect } from "../core/2d/index.js";
import { face } from "../filters/index.js";
import { Connector } from "../features/connector.js";
import { Part } from "../features/part.js";

describe("connector scope", () => {
  setupOC();

  it("throws when called outside a part() block", () => {
    expect(() => {
      sketch("xy", () => rect(20, 20));
      extrude(10);
      connector(select(face().planar().onPlane("xy")));
    }).toThrow(/inside a part/i);
  });

  it("rejects unsupported source kinds", () => {
    expect(() => {
      part("bad-source", () => {
        sketch("xy", () => rect(20, 20));
        extrude(10);
        // @ts-expect-error — passing a raw object on purpose
        connector({ x: 0, y: 0, z: 0 });
      });
    }).toThrow();
  });

  it("returns connectors in source order via Part.getConnectors()", () => {
    const p = part("ordered", () => {
      sketch("xy", () => rect(40, 60));
      extrude(20);
      const top = connector(select(face().planar().onPlane("xy", 20)));
      const bottom = connector(select(face().planar().onPlane("xy")));
      return { top, bottom };
    }) as unknown as Part;

    render();

    const conns = p.getConnectors();
    expect(conns).toHaveLength(2);
    expect(conns[0].getFrame().origin.z).toBeCloseTo(20, 5);
    expect(conns[1].getFrame().origin.z).toBeCloseTo(0, 5);
  });

  it("passes the user's free-form features object through unchanged", () => {
    const p = part("flat-features", () => {
      sketch("xy", () => rect(40, 60));
      extrude(20);
      const top = connector(select(face().planar().onPlane("xy", 20)));
      const bottom = connector(select(face().planar().onPlane("xy")));
      return { top, bottom, meta: { count: 2 } };
    }) as any;

    expect(p.features).toBeDefined();
    expect(p.features.top).toBeInstanceOf(Connector);
    expect(p.features.bottom).toBeInstanceOf(Connector);
    expect(p.features.meta).toEqual({ count: 2 });
  });

  it("supports a renamed/grouped features shape without affecting tracking", () => {
    const p = part("grouped-features", () => {
      sketch("xy", () => rect(40, 60));
      extrude(20);
      const top = connector(select(face().planar().onPlane("xy", 20)));
      const bottom = connector(select(face().planar().onPlane("xy")));
      return { connectors: { mountTop: top, axleBore: bottom } };
    }) as any;

    expect(p.features.connectors.mountTop).toBeInstanceOf(Connector);
    expect(p.features.connectors.axleBore).toBeInstanceOf(Connector);

    render();

    const conns = (p as Part).getConnectors();
    expect(conns).toHaveLength(2);
  });

  it("tracks connectors that are never exposed through features", () => {
    const p = part("unexposed", () => {
      sketch("xy", () => rect(40, 60));
      extrude(20);
      connector(select(face().planar().onPlane("xy", 20)));
      connector(select(face().planar().onPlane("xy")));
      return {};
    }) as unknown as Part;

    render();

    const conns = p.getConnectors();
    expect(conns).toHaveLength(2);
  });
});
