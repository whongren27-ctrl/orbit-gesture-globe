import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GestureController, DEFAULT_VIEW } from './GestureController.js';
import { classifyGesture, classifyGestureDetails, normalizeHandCoordinates } from '../utils/gestureMath.js';

function hand(type = 'PALM', offset = 0, scale = 1) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: .5 + offset, y: .65, z: 0 }));
  landmarks[0] = { x: .5 + offset, y: .8, z: 0 };
  landmarks[4] = { x: .25 + offset, y: .54, z: 0 };
  for (const [base, x] of [[5, .40], [9, .48], [13, .56], [17, .64]]) {
    landmarks[base] = { x: x + offset, y: .62, z: 0 };
    landmarks[base + 1] = { x: x + offset, y: .48, z: 0 };
    landmarks[base + 2] = { x: x + offset, y: .38, z: 0 };
    landmarks[base + 3] = { x: x + offset, y: .28, z: 0 };
  }
  const curled = {
    FIST: [8, 12, 16, 20], VICTORY: [16, 20], POINT: [12, 16, 20], THREE_FINGER: [20], PINCH: [12, 16, 20],
  }[type] || [];
  for (const tip of curled) landmarks[tip] = { ...landmarks[tip], y: .72 };
  if (type === 'PINCH') landmarks[4] = { ...landmarks[8], x: landmarks[8].x + .015 };
  const backhand = type === 'BACKHAND';
  return landmarks.map(point => ({
    x: .5 + ((backhand ? 1 - point.x + offset * 2 : point.x) - .5) * scale,
    y: .8 + (point.y - .8) * scale,
    z: point.z,
  }));
}

function feed(controller, type, { start = 50, step = 40, count = 8, confidence = 1 } = {}) {
  for (let index = 0; index < count; index++) {
    controller.input(hand(type), start + index * step, confidence);
    controller.update(step / 1000);
  }
}

test('recognizes palm, backhand, fist, pinch, victory and three-finger meteor pose', () => {
  for (const gesture of ['PALM', 'BACKHAND', 'FIST', 'PINCH', 'VICTORY', 'THREE_FINGER']) {
    assert.equal(classifyGesture(hand(gesture)), gesture);
    assert.ok(classifyGestureDetails(hand(gesture)).fingerConfidence >= .75);
  }
});

test('three extended fingers stay a meteor pose even when the relaxed thumb nears the index', () => {
  const landmarks = hand('THREE_FINGER');
  landmarks[4] = { ...landmarks[8], x: landmarks[8].x + .018, y: landmarks[8].y };
  assert.equal(classifyGesture(landmarks), 'THREE_FINGER');
});

test('pinch keeps priority while its normalized ratio crosses enter and exit hysteresis', () => {
  const landmarks = hand('PINCH');
  const palm = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
  landmarks[4] = { ...landmarks[8], x: landmarks[8].x + palm * .31 };
  assert.equal(classifyGesture(landmarks), 'PINCH');
  landmarks[4] = { ...landmarks[8], x: landmarks[8].x + palm * .40 };
  assert.equal(classifyGesture(landmarks, 'PINCH'), 'PINCH');
  landmarks[4] = { ...landmarks[8], x: landmarks[8].x + palm * .43 };
  assert.equal(classifyGesture(landmarks, 'PINCH'), 'NONE');
});

test('mirrored coordinate normalization matches selfie-view swipe direction', () => {
  assert.ok(normalizeHandCoordinates({ x: .7, y: .4 }).x < normalizeHandCoordinates({ x: .3, y: .4 }).x);
});

test('palm rotation responds to quick movement while stationary landmark jitter stays quiet', () => {
  const controller = new GestureController();
  feed(controller, 'PALM', { start: 0, step: 35, count: 5 });
  for (let index = 0; index < 20; index++) {
    controller.input(hand('PALM', -index * .012), 400 + index * 35);
    controller.update(.035);
  }
  assert.ok(controller.rotation.y > DEFAULT_VIEW.y + .18);

  const still = new GestureController();
  feed(still, 'PALM', { start: 0, step: 35, count: 5 });
  for (let index = 0; index < 40; index++) {
    still.input(hand('PALM', index % 2 ? .00015 : 0), 400 + index * 35);
    still.update(.035);
  }
  assert.ok(Math.abs(still.rotation.y - DEFAULT_VIEW.y) < .005);
});

