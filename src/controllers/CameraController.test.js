import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraController, CAMERA_MODES } from './CameraController.js';

function advance(camera, controller, seconds, options) {
  const steps = Math.ceil(seconds * 60);
  const delta = seconds / steps;
  for (let index = 0; index < steps; index++) controller.update(camera, delta, options);
}

test('starts at the default profile through a smooth camera interpolation', () => {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 200);
  camera.position.set(0, 0, 8.65);
  const controller = new CameraController();

  advance(camera, controller, .4, { mode: CAMERA_MODES.DEFAULT, baseDistance: 1, zoom: 1 });
  assert.ok(camera.position.z < 8.65 && camera.position.z > 7.9);
  assert.ok(camera.fov > 42 && camera.fov < 45);
  advance(camera, controller, 1, { mode: CAMERA_MODES.DEFAULT, baseDistance: 1, zoom: 1 });
  assert.ok(Math.abs(camera.position.z - 7.9) < .001);
  assert.equal(camera.fov, 45);
});

test('city, wide and reset modes interpolate FOV, position and orientation', () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, .1, 200);
  camera.position.set(0, 0, 7.9);
  const controller = new CameraController();
  advance(camera, controller, 1.5, { mode: CAMERA_MODES.DEFAULT });
  const defaultQuaternion = camera.quaternion.clone();

  advance(camera, controller, .45, { mode: CAMERA_MODES.CITY_FOCUS, zoom: 1.2 });
  assert.ok(camera.fov < 45 && camera.fov > 38);
  assert.ok(camera.position.z < 7.9);
  assert.ok(camera.quaternion.angleTo(defaultQuaternion) > 0);
  advance(camera, controller, 1.5, { mode: CAMERA_MODES.CITY_FOCUS, zoom: 1.2 });
  assert.ok(Math.abs(camera.fov - 38) < .001);
  const lookDirection = camera.getWorldDirection(new THREE.Vector3());
  const towardEarth = camera.position.clone().negate().normalize();
  assert.ok(lookDirection.dot(towardEarth) > .99, 'camera must keep looking toward the Earth');

  advance(camera, controller, .35, { mode: CAMERA_MODES.WIDE_SPACE, zoom: .8 });
  assert.ok(camera.fov > 38 && camera.fov < 52);
  advance(camera, controller, 1.5, { mode: CAMERA_MODES.WIDE_SPACE, zoom: .8 });
  assert.ok(Math.abs(camera.fov - 52) < .001);

  advance(camera, controller, .25, { mode: CAMERA_MODES.RESETTING, zoom: 1 });
  assert.ok(camera.fov < 52 && camera.fov > 45);
  advance(camera, controller, 1.5, { mode: CAMERA_MODES.RESETTING, zoom: 1 });
  assert.ok(Math.abs(camera.fov - 45) < .001);
});
