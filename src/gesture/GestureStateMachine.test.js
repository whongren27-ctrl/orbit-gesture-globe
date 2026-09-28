import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureStateMachine } from './GestureStateMachine.js';

test('confirms palm, pinch, and fist with their intended dwell windows', () => {
  const machine = new GestureStateMachine();
  machine.update('PALM', .9, 0);
  assert.equal(machine.update('PALM', .9, 70).state, 'ROTATE');
  machine.update('PINCH', .9, 100);
  assert.equal(machine.update('PINCH', .9, 175).state, 'PINCH');
  machine.update('FIST', .9, 200);
  assert.equal(machine.update('FIST', .9, 335).state, 'HOLD');
});

test('keeps a stable gesture through a brief classifier dropout', () => {
  const machine = new GestureStateMachine();
  machine.update('PALM', .9, 0);
  machine.update('PALM', .9, 70);
  assert.equal(machine.update('NONE', .9, 140).state, 'ROTATE');
  assert.equal(machine.update('NONE', .9, 190).state, 'TRACKING');
});

test('keeps the palm label while a city swipe animation is active', () => {
  const machine = new GestureStateMachine();
  machine.update('PALM', .9, 0);
  machine.update('PALM', .9, 70);
  machine.setCitySwipe(100, 460, 'PALM');
  assert.equal(machine.update('PALM', .9, 200).state, 'CITY_SWIPE');
  assert.equal(machine.gesture, 'PALM');
});

test('fires victory once and respects its reset cooldown', () => {
  const machine = new GestureStateMachine();
  machine.update('VICTORY', .9, 0);
  assert.equal(machine.update('VICTORY', .9, 180).action, 'RESET');
  machine.update('NONE', .9, 181);
  machine.update('VICTORY', .9, 300);
  assert.equal(machine.update('VICTORY', .9, 480).action, null);
});
