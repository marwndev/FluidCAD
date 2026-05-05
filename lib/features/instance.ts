import { AssemblyInstance } from "../rendering/assembly-scene.js";
import { BoundConnector } from "./connector.js";
import { IConnector } from "../core/interfaces.js";
import { AxisLike, toAxis } from "../math/axis.js";
import { Quaternion } from "../math/quaternion.js";
import { Vector3d } from "../math/vector3d.js";
import { rad } from "../helpers/math-helpers.js";

/**
 * Type of `Instance.connectors` derived from the part's exposed
 * `features.connectors` map. Each name in the map becomes a property
 * holding a `BoundConnector`, so `instance.connectors.main` autocompletes
 * the same set of names the part author chose.
 */
export type InstanceConnectors<P> =
  P extends { features: { connectors: infer C } }
    ? { [K in keyof C]: C[K] extends IConnector ? BoundConnector : never }
    : Record<string, BoundConnector>;

/**
 * `connectors` is a Record keyed by the part's `features.connectors`
 * map. Authors expose connectors by name from inside `part(name, () => {
 * ... return { connectors: { main, bore } } })`, then assembly code
 * references them as `instance.connectors.main` / `instance.connectors.bore`.
 * Connectors that aren't exposed in `features.connectors` still render
 * but can't be referenced by mates.
 */
export class Instance<P = unknown> {
  readonly connectors: InstanceConnectors<P>;

  constructor(public readonly record: AssemblyInstance) {
    const named = record.part.getNamedConnectors();
    const out: Record<string, BoundConnector> = {};
    for (const [name, c] of Object.entries(named)) {
      out[name] = c.boundTo(record.instanceId);
    }
    this.connectors = out as InstanceConnectors<P>;
  }

  grounded(): this {
    this.record.grounded = true;
    return this;
  }

  name(value: string): this {
    this.record.name = value;
    return this;
  }

  translate(x: number, y: number = 0, z: number = 0): this {
    this.record.position = { x, y, z };
    return this;
  }

  rotate(axis: AxisLike, angleDegrees: number): this {
    const a = toAxis(axis);
    const rotQ = Quaternion.fromAxisAngle(a.direction, rad(angleDegrees));

    const cur = this.record.quaternion;
    const newQ = rotQ.multiply(new Quaternion(cur.x, cur.y, cur.z, cur.w));
    this.record.quaternion = { x: newQ.x, y: newQ.y, z: newQ.z, w: newQ.w };

    const p = this.record.position;
    const offset = new Vector3d(p.x - a.origin.x, p.y - a.origin.y, p.z - a.origin.z);
    const rotated = rotQ.rotateVector(offset);
    this.record.position = {
      x: a.origin.x + rotated.x,
      y: a.origin.y + rotated.y,
      z: a.origin.z + rotated.z,
    };

    return this;
  }
}
