import { AssemblyInstance } from "../rendering/assembly-scene.js";
import { BoundConnector } from "./connector.js";

export class Instance {
  readonly connectors: BoundConnector[];

  constructor(public readonly record: AssemblyInstance) {
    this.connectors = record.part
      .getConnectors()
      .map(c => c.boundTo(record.instanceId));
  }

  grounded(): this {
    this.record.grounded = true;
    return this;
  }

  name(value: string): this {
    this.record.name = value;
    return this;
  }

  at(x: number, y: number, z: number): this {
    this.record.position = { x, y, z };
    return this;
  }
}
