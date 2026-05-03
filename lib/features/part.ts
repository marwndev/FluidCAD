import { BuildSceneObjectContext, SceneObject } from "../common/scene-object.js";
import { Connector } from "./connector.js";
import { IPart } from "../core/interfaces.js";

export class Part extends SceneObject implements IPart {
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

  /**
   * Reads the part's `features.connectors` map and returns the connectors
   * keyed by author-supplied name. Mates reference connectors through this
   * map (`instance.connectors.main`) so the binding is robust to source
   * reordering inside the part — adding or moving a `connector(...)` call
   * doesn't shuffle which name maps to which connector.
   *
   * Returns an empty object if the part returned no connectors map; in that
   * case the part's connectors still render in the viewport (they're scene
   * objects) but can't be referenced from assembly code.
   */
  getNamedConnectors(): Record<string, Connector> {
    const features = (this as any).features;
    if (!features || typeof features !== 'object') {
      return {};
    }
    const map = (features as { connectors?: unknown }).connectors;
    if (!map || typeof map !== 'object') {
      return {};
    }
    const out: Record<string, Connector> = {};
    for (const [name, value] of Object.entries(map)) {
      if (value instanceof Connector) {
        out[name] = value;
      }
    }
    return out;
  }

  serialize() {
    return {
      name: this.partName,
    };
  }
}
