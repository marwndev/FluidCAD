import { BuildSceneObjectContext, SceneObject } from "../common/scene-object.js";
import { Plane } from "../math/plane.js";
import { Vertex } from "../common/vertex.js";
import { ConnectorInput, ConnectorOptions, frameFromSource } from "./connector-frame.js";
import { IConnector } from "../core/interfaces.js";

const FRAME_STATE_KEY = 'connector-frame';

export class Connector extends SceneObject implements IConnector {

  constructor(
    public sourceShape: ConnectorInput,
    public options: ConnectorOptions = {},
  ) {
    super();
  }

  build(_context?: BuildSceneObjectContext) {
    const frame = frameFromSource(this.sourceShape, this.options);
    this.setState(FRAME_STATE_KEY, frame);

    // The connector consumes its source — the face/edge/vertex selection
    // (or lazy edge) was used purely to derive the frame, and the frame
    // now lives on the connector. Mirrors plane-from-object / axis-from-edge.
    (this.sourceShape as SceneObject).removeShapes(this);

    const center = Vertex.fromPoint(frame.origin);
    center.markAsMetaShape();
    this.addShape(center);
  }

  getFrame(): Plane {
    const frame = this.getState(FRAME_STATE_KEY) as Plane | undefined;
    if (!frame) {
      throw new Error("Connector: getFrame() called before build().");
    }
    return frame;
  }

  override getDependencies(): SceneObject[] {
    return [this.sourceShape];
  }

  override createCopy(_remap: Map<SceneObject, SceneObject>): SceneObject {
    return new Connector(this.sourceShape, this.options);
  }

  compareTo(other: Connector): boolean {
    if (!(other instanceof Connector)) {
      return false;
    }
    if (!super.compareTo(other)) {
      return false;
    }
    if (!(this.sourceShape as SceneObject).compareTo(other.sourceShape as SceneObject)) {
      return false;
    }
    if (JSON.stringify(this.options) !== JSON.stringify(other.options)) {
      return false;
    }
    return true;
  }

  getType(): string {
    return "connector";
  }

  serialize() {
    const frame = this.getState(FRAME_STATE_KEY) as Plane | undefined;
    if (!frame) {
      return {};
    }
    return {
      origin: frame.origin,
      xDirection: frame.xDirection,
      yDirection: frame.yDirection,
      normal: frame.normal,
    };
  }
}
