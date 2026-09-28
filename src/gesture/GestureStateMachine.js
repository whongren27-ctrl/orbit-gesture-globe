export const GESTURE_DWELL_MS = Object.freeze({
  PALM: 70,
  PINCH: 75,
  FIST: 135,
  VICTORY: 180,
});

const STABLE_GESTURE = Object.freeze({
  PALM: 'PALM',
  PINCH: 'PINCH',
  FIST: 'FIST',
  VICTORY: 'VICTORY',
});

const STABLE_STATE = Object.freeze({
  PALM: 'ROTATE',
  PINCH: 'PINCH',
  FIST: 'HOLD',
  VICTORY: 'RESET',
});

export class GestureStateMachine {
  constructor({ confidenceThreshold = .45, resetCooldownMs = 1000, meteorCooldownMs = 2500 } = {}) {
    this.confidenceThreshold = confidenceThreshold;
    this.resetCooldownMs = resetCooldownMs;
    this.meteorCooldownMs = meteorCooldownMs;
    this.state = 'IDLE';
    this.gesture = 'NONE';
    this.previousGesture = 'NONE';
    this.currentGesture = 'NONE';
    this.rawGesture = 'NONE';
    this.candidate = null;
    this.candidateSince = 0;
    this.gestureStartTime = 0;
    this.gestureStableTime = 0;
    this.cooldownUntil = 0;
    this.lastResetAt = -Infinity;
    this.victoryLatched = false;
    this.cityFocusLocked = false;
    this.citySwipeUntil = 0;
    this.lastStableAt = -Infinity;
    this.dropoutGraceMs = 110;
  }

  update(rawGesture, confidence, now = performance.now(), hasHand = true) {
    this.rawGesture = hasHand ? rawGesture || 'NONE' : 'NONE';
    if (!hasHand) {
      const changed = this.state !== 'IDLE' || this.gesture !== 'NONE';
      this.previousGesture = this.gesture;
      this.currentGesture = 'NONE';
      this.gesture = 'NONE';
      this.candidate = null;
      this.candidateSince = 0;
      this.gestureStartTime = 0;
      this.gestureStableTime = 0;
      this.cityFocusLocked = false;
      this.victoryLatched = false;
      this.citySwipeUntil = 0;
      this.lastStableAt = -Infinity;
      this.state = 'IDLE';
      return this.result(changed, null, 0);
    }

    if (!Number.isFinite(confidence) || confidence < this.confidenceThreshold) {
      if (this.gesture !== 'NONE' && now - this.lastStableAt <= this.dropoutGraceMs) return this.result(false, null, 0);
      this.candidate = null;
      this.candidateSince = now;
      this.gestureStartTime = now;
      this.gestureStableTime = 0;
      this.previousGesture = this.gesture;
      this.currentGesture = 'NONE';
      this.gesture = 'NONE';
      if (this.state !== 'IDLE' && this.state !== 'RESET' && this.state !== 'METEOR_TRIGGERED') this.state = 'TRACKING';
      this.cityFocusLocked = false;
      return this.result(false, null, 0);
    }

    if (this.state === 'IDLE') this.state = 'TRACKING';
    const gesture = Object.hasOwn(STABLE_GESTURE, rawGesture) ? rawGesture : 'NONE';

    if (gesture !== 'VICTORY') this.victoryLatched = false;

    if (this.cityFocusLocked && gesture === 'PINCH') {
      this.previousGesture = this.gesture;
      this.currentGesture = 'PINCH';
      this.gesture = 'PINCH';
      this.candidate = null;
      this.gestureStableTime = 0;
      this.lastStableAt = now;
      return this.result(false, null, 1);
    }
    if (this.cityFocusLocked && gesture !== 'PINCH') {
      this.cityFocusLocked = false;
      this.state = 'TRACKING';
      this.gesture = 'NONE';
    }

    if (gesture === 'NONE') {
      if (this.gesture !== 'NONE' && now - this.lastStableAt <= this.dropoutGraceMs) return this.result(false, null, 0);
      this.candidate = null;
      this.candidateSince = now;
      this.gestureStartTime = now;
      this.gestureStableTime = 0;
      this.previousGesture = this.gesture;
      this.currentGesture = 'NONE';
      this.gesture = 'NONE';
      this.citySwipeUntil = 0;
      if (this.state !== 'IDLE') this.state = 'TRACKING';
      return this.result(false, null, 0);
    }

    if (gesture !== this.candidate) {
      this.candidate = gesture;
      this.candidateSince = now;
      this.gestureStartTime = now;
      this.gestureStableTime = 0;
      return this.result(false, null, 0);
    }

    const dwell = GESTURE_DWELL_MS[gesture];
    this.gestureStableTime = Math.max(0, now - this.candidateSince);
    const stabilityConfidence = Math.min(1, this.gestureStableTime / dwell);
    if (this.gestureStableTime < dwell) {
      return this.result(false, null, stabilityConfidence);
    }

    if (gesture === 'VICTORY' && confidence < .72) return this.result(false, null, stabilityConfidence);
    if (gesture === 'VICTORY') {
      if (this.victoryLatched || now - this.lastResetAt < this.resetCooldownMs) return this.result(false, null, stabilityConfidence);
      this.victoryLatched = true;
      this.lastResetAt = now;
      this.cooldownUntil = now + this.resetCooldownMs;
    }

    const nextGesture = STABLE_GESTURE[gesture];
    const nextState = STABLE_STATE[gesture];
    const changed = this.state !== nextState || this.gesture !== nextGesture;
    this.previousGesture = this.gesture;
    this.currentGesture = nextGesture;
    this.gesture = nextGesture;
    if (this.state !== 'CITY_SWIPE' || now >= this.citySwipeUntil || gesture !== 'PALM') this.state = nextState;
    this.lastStableAt = now;
    const action = gesture === 'VICTORY' && changed ? 'RESET' : null;
    return this.result(changed, action, stabilityConfidence);
  }

  enterCityFocus({ lockPinch = false } = {}) {
    this.state = 'CITY_FOCUS';
    this.gesture = lockPinch ? 'PINCH' : this.gesture;
    this.currentGesture = this.gesture;
    this.cityFocusLocked = lockPinch;
    this.candidate = null;
    this.candidateSince = 0;
    this.gestureStartTime = 0;
    this.gestureStableTime = 0;
    this.lastStableAt = performance.now();
  }

  leaveCityFocus() {
    if (this.state === 'CITY_FOCUS') this.state = 'TRACKING';
    this.cityFocusLocked = false;
    this.candidate = null;
  }

  setCitySwipe(now, duration = 560, gesture = 'PALM') {
    this.state = 'CITY_SWIPE';
    this.gesture = gesture;
    this.currentGesture = gesture;
    this.citySwipeUntil = now + duration;
    this.lastStableAt = now;
  }

  forceReset(gesture = 'NONE') {
    this.state = 'RESET';
    this.previousGesture = this.gesture;
    this.currentGesture = gesture;
    this.gesture = gesture;
    this.candidate = null;
  }

  result(changed, action, stabilityConfidence) {
    return {
      state: this.state,
      gesture: this.gesture,
      previousGesture: this.previousGesture,
      currentGesture: this.currentGesture,
      rawGesture: this.rawGesture,
      candidate: this.candidate,
      gestureStartTime: this.gestureStartTime,
      gestureStableTime: this.gestureStableTime,
      cooldownUntil: this.cooldownUntil,
      changed,
      action,
      stabilityConfidence,
    };
  }
}

export default GestureStateMachine;
