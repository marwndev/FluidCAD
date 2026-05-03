import { Camera, Group, Object3D, Plane, Quaternion, Raycaster, Vector2, Vector3, WebGLRenderer } from 'three';
import { SceneObjectRender, SerializedAssembly, SerializedAssemblyInstance } from '../types';
import { buildObjectMesh } from '../meshes/mesh-factory';

const DRAG_THRESHOLD_PX = 4;

type InstanceState = {
  data: SerializedAssemblyInstance;
  group: Group;
};

export class AssemblyController {
  private container = new Group();
  private instances = new Map<string, InstanceState>();
  private partTemplates = new Map<string, SceneObjectRender>();
  private allObjects: SceneObjectRender[] = [];

  private dragState: {
    instanceId: string;
    plane: Plane;
    grabOffset: Vector3;
    moved: boolean;
    downX: number;
    downY: number;
  } | null = null;

  constructor(
    private renderer: WebGLRenderer,
    private camera: Camera,
    private requestRender: () => void,
  ) {
    this.container.name = 'assemblyContainer';
    this.attachPointerHandlers();
  }

  getContainer(): Group {
    return this.container;
  }

  /**
   * Diff incoming assembly data against current state. Existing instances
   * keep their in-memory pose (drags survive across re-renders triggered by
   * source changes). New instances start at the source-declared position.
   * Removed instances are pruned.
   */
  update(sceneObjects: SceneObjectRender[], assembly: SerializedAssembly): void {
    this.allObjects = sceneObjects;
    this.partTemplates.clear();
    for (const obj of sceneObjects) {
      if (obj.type === 'part' && obj.id) {
        this.partTemplates.set(obj.id, obj);
      }
    }

    const incomingIds = new Set(assembly.instances.map(i => i.instanceId));
    for (const [id, state] of this.instances) {
      if (!incomingIds.has(id)) {
        this.container.remove(state.group);
        this.disposeGroup(state.group);
        this.instances.delete(id);
      }
    }

    for (const inst of assembly.instances) {
      const existing = this.instances.get(inst.instanceId);
      if (existing) {
        existing.data = inst;
        continue;
      }
      const group = this.buildInstanceGroup(inst);
      if (!group) continue;
      this.instances.set(inst.instanceId, { data: inst, group });
      this.container.add(group);
    }
  }

  clear(): void {
    for (const state of this.instances.values()) {
      this.container.remove(state.group);
      this.disposeGroup(state.group);
    }
    this.instances.clear();
    this.partTemplates.clear();
    this.allObjects = [];
  }

  private buildInstanceGroup(inst: SerializedAssemblyInstance): Group | null {
    const partTemplate = this.partTemplates.get(inst.partId);
    if (!partTemplate) {
      return null;
    }
    const group = new Group();
    group.name = `instance:${inst.instanceId}`;
    group.userData.instanceId = inst.instanceId;
    group.userData.grounded = inst.grounded;
    group.userData.draggable = !inst.grounded;
    group.position.set(inst.position.x, inst.position.y, inst.position.z);
    group.quaternion.set(inst.quaternion.x, inst.quaternion.y, inst.quaternion.z, inst.quaternion.w);

    const partMesh = buildObjectMesh(partTemplate, this.allObjects, null, this.camera, false);
    group.add(partMesh);
    return group;
  }

  private disposeGroup(group: Object3D): void {
    group.traverse(child => {
      const mat = (child as any).material;
      if (mat) {
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose?.();
        } else {
          mat.dispose?.();
        }
      }
    });
  }

  private attachPointerHandlers(): void {
    const dom = this.renderer.domElement;
    // Capture-phase so we run before camera-controls can begin its drag,
    // letting us stopImmediatePropagation() when we claim the event.
    dom.addEventListener('pointerdown', this.handlePointerDown, true);
    dom.addEventListener('pointermove', this.handlePointerMove, true);
    dom.addEventListener('pointerup', this.handlePointerUp, true);
    dom.addEventListener('pointercancel', this.handlePointerUp, true);
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const ndc = this.toNDC(e);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycastInstances(raycaster);
    if (!hit) return;

    const state = this.instances.get(hit.instanceId);
    if (!state || state.data.grounded) return;

    const planeNormal = new Vector3();
    this.camera.getWorldDirection(planeNormal);
    planeNormal.negate();
    const plane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, hit.worldPoint);
    const grabOffset = state.group.position.clone().sub(hit.worldPoint);

    this.dragState = {
      instanceId: hit.instanceId,
      plane,
      grabOffset,
      moved: false,
      downX: e.clientX,
      downY: e.clientY,
    };
    (this.renderer.domElement as HTMLElement).setPointerCapture(e.pointerId);
    // Block camera-controls and any other listeners on the canvas.
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.dragState) return;
    const dx = e.clientX - this.dragState.downX;
    const dy = e.clientY - this.dragState.downY;
    if (!this.dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
      return;
    }
    this.dragState.moved = true;

    const state = this.instances.get(this.dragState.instanceId);
    if (!state) return;

    const ndc = this.toNDC(e);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const intersection = new Vector3();
    if (!raycaster.ray.intersectPlane(this.dragState.plane, intersection)) {
      return;
    }
    state.group.position.copy(intersection.add(this.dragState.grabOffset));
    this.requestRender();
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.dragState) return;
    try {
      (this.renderer.domElement as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore — capture may not have been set
    }
    this.dragState = null;
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  private toNDC(e: PointerEvent): Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }

  private raycastInstances(raycaster: Raycaster): { instanceId: string; worldPoint: Vector3 } | null {
    const hits = raycaster.intersectObject(this.container, true);
    for (const hit of hits) {
      let cur: Object3D | null = hit.object;
      while (cur) {
        const id = cur.userData?.instanceId;
        if (typeof id === 'string') {
          return { instanceId: id, worldPoint: hit.point.clone() };
        }
        cur = cur.parent;
      }
    }
    return null;
  }

  isDragging(): boolean {
    return this.dragState?.moved === true;
  }
}

// Avoid unused import flagged by tsc
void Quaternion;
