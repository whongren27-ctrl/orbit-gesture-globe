import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureStateMachine } from './GestureStateMachine.js';

test('uses short stable windows for palm and pinch, and longer windows for fist and victory', () => {
  const machine = new GestureStateMachine();
  machine.update('PALM', .9, 0);
  assert.equal(machine.update('PALM', .9, 64).state, 'TRACKING');
  assert.equal(machine.update('PALM', .9, 65).state, 'ROTATE');

  machine.update('FIST', .9, 100);
  assert.equal(machine.update('FIST', .9, 214).state, 'ROTATE');
  assert.equal(machine.update('FIST', .9, 215).state, 'HOLD');

  machine.update('VICTORY', .9, 300);
  assert.equal(machine.update('VICTORY', .9, 449).action, null);
  assert.equal(machine.update('VICTORY', .9, 450).action, 'RESET');
});

test('requires confidence and applies pinch hysteresis through its stable transition', () => {
  const machine = new GestureStateMachine({ confidenceThreshold: .6 });
  assert.equal(machine.update('PINCH', .59, 0).state, 'IDLE');
  assert.equal(machine.update('PINCH', .9, 10).state, 'TRACKING');
  assert.equal(machine.update('PINCH', .9, 64).state, 'TRACKING');
  assert.equal(machine.update('PINCH', .9, 65).state, 'PINCH');
});

test('fires victory once and accepts another reset only after the cooldown', () => {
  const machine = new GestureStateMachine();
  machine.update('VICTORY', .9, 0);
  assert.equal(machine.update('VICTORY', .9, 150).action, 'RESET');
  machine.update('NONE', .9, 151);
  machine.update('VICTORY', .9, 300);
  assert.equal(machine.update('VICTORY', .9, 450).action, null);
  machine.update('NONE', .9, 1001);
  machine.update('VICTORY', .9, 1002);
  assert.equal(machine.update('VICTORY', .9, 1152).action, 'RESET');
});

test('requires backhand dwell and accepts a single city swipe state transition', () => {
  const machine = new GestureStateMachine();
  machine.update('BACKHAND', .9, 0);
  assert.equal(machine.update('BACKHAND', .9, 69).state, 'TRACKING');
  assert.equal(machine.update('BACKHAND', .9, 70).state, 'CITY_NAVIGATE');
  machine.setCitySwipe(100, 620);
  assert.equal(machine.update('BACKHAND', .9, 200).state, 'CITY_SWIPE');
});

test('re-arms meteor only after release and cooldown, then triggers once', () => {
  const machine = new GestureStateMachine();
  machine.update('THREE_FINGER', .9, 0);
  assert.equal(machine.update('THREE_FINGER', .9, 250).action, 'METEOR_SHOWER');
  machine.update('THREE_FINGER', .9, 300);
  assert.equal(machine.update('THREE_FINGER', .9, 3000).action, null);
  machine.update('BACKHAND', .9, 3001);
  machine.update('THREE_FINGER', .9, 3100);
  assert.equal(machine.update('THREE_FINGER', .9, 3350).action, 'METEOR_SHOWER');
});
