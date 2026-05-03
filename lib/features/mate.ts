import { AssemblyMate, MateType } from "../rendering/assembly-scene.js";
import { BoundConnector } from "./connector.js";
import { SourceLocation } from "../common/scene-object.js";

export class MateBuilder {
  constructor(private readonly mate: AssemblyMate) {}

  flip(): this {
    this.ensureOptions().flip = !this.mate.options!.flip;
    return this;
  }

  rotate(deg: number): this {
    const opts = this.ensureOptions();
    opts.rotate = (opts.rotate ?? 0) + deg;
    return this;
  }

  offset(x: number, y: number, z: number): this {
    this.ensureOptions().offset = [x, y, z];
    return this;
  }

  private ensureOptions() {
    if (!this.mate.options) {
      this.mate.options = {};
    }
    return this.mate.options;
  }
}

export function makeAssemblyMate(
  type: MateType,
  a: BoundConnector,
  b: BoundConnector,
  mateId: string,
  sourceLocation: SourceLocation | undefined,
): AssemblyMate {
  // Hold live Connector references — see AssemblyMate's docs for why
  // snapshotting `.id` here would go stale across SceneCompare runs.
  return {
    mateId,
    type,
    connectorA: { instanceId: a.instanceId, connector: a.connector },
    connectorB: { instanceId: b.instanceId, connector: b.connector },
    options: {},
    sourceLocation,
  };
}