test('new hand motion reverses old inertia promptly and inertia decays after tracking loss', () => {
  const controller = new GestureController();
  controller.velocity.y = 1;
  feed(controller, 'PALM', { start: 0, step: 35, count: 5 });
  controller.input(hand('PALM', .1), 300);
  controller.update(.016);
  controller.input(hand('PALM', .16), 335);
  controller.update(.016);
  assert.ok(controller.velocity.y < 0);
  controller.clear(400);
  for (let index = 0; index < 120; index++) controller.update(1 / 60);
  assert.ok(Math.abs(controller.velocity.y) < .001);
});

test('fist freezes rotation and zoom, then open palm resumes control', () => {
  const controller = new GestureController();
  feed(controller, 'FIST', { start: 0, step: 40, count: 7 });
  assert.equal(controller.paused, true);
  controller.targetZoom = 1.5;
  const y = controller.rotation.y;
  const zoom = controller.zoom;
  for (let index = 0; index < 60; index++) controller.update(1 / 60);
  assert.equal(controller.rotation.y, y);
  assert.equal(controller.zoom, zoom);
  feed(controller, 'PALM', { start: 400, step: 40, count: 5 });
  assert.equal(controller.paused, false);
});

test('pinch zoom is normalized by palm size and remains bounded', () => {
  const stable = new GestureController();
  feed(stable, 'PINCH');
  for (let index = 0; index < 18; index++) {
    stable.input(hand('PINCH', 0, 1 + index * .04), 500 + index * 35);
    stable.update(.035);
  }
  assert.ok(Math.abs(stable.zoom - 1) < .03);

  const controller = new GestureController();
  feed(controller, 'PINCH');
  for (let index = 0; index < 22; index++) {
    const landmarks = hand('PINCH');
    const palm = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
    const ratio = .1 + index * .012;
    landmarks[4] = { ...landmarks[8], x: landmarks[8].x + palm * ratio };
    controller.input(landmarks, 500 + index * 35);
    controller.update(.035);
  }
  assert.ok(controller.zoom > 1.1);
  assert.ok(controller.cameraDistance >= 4.8 && controller.cameraDistance <= 11.3);
});

test('victory smoothly resets once and respects the reset cooldown', () => {
  const controller = new GestureController();
  controller.rotation = { x: .8, y: 2, z: 0 };
  controller.zoom = 1.5;
  controller.targetZoom = 1.5;
  feed(controller, 'VICTORY', { start: 0, step: 40, count: 7 });
  for (let index = 0; index < 240; index++) controller.update(1 / 60);
  assert.ok(Math.abs(controller.rotation.y - DEFAULT_VIEW.y) < .001);
  assert.ok(Math.abs(controller.zoom - 1) < .001);
});

test('backhand swipe right advances once, while a slow hand movement does not swipe', () => {
  const fast = new GestureController();
  feed(fast, 'BACKHAND', { start: 0, step: 35, count: 5 });
  for (let index = 0; index <= 9; index++) {
    fast.input(hand('BACKHAND', -.022 * index), 300 + index * 35);
    fast.update(.035);
  }
  assert.equal(fast.consumeCitySwipe(), 'NEXT_CITY');
  for (let index = 0; index < 20; index++) {
    fast.input(hand('BACKHAND', -.24), 700 + index * 35);
    fast.update(.035);
  }
  assert.equal(fast.consumeCitySwipe(), null);

  const slow = new GestureController();
  feed(slow, 'BACKHAND', { start: 0, step: 35, count: 5 });
  for (let index = 0; index <= 70; index++) {
    slow.input(hand('BACKHAND', -.003 * index), 300 + index * 35);
    slow.update(.035);
  }
  assert.equal(slow.consumeCitySwipe(), null);
});

test('arms a swipe while the backhand is settling and accepts a shorter responsive flick', () => {
  const controller = new GestureController();
  feed(controller, 'BACKHAND', { start: 0, step: 35, count: 2 });
  for (let index = 1; index <= 8; index++) {
    controller.input(hand('BACKHAND', -.016 * index), 70 + index * 35);
    controller.update(.035);
  }
  assert.equal(controller.consumeCitySwipe(), 'NEXT_CITY');
});

