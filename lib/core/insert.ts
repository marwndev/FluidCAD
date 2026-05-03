import { captureSourceLocation } from "../index.js";
import { getCurrentScene } from "../scene-manager.js";
import { AssemblyScene, AssemblyInstance } from "../rendering/assembly-scene.js";
import { Part } from "../features/part.js";
import { Instance } from "../features/instance.js";
import { IPart } from "./interfaces.js";

function insert(part: IPart): Instance {
  const scene = getCurrentScene();
  if (!(scene instanceof AssemblyScene)) {
    throw new Error("insert() can only be used in *.assembly.js files.");
  }
  if (!(part instanceof Part)) {
    throw new Error("insert(): expected a Part — got " + typeof part + ".");
  }

  const sourceLocation = captureSourceLocation();
  const instanceId = sourceLocation
    ? `${sourceLocation.line}:${sourceLocation.column}`
    : `inst-${scene.getInstances().length}`;

  for (const existing of scene.getInstances()) {
    if (existing.instanceId === instanceId) {
      throw new Error(
        "insert(): two inserts on the same source line — put each insert(...) on its own line.",
      );
    }
  }

  const record: AssemblyInstance = {
    instanceId,
    part,
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    grounded: false,
    name: part.name(),
    sourceLocation: sourceLocation ?? undefined,
  };
  scene.addInstance(record);
  return new Instance(record);
}

export default insert;
