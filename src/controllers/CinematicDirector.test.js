import test from 'node:test';
import assert from 'node:assert/strict';
import { CinematicDirector } from './CinematicDirector.js';
import { GestureController } from '../gesture/GestureController.js';

test('starts the ordered city tour after inactivity and leaves on open palm', () => {
  const controller = new GestureController();
  const director = new CinematicDirector({ idleDelayMs: 1000, dwellSeconds: 6, startAt: 0 });
  director.update(.05, controller, { now: 999 });
  assert.equal(director.active, false);
  director.update(.05, controller, { now: 1000 });
  assert.equal(director.active, true);
  assert.equal(director.currentLocation.name, 'Tokyo');

  for (let frame = 0; frame < 61; frame++) director.update(.1, controller, { now: 1100 + frame * 100 });
  assert.equal(director.currentLocation.name, 'Singapore');
  assert.equal(controller.focusedLocation.name, 'Singapore');

  controller.gesture = 'PALM';
  director.update(1 / 60, controller, { now: 8000 });
  assert.equal(director.active, false);
  assert.equal(controller.locationFlight, null);
  assert.equal(controller.targetZoom, 1);
});

test('manual controller input interrupts autopilot without snapping the view', () => {
  const controller = new GestureController();
  const director = new CinematicDirector({ idleDelayMs: 0, startAt: 0 });
  director.update(.05, controller, { now: 1 });
  const before = { ...controller.rotation };
  controller.drag(6, 0);
  director.update(.05, controller, { now: 2 });
  assert.equal(director.active, false);
  assert.ok(Math.abs(controller.rotation.y - (before.y + .024)) < 1e-8);
});
