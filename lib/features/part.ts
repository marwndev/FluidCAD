import { BuildSceneObjectContext, SceneObject } from "../common/scene-object.js";
import { Connector } from "./connector.js";

export class Part extends SceneObject {
  constructor(public partName: string) {
    super();
    this.name(partName);
    this.setAlwaysVisible();
  }

  isContainer(): boolean {
    return true;
  }

  build(_context?: BuildSceneObjectContext): void {
    // No-op — children produce geometry
  }

  compareTo(other: Part): boolean {
    if (!(other instanceof Part)) {
      return false;
    }

    if (!super.compareTo(other)) {
      return false;
    }

    if (this.partName !== other.partName) {
      return false;
    }

    return true;
  }

  getType(): string {
    return "part";
  }

  getConnectors(): Connector[] {
    return this.getChildren().filter(c => c instanceof Connector) as Connector[];
  }

  serialize() {
    return {
      name: this.partName,
    };
  }
}
