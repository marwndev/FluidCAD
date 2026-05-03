import { Scene } from "./scene.js";
import { Part } from "../features/part.js";
import { SourceLocation } from "../common/scene-object.js";

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export type AssemblyInstance = {
  instanceId: string;
  part: Part;
  position: Vec3;
  quaternion: Quat;
  grounded: boolean;
  name: string;
  sourceLocation?: SourceLocation;
};

export type MateType =
  | 'fastened'
  | 'revolute'
  | 'slider'
  | 'cylindrical'
  | 'planar'
  | 'parallel'
  | 'pin-slot';

export type AssemblyMate = {
  mateId: string;
  type: MateType;
  connectorA: { instanceId: string; connectorId: string };
  connectorB: { instanceId: string; connectorId: string };
  options?: { rotate?: number; flip?: boolean; offset?: [number, number, number] };
  sourceLocation?: SourceLocation;
};

export type SerializedInstance = {
  instanceId: string;
  partId: string;
  partName: string;
  position: Vec3;
  quaternion: Quat;
  grounded: boolean;
  name: string;
  sourceLocation?: SourceLocation;
};

export type SerializedMate = {
  mateId: string;
  type: MateType;
  connectorA: { instanceId: string; connectorId: string };
  connectorB: { instanceId: string; connectorId: string };
  status: 'satisfied' | 'redundant' | 'inconsistent';
  options?: { rotate?: number; flip?: boolean; offset?: [number, number, number] };
  sourceLocation?: SourceLocation;
};

export class AssemblyScene extends Scene {
  private _instances: AssemblyInstance[] = [];
  private _mates: AssemblyMate[] = [];

  addInstance(instance: AssemblyInstance): void {
    this._instances.push(instance);
  }

  getInstances(): AssemblyInstance[] {
    return this._instances;
  }

  getMates(): AssemblyMate[] {
    return this._mates;
  }

  ground(instanceId: string): void {
    for (const inst of this._instances) {
      if (inst.instanceId === instanceId) {
        inst.grounded = true;
      }
    }
  }

  getSerializedInstances(): SerializedInstance[] {
    return this._instances.map(inst => ({
      instanceId: inst.instanceId,
      // Read live from inst.part — SceneCompare.inheritIdentityFrom may
      // rewrite Part.id after the AssemblyInstance was created, so any
      // value snapshotted at insert() time would be stale by render time.
      partId: inst.part.id,
      partName: inst.part.partName,
      position: inst.position,
      quaternion: inst.quaternion,
      grounded: inst.grounded,
      name: inst.name,
      sourceLocation: inst.sourceLocation,
    }));
  }

  getSerializedMates(): SerializedMate[] {
    return this._mates.map(mate => ({
      mateId: mate.mateId,
      type: mate.type,
      connectorA: mate.connectorA,
      connectorB: mate.connectorB,
      status: 'satisfied',
      options: mate.options,
      sourceLocation: mate.sourceLocation,
    }));
  }
}
