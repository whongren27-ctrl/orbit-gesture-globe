import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureStateMachine } from './GestureStateMachine.js';

test('uses responsive palm confirmation and deliberate confirmation for commands', () => {
  const machine = new GestureStateMachine();
  machine.update('PALM', .9, 0);
  assert.equal(machine.update('PALM', .9, 69).state, 'TRACKING');
  assert.equal(machine.update('PALM', .9, 70).state, 'ROTATE');

  machine.update('FIST', .9, 100);
  assert.equal(machine.update('FIST', .9, 234).state, 'ROTATE');
  assert.equal(machine.update('FIST', .9, 235).state, 'HOLD');

  machine.update('VICTORY', .9, 300);
  assert.equal(machine.update('VICTORY', .9, 479).action, null);
  assert.equal(machine.update('VICTORY', .9, 480).action, 'RESET');
});

test('requires confidence and applies pinch hysteresis through its stable transition', () => {
  const machine = new GestureStateMachine({ confidenceThreshold: .6 });
  assert.equal(machine.update('PINCH', .59, 0).state, 'IDLE');
  assert.equal(machine.update('PINCH', .9, 10).state, 'TRACKING');
  assert.equal(machine.update('PINCH', .9, 84).state, 'TRACKING');
  assert.equal(machine.update('PINCH', .9, 85).state, 'PINCH');
});

test('fires victory once and accepts another reset only after the cooldown', () => {
  const machine = new GestureStateMachine();
  machine.update('VICTORY', .9, 0);
  assert.equal(machine.update('VICTORY', .9, 180).action, 'RESET');
  machine.update('NONE', .9, 181);
  machine.update('VICTORY', .9, 300);
  assert.equal(machine.update('VICTORY', .9, 480).action, null);
  machine.update('NONE', .9, 1181);
  machine.update('VICTORY', .9, 1182);
  assert.equal(machine.update('VICTORY', .9, 1362).action, 'RESET');
});

test('requires backhand dwell and accepts a single city swipe state transition', () => {
  const machine = new GestureStateMachine();
  machine.update('BACKHAND', .9, 0);
  assert.equal(machine.update('BACKHAND', .9, 129).state, 'TRACKING');
  assert.equal(machine.update('BACKHAND', .9, 130).state, 'CITY_NAVIGATE');
  machine.setCitySwipe(160, 620);
  assert.equal(machine.update('BACKHAND', .9, 200).state, 'CITY_SWIPE');
});

test('re-arms meteor only after release and cooldown, then triggers once', () => {
  const machine = new GestureStateMachine();
  machine.update('THREE_FINGER', .9, 0);
  assert.equal(machine.update('THREE_FINGER', .9, 280).action, 'METEOR_SHOWER');
  machine.update('THREE_FINGER', .9, 300);
  assert.equal(machine.update('THREE_FINGER', .9, 3000).action, null);
  machine.update('BACKHAND', .9, 3001);
  machine.update('THREE_FINGER', .9, 3100);
  assert.equal(machine.update('THREE_FINGER', .9, 3380).action, 'METEOR_SHOWER');
});

test('holds a stable gesture through a brief classifier dropout', () => {
  const machine = new GestureStateMachine();
  machine.update('PALM', .9, 0);
  assert.equal(machine.update('PALM', .9, 70).state, 'ROTATE');
  assert.equal(machine.update('NONE', .9, 140).state, 'ROTATE');
  assert.equal(machine.update('NONE', .9, 190).state, 'TRACKING');
});
