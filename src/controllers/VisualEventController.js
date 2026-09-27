const EVENT_RULES = {
  METEOR_SHOWER: { interval: [30, 60], duration: [2.4, 3.8] },
  CITY_PULSE: { interval: [22, 38], duration: [2.0, 3.2] },
  GLOBAL_NETWORK_BURST: { interval: [20, 40], duration: [2.4, 4.0] },
  SATELLITE_PASS: { interval: [45, 90], duration: [5.0, 8.0] },
  SOLAR_FLARE: { interval: [48, 88], duration: [2.4, 4.2] },
  CAMERA_FLYBY: { interval: [28, 52], duration: [1.4, 2.6] },
};

const CITY_TARGETS = ['TOKYO', 'SINGAPORE', 'DUBAI', 'LONDON', 'NEW YORK', 'SHANGHAI', 'SYDNEY'];

export class VisualEventController {
  constructor({ random = Math.random, initialDelay = 1 } = {}) {
    this.random = random;
    this.time = 0;
    this.sequence = 0;
    this.activeEvent = null;
    this.lastEvent = null;
    this.quietUntil = 0;
    this.nextAt = Object.fromEntries(Object.entries(EVENT_RULES).map(([type, rule]) => [
      type,
      this.range(rule.interval) * initialDelay,
    ]));
  }

  update(delta, { reducedMotion = false } = {}) {
    const step = Math.max(0, Math.min(delta, 0.1));
    this.time += step;

    if (reducedMotion) {
      if (this.activeEvent) {
        this.activeEvent = null;
        this.quietUntil = this.time + this.range([3, 6]);
      }
      return null;
    }

    if (this.activeEvent) {
      const event = this.activeEvent;
      event.elapsed = Math.min(event.duration, event.elapsed + step);
      event.progress = event.duration ? event.elapsed / event.duration : 1;
      if (event.elapsed >= event.duration) {
        this.activeEvent = null;
        this.quietUntil = this.time + this.range([3, 6]);
      }
      return this.activeEvent;
    }

    if (this.time < this.quietUntil) return null;
    const due = Object.keys(EVENT_RULES).filter(type => this.nextAt[type] <= this.time);
    if (!due.length) return null;

    const type = due[Math.floor(this.random() * due.length)];
    const rule = EVENT_RULES[type];
    const event = {
      id: ++this.sequence,
      type,
      elapsed: 0,
      duration: this.range(rule.duration),
      progress: 0,
      payload: this.createPayload(type),
    };
    this.activeEvent = event;
    this.lastEvent = event;
    this.nextAt[type] = this.time + this.range(rule.interval);

    // If several clocks expire together, re-arm the others so effects never chain back-to-back.
    for (const waitingType of due) {
      if (waitingType !== type) {
        this.nextAt[waitingType] = this.time + this.range(EVENT_RULES[waitingType].interval);
      }
    }
    return event;
  }

  /** User-triggered events take priority over the quiet timer and any lower-priority visual event. */
  trigger(type, payload = {}, { duration } = {}) {
    const rule = EVENT_RULES[type];
    if (!rule) return null;
    const eventPayload = { ...payload };
    if (type === 'METEOR_SHOWER') {
      eventPayload.count = Math.max(12, Math.min(30, Math.round(eventPayload.count || 12 + this.random() * 19)));
    }
    const event = {
      id: ++this.sequence,
      type,
      elapsed: 0,
      duration: duration || (type === 'METEOR_SHOWER' ? 3 : this.range(rule.duration)),
      progress: 0,
      payload: Object.keys(eventPayload).length ? eventPayload : this.createPayload(type),
      source: 'gesture',
    };
    this.activeEvent = event;
    this.lastEvent = event;
    this.nextAt[type] = this.time + this.range(rule.interval);
    this.quietUntil = 0;
    return event;
  }

  createPayload(type) {
    if (type === 'METEOR_SHOWER') return { count: 15 + Math.floor(this.random() * 26) };
    if (type === 'CITY_PULSE') return { cityName: CITY_TARGETS[Math.floor(this.random() * CITY_TARGETS.length)] };
    if (type === 'GLOBAL_NETWORK_BURST') return { cityName: CITY_TARGETS[Math.floor(this.random() * CITY_TARGETS.length)] };
    return {};
  }

  range([minimum, maximum]) {
    return minimum + this.random() * (maximum - minimum);
  }
}

export const visualEventRules = EVENT_RULES;
export default VisualEventController;