test('keeps one swipe to one city, then rearms after cooldown and a return to center', () => {
  const controller = new GestureController();
  feed(controller, 'BACKHAND', { start: 0, step: 35, count: 5 });
  for (let index = 1; index <= 10; index++) {
    controller.input(hand('BACKHAND', -.02 * index), 300 + index * 35);
    controller.update(.035);
  }
  assert.equal(controller.consumeCitySwipe(), 'NEXT_CITY');

  for (let index = 0; index < 24; index++) {
    controller.input(hand('BACKHAND', -.2), 700 + index * 35);
    controller.update(.035);
  }
  assert.equal(controller.consumeCitySwipe(), null);

  for (let index = 1; index <= 20; index++) {
    controller.input(hand('BACKHAND', -.2 + index * (.2 / 20)), 1600 + index * 35);
    controller.update(.035);
  }
  assert.equal(controller.swipeLocked, false);
});

test('three fingers trigger one meteor shower and require release plus cooldown', () => {
  const controller = new GestureController();
  for (let index = 0; index < 9; index++) {
    const landmarks = hand('THREE_FINGER');
    landmarks[4] = { ...landmarks[8], x: landmarks[8].x + .018, y: landmarks[8].y };
    controller.input(landmarks, index * 40);
    controller.update(.04);
  }
  assert.equal(controller.consumeMeteorTrigger(), true);
  for (let index = 0; index < 25; index++) {
    const landmarks = hand('THREE_FINGER');
    landmarks[4] = { ...landmarks[8], x: landmarks[8].x + .018, y: landmarks[8].y };
    controller.input(landmarks, 400 + index * 40);
    controller.update(.04);
  }
  assert.equal(controller.consumeMeteorTrigger(), false);
  controller.input(hand('BACKHAND'), 1500);
  feed(controller, 'THREE_FINGER', { start: 3000, step: 40, count: 9 });
  assert.equal(controller.consumeMeteorTrigger(), true);
});

test('open palm interrupts city flight promptly; victory remains distinct from meteor pose', () => {
  const controller = new GestureController();
  controller.focusLocation({ name: 'London', latitude: 51.5074, longitude: -.1278, cameraDistance: 2.7 });
  controller.input(hand('PALM'), 30);
  assert.equal(controller.locationFlight, null);

  assert.equal(classifyGesture(hand('VICTORY')), 'VICTORY');
  assert.equal(classifyGesture(hand('THREE_FINGER')), 'THREE_FINGER');
  feed(controller, 'VICTORY', { start: 100, step: 40, count: 7 });
  assert.equal(controller.pendingMeteorTrigger, false);
});

test('city focus rotates smoothly and zooms in', () => {
  const controller = new GestureController();
  const tokyo = { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, cameraDistance: 2.6, cameraTilt: .03 };
  assert.equal(controller.focusLocation(tokyo), true);
  for (let index = 0; index < 20; index++) controller.update(.05);
  assert.ok(controller.zoom > 1 && controller.zoom < 1.22);
  assert.ok(controller.locationFlight);
  for (let index = 0; index < 60; index++) controller.update(.05);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(controller.rotation.x, controller.rotation.y, controller.rotation.z, 'XYZ'));
  const latitude = THREE.MathUtils.degToRad(tokyo.latitude), longitude = THREE.MathUtils.degToRad(tokyo.longitude);
  const city = new THREE.Vector3(Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude)).applyQuaternion(rotation);
  assert.ok(city.x < .001 && city.y < .001 && city.z > .999);
  assert.equal(controller.locationFlight, null);
  assert.equal(controller.focusIntensity, 1);
});

test('keeps the last focused city for navigation after its HUD marker fades', () => {
  const controller = new GestureController();
  const tokyo = { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, cameraDistance: 2.6 };
  controller.focusLocation(tokyo);
  for (let index = 0; index < 180; index++) controller.update(.05);
  assert.equal(controller.focusedLocation, null);
  assert.equal(controller.lastFocusedLocation, tokyo);
});
