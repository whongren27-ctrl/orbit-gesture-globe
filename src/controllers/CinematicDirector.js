import { locations } from '../data/locations.js';

const TOUR_NAMES = ['Tokyo', 'Singapore', 'Dubai', 'London', 'New York'];
const TOUR_STOPS = TOUR_NAMES.map(name => locations.find(location => location.name === name)).filter(Boolean);

export class CinematicDirector {
  constructor({ idleDelayMs = 10_000, dwellSeconds = 6, startAt = performance.now() } = {}) {
    this.idleDelayMs = idleDelayMs;
    this.dwellSeconds = dwellSeconds;
    this.lastActivityAt = startAt;
    this.lastActivityVersion = 0;
    this.active = false;
    this.currentIndex = -1;
    this.currentLocation = null;
    this.visitElapsed = 0;
  }

  update(delta, controller, { reducedMotion = false, now = performance.now() } = {}) {
    if (controller.activityVersion !== this.lastActivityVersion) {
      this.lastActivityVersion = controller.activityVersion;
      this.lastActivityAt = now;
      if (this.active) this.stop(controller, now);
      return;
    }

    if (controller.gesture === 'PALM' && !controller.paused) {
      this.lastActivityAt = now;
      if (this.active) this.stop(controller, now);
      return;
    }

    if (this.active) {
      if (controller.paused) return;
      this.visitElapsed += Math.min(delta, .1);
      if (this.visitElapsed >= this.dwellSeconds) {
        this.visitElapsed -= this.dwellSeconds;
        this.showNextLocation(controller, reducedMotion);
      }
      return;
    }

    if (!controller.paused && now - this.lastActivityAt >= this.idleDelayMs) {
      this.active = true;
      this.currentIndex = -1;
      this.visitElapsed = 0;
      this.showNextLocation(controller, reducedMotion);
    }
  }

  showNextLocation(controller, reducedMotion = false) {
    this.currentIndex = (this.currentIndex + 1) % TOUR_STOPS.length;
    this.currentLocation = TOUR_STOPS[this.currentIndex];
    controller.focusLocation(this.currentLocation, { reducedMotion, duration: 2.1, source: 'autopilot' });
  }

  stop(controller, now = performance.now()) {
    this.active = false;
    this.currentIndex = -1;
    this.currentLocation = null;
    this.visitElapsed = 0;
    this.lastActivityAt = now;
    this.lastActivityVersion = controller.activityVersion;
    controller.cancelLocationTransition({ returnToNormal: true });
  }
}

export default CinematicDirector;
