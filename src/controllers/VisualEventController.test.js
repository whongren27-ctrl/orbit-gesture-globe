import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualEventController, visualEventRules } from './VisualEventController.js';

function advance(controller, seconds, options) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) controller.update(0.05, options);
}

test('holds all events until their low-frequency timers expire', () => {
  const events = new VisualEventController({ random: () => 0, initialDelay: 1 });
  advance(events, 19.9);
  assert.equal(events.activeEvent, null);
  advance(events, 0.2);
  assert.equal(events.activeEvent.type, 'GLOBAL_NETWORK_BURST');
  assert.ok(events.activeEvent.duration >= 2.4 && events.activeEvent.duration <= 4);
});

test('runs one event at a time and leaves a quiet gap between events', () => {
  const events = new VisualEventController({ random: () => 0, initialDelay: 1 });
  advance(events, 20.1);
  const firstId = events.activeEvent.id;
  advance(events, events.activeEvent.duration + 0.2);
  assert.equal(events.activeEvent, null);
  assert.equal(events.sequence, firstId);
  advance(events, 1.8);
  assert.equal(events.activeEvent, null);
  advance(events, 0.3);
  assert.equal(events.sequence, firstId);
  advance(events, 2.5);
  assert.equal(events.sequence, firstId + 1);
});

test('defines the requested rare meteor and satellite windows', () => {
  assert.deepEqual(Object.keys(visualEventRules).sort(), [
    'CAMERA_FLYBY', 'CITY_PULSE', 'GLOBAL_NETWORK_BURST', 'METEOR_SHOWER', 'SATELLITE_PASS', 'SOLAR_FLARE',
  ]);
  assert.deepEqual(visualEventRules.METEOR_SHOWER.interval, [30, 60]);
  assert.deepEqual(visualEventRules.GLOBAL_NETWORK_BURST.interval, [20, 40]);
  assert.deepEqual(visualEventRules.SATELLITE_PASS.interval, [45, 90]);
});
