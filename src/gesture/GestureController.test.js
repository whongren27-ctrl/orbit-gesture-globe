import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureController, DEFAULT_VIEW } from './GestureController.js';
import { classifyGesture } from '../utils/gestureMath.js';

function hand(type = 'PALM', offset = 0) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: .5 + offset, y: .65, z: 0 }));
  landmarks[0] = { x: .5 + offset, y: .8, z: 0 };
  landmarks[4] = { x: .25 + offset, y: .54, z: 0 };
  for (const [base, x] of [[5, .40], [9, .48], [13, .56], [17, .64]]) {
    landmarks[base] = { x: x + offset, y: .62, z: 0 };
    landmarks[base + 1] = { x: x + offset, y: .48, z: 0 };
    landmarks[base + 2] = { x: x + offset, y: .38, z: 0 };
    landmarks[base + 3] = { x: x + offset, y: .28, z: 0 };
  }
  for (const tip of ({ FIST: [8, 12, 16, 20], VICTORY: [16, 20], PINCH: [12, 16, 20] }[type] || [])) landmarks[tip] = { ...landmarks[tip], y: .72 };
  if (type === 'PINCH') landmarks[4] = { ...landmarks[8], x: landmarks[8].x + .015 };
  return landmarks;
}

function feed(controller, type, { start = 0, step = 40, count = 6 } = {}) {
  for (let index = 0; index < count; index++) {
    controller.input(hand(type), start + index * step);
    controller.update(step / 1000);
  }
}

test('recognizes the supported single-hand poses', () => {
  for (const pose of ['PALM', 'PINCH', 'FIST', 'VICTORY']) assert.equal(classifyGesture(hand(pose)), pose);
});

test('open palm rotates the globe with damped inertia', () => {
  const controller = new GestureController();
  feed(controller, 'PALM');
  for (let index = 1; index <= 15; index++) {
    controller.input(hand('PALM', -index * .012), 300 + index * 35);
    controller.update(.035);
  }
  assert.ok(controller.rotation.y > DEFAULT_VIEW.y + .14);
  assert.ok(Math.abs(controller.velocity.y) > .01);
});

test('holding pinch zooms in and holding a fist zooms out', () => {
  const controller = new GestureController();
  feed(controller, 'PINCH');
  for (let index = 0; index < 20; index++) { controller.input(hand('PINCH'), 300 + index * 40); controller.update(.04); }
  const zoomedIn = controller.targetZoom;
  assert.ok(zoomedIn > 1.2);
  feed(controller, 'FIST', { start: 1200 });
  for (let index = 0; index < 20; index++) { controller.input(hand('FIST'), 1500 + index * 40); controller.update(.04); }
  assert.ok(controller.targetZoom < zoomedIn);
});

test('a fast open-palm swipe changes city while a slow movement does not', () => {
  const fast = new GestureController();
  feed(fast, 'PALM');
  for (let index = 0; index <= 8; index++) { fast.input(hand('PALM', -.02 * index), 300 + index * 35); fast.update(.035); }
  assert.equal(fast.consumeCitySwipe(), 'NEXT_CITY');

  const slow = new GestureController();
  feed(slow, 'PALM');
  for (let index = 0; index <= 55; index++) { slow.input(hand('PALM', -.003 * index), 300 + index * 35); slow.update(.035); }
  assert.equal(slow.consumeCitySwipe(), null);
});

test('two open palms swiped together trigger one meteor event', () => {
  const controller = new GestureController();
  for (let index = 0; index < 7; index++) {
    const first = hand('PALM', -.12);
    const second = hand('PALM', .12);
    controller.input(first, index * 40, 1, 'Right', [first, second], ['Right', 'Left']);
    controller.update(.04);
  }
  for (let index = 1; index <= 6; index++) {
    const first = hand('PALM', -.12 + index * .018);
    const second = hand('PALM', .12 + index * .018);
    controller.input(first, 300 + index * 40, 1, 'Right', [first, second], ['Right', 'Left']);
    controller.update(.04);
  }
  assert.equal(controller.consumeMeteorTrigger(), true);
  assert.equal(controller.consumeMeteorTrigger(), false);
});

test('victory resets the view smoothly', () => {
  const controller = new GestureController();
  controller.rotation = { x: .8, y: 2, z: 0 };
  feed(controller, 'VICTORY');
  for (let index = 0; index < 240; index++) controller.update(1 / 60);
  assert.ok(Math.abs(controller.rotation.y - DEFAULT_VIEW.y) < .001);
});
