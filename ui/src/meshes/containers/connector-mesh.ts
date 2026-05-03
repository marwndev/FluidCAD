import {
  Camera,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { ConnectorData, SceneObjectRender, Vec3Data } from '../../types';

function computeViewScale(camera: Camera, position: Vector3, factor: number): number {
  if (camera instanceof OrthographicCamera) {
    const viewHeight = (camera.top - camera.bottom) / camera.zoom;
    return viewHeight * factor;
  } else if (camera instanceof PerspectiveCamera) {
    const dist = camera.position.distanceTo(position);
    const vFov = camera.fov * Math.PI / 180;
    const viewHeight = 2 * dist * Math.tan(vFov / 2);
    return viewHeight * factor;
  }
  return 1;
}

const X_COLOR = '#e44';
const Y_COLOR = '#4d4';
const Z_COLOR = '#48f';
const ORIGIN_COLOR = '#fff';

const X_LENGTH = 6;
const Y_LENGTH = 4;
const Z_LENGTH = 8;
const SHAFT_RADIUS = 0.25;
const HEAD_LENGTH = 1.5;
const HEAD_RADIUS = 0.6;
const ORIGIN_RADIUS = 0.5;
const VIEW_SCALE_FACTOR = 0.004;

function toVec3(v: Vec3Data): Vector3 {
  return new Vector3(v.x, v.y, v.z);
}

function buildAxis(length: number, color: string, withHead: boolean): Group {
  const material = new MeshBasicMaterial({ color, depthTest: false, transparent: true });
  const group = new Group();

  const shaftLength = withHead ? length - HEAD_LENGTH : length;
  const shaft = new Mesh(
    new CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, shaftLength, 12),
    material,
  );
  shaft.geometry.translate(0, shaftLength / 2, 0);
  group.add(shaft);

  if (withHead) {
    const head = new Mesh(
      new ConeGeometry(HEAD_RADIUS, HEAD_LENGTH, 12),
      material,
    );
    head.geometry.translate(0, shaftLength + HEAD_LENGTH / 2, 0);
    group.add(head);
  }

  return group;
}

export class ConnectorMesh extends Group {
  constructor(sceneObject: SceneObjectRender, camera: Camera) {
    super();

    const data = sceneObject.object as ConnectorData | undefined;
    if (!data || !data.origin || !data.normal || !data.xDirection || !data.yDirection) {
      return;
    }

    this.userData.isMetaShape = true;
    this.userData.isConnector = true;

    const origin = toVec3(data.origin);
    const xDir = toVec3(data.xDirection).normalize();
    const yDir = toVec3(data.yDirection).normalize();
    const zDir = toVec3(data.normal).normalize();

    const upY = new Vector3(0, 1, 0);

    const xAxis = buildAxis(X_LENGTH, X_COLOR, false);
    xAxis.quaternion.copy(new Quaternion().setFromUnitVectors(upY, xDir));
    this.add(xAxis);

    const yAxis = buildAxis(Y_LENGTH, Y_COLOR, false);
    yAxis.quaternion.copy(new Quaternion().setFromUnitVectors(upY, yDir));
    this.add(yAxis);

    const zAxis = buildAxis(Z_LENGTH, Z_COLOR, true);
    zAxis.quaternion.copy(new Quaternion().setFromUnitVectors(upY, zDir));
    this.add(zAxis);

    const originBall = new Mesh(
      new SphereGeometry(ORIGIN_RADIUS, 16, 12),
      new MeshBasicMaterial({ color: ORIGIN_COLOR, depthTest: false, transparent: true }),
    );
    this.add(originBall);

    this.position.copy(origin);
    this.scale.setScalar(computeViewScale(camera, this.position, VIEW_SCALE_FACTOR));

    // Render on top so the gizmo isn't hidden inside surrounding geometry.
    this.traverse(child => { child.renderOrder = 1000; });

    originBall.onBeforeRender = (_renderer, _scene, cam) => {
      this.scale.setScalar(computeViewScale(cam, this.position, VIEW_SCALE_FACTOR));
      this.updateMatrixWorld(true);
    };
  }
}
