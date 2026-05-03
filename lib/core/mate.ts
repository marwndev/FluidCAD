import { captureSourceLocation } from "../index.js";
import { getCurrentScene } from "../scene-manager.js";
import { AssemblyScene, MateType } from "../rendering/assembly-scene.js";
import { BoundConnector } from "../features/connector.js";
import { MateBuilder, makeAssemblyMate } from "../features/mate.js";

const VALID_TYPES: ReadonlyArray<MateType> = [
  "fastened", "revolute", "slider", "cylindrical", "planar", "parallel", "pin-slot",
];

function mate(type: MateType, a: unknown, b: unknown): MateBuilder {
  const scene = getCurrentScene();
  if (!(scene instanceof AssemblyScene)) {
    throw new Error("mate() can only be used in *.assembly.js files.");
  }
  if (!VALID_TYPES.includes(type)) {
    throw new Error(
      `mate(): unknown mate type "${type}". Expected one of: ${VALID_TYPES.join(", ")}.`,
    );
  }
  if (!(a instanceof BoundConnector) || !(b instanceof BoundConnector)) {
    throw new Error(
      "mate(): both arguments must be connectors from inserted instances (e.g. instance.connectors[i]).",
    );
  }
  if (a.instanceId === b.instanceId && a.connector.id === b.connector.id) {
    throw new Error("mate(): a connector cannot be mated to itself.");
  }

  const sourceLocation = captureSourceLocation();
  const mateId = sourceLocation
    ? `${sourceLocation.line}:${sourceLocation.column}`
    : `mate-${scene.getMates().length}`;

  for (const existing of scene.getMates()) {
    if (existing.mateId === mateId) {
      throw new Error(
        "mate(): two mates on the same source line — put each mate(...) on its own line.",
      );
    }
  }

  const record = makeAssemblyMate(type, a, b, mateId, sourceLocation ?? undefined);
  scene.addMate(record);
  return new MateBuilder(record);
}

export default mate;
