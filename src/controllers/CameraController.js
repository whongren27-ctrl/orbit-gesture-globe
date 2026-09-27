import * as THREE from 'three';
import { DEFAULT_CAMERA_DISTANCE } from '../utils/cameraMath.js';

export const CAMERA_MODES = Object.freeze({
  DEFAULT: 'DEFAULT',
  CITY_FOCUS: 'CITY_FOCUS',
  CLOSE_UP: 'CLOSE_UP',
  WIDE_SPACE: 'WIDE_SPACE',
  AUTOPILOT: 'AUTOPILOT',
  RESETTING: 'RESETTING',
});

const PROFILES = {
  DEFAULT: { distance: 7.9, fov: 45, y: 0, roll: 0, duration: 1.2 },
  CITY_FOCUS: { distance: 7.65, fov: 38, y: .12, roll: -.012, duration: 1.9 },
  CLOSE_UP: { distance: 7.35, fov: 38, y: .06, roll: 0, duration: 1.35 },
  WIDE_SPACE: { distance: 8.45, fov: 52, y: -.08, roll: .008, duration: 1.8 },
  AUTOPILOT: { distance: 7.8, fov: 40, y: .08, roll: 0, duration: 2.1 },
  RESETTING: { distance: 7.9, fov: 45, y: 0, roll: 0, duration: 1.45 },
};

const easeInOutCubic = value => value < .5
  ? 4 * value ** 3
  : 1 - ((-2 * value + 2) ** 3) / 2;

/** Smooth, interruptible camera moves. The camera follows zoom separately from mode transitions. */
export class CameraController {
  constructor(initialMode = null) {
    this.mode = initialMode;
    this.transition = null;
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    // A Camera's lookAt convention aims local -Z at the target; Object3D uses +Z.
    // Reusing Object3D's quaternion here would point the real camera away from Earth.
    this.lookObject = new THREE.PerspectiveCamera();
    this.positionScratch = new THREE.Vector3();
    this.quaternionScratch = new THREE.Quaternion();
    this.initialized = false;
  }

  setMode(mode, camera, { reducedMotion = false, duration } = {}) {
    if (!PROFILES[mode] || mode === this.mode) return false;
    this.mode = mode;
    if (!camera) return true;

    const profile = PROFILES[mode];
    this.lookObject.position.set(0, profile.y, profile.distance);
    this.lookObject.lookAt(this.lookTarget);
    this.lookObject.rotateZ(profile.roll);
    const destinationQuaternion = this.lookObject.quaternion.clone();
    const distanceScale = camera.userData.orbitBaseDistance || 1;
    const destinationPosition = new THREE.Vector3(0, profile.y, profile.distance * distanceScale);
    const seconds = reducedMotion ? .45 : duration || profile.duration;

    this.transition = {
      fromPosition: camera.position.clone(),
      toPosition: destinationPosition,
      fromQuaternion: camera.quaternion.clone(),
      toQuaternion: destinationQuaternion,
      fromFov: camera.fov,
      toFov: profile.fov,
      elapsed: 0,
      duration: seconds,
    };
    this.initialized = true;
    return true;
  }

  update(camera, delta, {
    mode = this.mode,
    zoom = 1,
    cameraDistance,
    baseDistance = 1,
    dolly = 0,
    reducedMotion = false,
  } = {}) {
    if (!camera) return;
    camera.userData.orbitBaseDistance = baseDistance;
    if (!this.initialized) {
      this.mode = null;
      this.setMode(mode, camera, { reducedMotion });
    } else if (mode !== this.mode) {
      this.setMode(mode, camera, { reducedMotion });
    }

    const profile = PROFILES[this.mode] || PROFILES.DEFAULT;
    const handDistance = Number.isFinite(cameraDistance)
      ? cameraDistance
      : DEFAULT_CAMERA_DISTANCE / Math.max(.1, zoom);
    const targetZ = handDistance * baseDistance * (profile.distance / DEFAULT_CAMERA_DISTANCE) - dolly;
    this.targetPosition.set(0, profile.y, targetZ);
    this.lookObject.position.set(0, profile.y, targetZ);
    this.lookObject.lookAt(this.lookTarget);
    this.lookObject.rotateZ(profile.roll);
    this.targetQuaternion.copy(this.lookObject.quaternion);

    if (this.transition) {
      const transition = this.transition;
      transition.elapsed = Math.min(transition.elapsed + Math.min(delta, .1), transition.duration);
      const amount = easeInOutCubic(transition.elapsed / transition.duration);
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, amount);
      camera.position.z += (targetZ - transition.toPosition.z) * amount;
      camera.quaternion.slerpQuaternions(transition.fromQuaternion, transition.toQuaternion, amount);
      camera.fov = THREE.MathUtils.lerp(transition.fromFov, transition.toFov, amount);
      if (transition.elapsed >= transition.duration) this.transition = null;
    } else {
      const amount = 1 - Math.exp(-(reducedMotion ? 8 : 4.8) * Math.min(delta, .1));
      camera.position.lerp(this.targetPosition, amount);
      camera.quaternion.slerp(this.targetQuaternion, amount);
      camera.fov = THREE.MathUtils.lerp(camera.fov, profile.fov, amount);
    }

    camera.updateProjectionMatrix();
  }
}

export default CameraController;
