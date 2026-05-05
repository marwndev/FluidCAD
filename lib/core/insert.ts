import { captureSourceLocation } from "../index.js";
import { getCurrentScene } from "../scene-manager.js";
import { AssemblyScene, AssemblyInstance } from "../rendering/assembly-scene.js";
import { Part } from "../features/part.js";
import { Instance } from "../features/instance.js";
import { IPart } from "./interfaces.js";

function insert<P extends IPart>(part: P): Instance<P> {
  const scene = getCurrentScene();
  if (!(scene instanceof AssemblyScene)) {
    throw new Error("insert() can only be used in *.assembly.js files.");
  }
  if (!(part instanceof Part)) {
    throw new Error("insert(): expected a Part — got " + typeof part + ".");
  }

  const sourceLocation = captureSourceLocation();
  // Counter-based id, stable across source edits. Source-line-derived ids
  // collided when a blank-line insertion shifted later inserts onto a row
  // already used by an earlier one (e.g. new `right` landing on old `front`'s
  // `line:col`), and the UI controller's instance map keyed off id would then
  // reuse the wrong part's mesh. `sourceLocation` is preserved separately on
  // the record for drag-release `.at(...)` writeback.
  const instanceId = `inst-${scene.getInstances().length}`;

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
  return new Instance<P>(record);
}

export default insert;
