import * as THREE from 'three';
import { clamp, deadZone, lerp, classifyGestureDetails, normalizeHandCoordinates, OneEuroFilter } from '../utils/gestureMath.js';
import { cameraDistanceToZoom, DEFAULT_CAMERA_DISTANCE, normalizedPinchDistance, zoomToCameraDistance } from '../utils/cameraMath.js';
import { GESTURE_DWELL_MS, GestureStateMachine } from './GestureStateMachine.js';

export const DEFAULT_VIEW = { x: .13, y: -.42, zoom: 1 };
export const GESTURE_CONFIG = Object.freeze({
  // Keep the dead zone below normal landmark drift, but let intentional palm
  // movement reach rotational velocity on the next tracking samples.
  rotation: { sensitivityX: 2.45, sensitivityY: 2.7, deadZone: .0055, damping: .93, response: .52 },
  // A short, deliberate back-of-hand flick should be enough to advance a city.
  swipe: { distance: .06, velocity: .09, maxDurationMs: 850, cooldownMs: 460, horizontalRatio: .95 },
});

const easeInOutCubic = value => value < .5
  ? 4 * value ** 3
  : 1 - ((-2 * value + 2) ** 3) / 2;

export class GestureController {
  constructor() {
    this.rotation = { x: DEFAULT_VIEW.x, y: DEFAULT_VIEW.y, z: 0 };
    this.zoom = 1;
    this.targetZoom = 1;
    this.cameraDistance = DEFAULT_CAMERA_DISTANCE;
    this.targetCameraDistance = DEFAULT_CAMERA_DISTANCE;
    this.velocity = { x: 0, y: 0 };
    this.targetAngularVelocity = { x: 0, y: 0 };
    this.angularInputHold = 0;
    this.gesture = 'NONE';
    this.rawGesture = 'NONE';
    this.gestureConfidence = 0;
    this.machineState = 'IDLE';
    this.stateMachine = new GestureStateMachine();
    this.candidate = 'NONE';
    this.count = 0;
    this.smooth = null;
    this.lastRawCenter = null;
    this.lastTime = 0;
    this.previousSmoothX = null;
    this.previousSmoothY = null;
    this.handFilterX = new OneEuroFilter({ minCutoff: 1.45, beta: 2.15, minAlpha: .25, maxAlpha: .82 });
    this.handFilterY = new OneEuroFilter({ minCutoff: 1.45, beta: 2.15, minAlpha: .25, maxAlpha: .82 });
    this.indexFilterX = new OneEuroFilter({ minCutoff: 3.2, beta: 1.85, minAlpha: .25, maxAlpha: .9 });
    this.indexFilterY = new OneEuroFilter({ minCutoff: 3.2, beta: 1.85, minAlpha: .25, maxAlpha: .9 });
    this.resetting = false;
    this.paused = false;
    this.lastPinch = null;
    this.locationFlight = null;
    this.focusedLocation = null;
    this.lastFocusedLocation = null;
    this.focusIntensity = 0;
    this.focusTimer = -1;
    this.focusSequence = 0;
    this.activityVersion = 0;
    this.handNdc = { x: 0, y: 0 };
    this.indexNdc = { x: 0, y: 0 };
    this.pinchNdc = { x: 0, y: 0 };
    this.indexPosition = null;
    this.hasHand = false;
    this.confidence = 0;
    this.pinchSequence = 0;
    this.hoveredCity = null;
    this.flightQuaternion = new THREE.Quaternion();
    this.flightEuler = new THREE.Euler();
    this.swipeSession = null;
    this.swipeLocked = false;
    this.swipeCooldownUntil = 0;
    this.swipeDeltaX = 0;
    this.swipeVelocity = 0;
    this.pendingCitySwipe = null;
    this.pendingMeteorTrigger = false;
    this.gestureAction = '';
    this.gestureActionUntil = 0;
    this.debug = {
      rawGesture: 'NONE', stableGesture: 'NONE', handX: 0, handY: 0,
      indexX: 0, indexY: 0, deltaX: 0, swipeVelocity: 0,
      gestureConfidence: 0, fingerScores: [0, 0, 0, 0], surface: 'UNKNOWN', handedness: 'Right', pinchRatio: 0, state: 'IDLE',
    };
  }

  markActivity() { this.activityVersion++; }

  setGestureAction(action, now = performance.now(), duration = 1100) {
    this.gestureAction = action;
    this.gestureActionUntil = now + duration;
  }

  consumeCitySwipe() {
    const direction = this.pendingCitySwipe;
    this.pendingCitySwipe = null;
    return direction;
  }

  consumeMeteorTrigger() {
    const triggered = this.pendingMeteorTrigger;
    this.pendingMeteorTrigger = false;
    return triggered;
  }

  reset({ fromGesture = false } = {}) {
    this.markActivity();
    this.locationFlight = null;
    this.focusedLocation = null;
    this.lastFocusedLocation = null;
    this.focusIntensity = 0;
    this.focusTimer = -1;
    this.resetting = true;
    this.paused = false;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.targetAngularVelocity.x = 0;
    this.targetAngularVelocity.y = 0;
    this.targetZoom = 1;
    this.targetCameraDistance = DEFAULT_CAMERA_DISTANCE;
    this.angularInputHold = 0;
    this.lastPinch = null;
    this.hoveredCity = null;
    this.swipeSession = null;
    this.stateMachine.forceReset(fromGesture ? 'VICTORY' : 'NONE');
    this.machineState = 'RESET';
    this.gesture = fromGesture ? 'VICTORY' : 'NONE';
  }

  cancelLocationTransition({ returnToNormal = false } = {}) {
    this.locationFlight = null;
    if (returnToNormal) {
      this.targetZoom = 1;
      this.targetCameraDistance = DEFAULT_CAMERA_DISTANCE;
      if (this.focusedLocation) this.focusTimer = this.focusIntensity * 1.2;
      else this.focusIntensity = 0;
      if (this.machineState === 'CITY_FOCUS') {
        this.stateMachine.leaveCityFocus();
        this.machineState = this.stateMachine.state;
      }
    }
  }

  focusLocation(location, { reducedMotion = false, duration, source = 'manual' } = {}) {
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return false;
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z || 0, 'XYZ'));
    const latitude = THREE.MathUtils.degToRad(location.latitude);
    const longitude = THREE.MathUtils.degToRad(location.longitude);
    const cityDirection = new THREE.Vector3(
      Math.cos(latitude) * Math.sin(longitude),
      Math.sin(latitude),
      Math.cos(latitude) * Math.cos(longitude),
    ).applyQuaternion(start).normalize();
    const align = new THREE.Quaternion().setFromUnitVectors(cityDirection, new THREE.Vector3(0, 0, 1));
    const target = align.multiply(start);
    const tilt = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      THREE.MathUtils.clamp(location.cameraTilt || 0, -.18, .18),
    );
    target.premultiply(tilt).normalize();

    const normalDistance = 3.6;
    this.focusedLocation = location;
    this.lastFocusedLocation = location;
    this.focusSequence++;
    this.focusIntensity = 0;
    this.focusTimer = -1;
    this.paused = false;
    this.resetting = false;
    this.lastPinch = null;
    this.hoveredCity = null;
    this.swipeSession = null;
    if (source === 'gesture') {
      this.stateMachine.enterCityFocus({ lockPinch: true });
      this.machineState = 'CITY_FOCUS';
      this.gesture = 'PINCH';
    } else if (source === 'manual' || source === 'swipe') {
      this.stateMachine.enterCityFocus();
      this.machineState = 'CITY_FOCUS';
    }
    this.locationFlight = {
      start,
      target,
      elapsed: 0,
      duration: reducedMotion ? .65 : THREE.MathUtils.clamp(duration || location.transitionDuration || 2.25, 1.2, 3),
      targetZoom: THREE.MathUtils.clamp(1 + ((normalDistance - (location.cameraDistance || 2.6)) / (normalDistance - 2.55)) * .22, 1, 1.22),
      inertia: THREE.MathUtils.clamp(this.velocity.y * .012, -.012, .012),
    };
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.targetAngularVelocity.x = 0;
    this.targetAngularVelocity.y = 0;
    return true;
  }

  interruptLocationFlight() {
    if (!this.locationFlight) return;
    this.locationFlight = null;
    this.focusTimer = this.focusIntensity > .05 ? Math.max(this.focusTimer, 1.2) : -1;
    if (this.machineState === 'CITY_FOCUS' || this.stateMachine.state === 'CITY_FOCUS') {
      this.stateMachine.leaveCityFocus();
      this.machineState = this.stateMachine.state;
    }
  }

  clear(time = performance.now()) {
    this.stateMachine.update('NONE', 0, time, false);
    this.gesture = 'NONE';
    this.rawGesture = 'NONE';
    this.machineState = 'IDLE';
    this.candidate = 'NONE';
    this.count = 0;
    this.smooth = null;
    this.lastRawCenter = null;
    this.lastTime = 0;
    this.previousSmoothX = null;
    this.previousSmoothY = null;
    this.handFilterX.reset();
    this.handFilterY.reset();
    this.indexFilterX.reset();
    this.indexFilterY.reset();
    this.lastPinch = null;
    this.swipeSession = null;
    this.hasHand = false;
    this.confidence = 0;
    this.gestureConfidence = 0;
    this.targetAngularVelocity.x = 0;
    this.targetAngularVelocity.y = 0;
    this.angularInputHold = 0;
    this.hoveredCity = null;
    this.debug.rawGesture = 'NONE';
    this.debug.stableGesture = 'NONE';
    this.debug.fingerScores = [0, 0, 0, 0];
    this.debug.surface = 'UNKNOWN';
    this.debug.handedness = 'Right';
    this.debug.pinchRatio = 0;
    this.debug.state = 'IDLE';
  }

  input(landmarks, time = performance.now(), confidence = 1, handedness = 'Right') {
    if (!landmarks || landmarks.length !== 21) {
      this.clear(time);
      return;
    }

    const dt = this.lastTime ? clamp((time - this.lastTime) / 1000, 1 / 120, .12) : 1 / 30;
    this.lastTime = time;
    this.hasHand = true;
    this.confidence = Number.isFinite(confidence) ? clamp(confidence, 0, 1) : 0;

    const details = classifyGestureDetails(landmarks, this.gesture, handedness);
    const raw = details.gesture;
    this.rawGesture = raw;
    if (this.locationFlight && raw === 'PALM') this.interruptLocationFlight();

    const dwell = GESTURE_DWELL_MS[raw] || 100;
    const stableMs = this.stateMachine.candidate === raw ? Math.max(0, time - this.stateMachine.candidateSince) : 0;
    const stabilityConfidence = clamp(stableMs / dwell, 0, 1);
    this.gestureConfidence = details.fingerConfidence * .5 + this.confidence * .3 + stabilityConfidence * .2;
    const previousState = this.machineState;
    const transition = this.stateMachine.update(raw, this.gestureConfidence, time, true);
    this.machineState = transition.state;
    this.gesture = transition.gesture;
    if (this.machineState === 'METEOR_READY' && raw === 'THREE_FINGER') this.gesture = 'METEOR';
    this.candidate = transition.candidate || 'NONE';
    this.count = transition.candidate ? 1 : 0;
    if (transition.action === 'RESET') this.reset({ fromGesture: true });
    if (transition.action === 'METEOR_SHOWER') {
      this.pendingMeteorTrigger = true;
      this.markActivity();
      this.setGestureAction('METEOR EVENT', time, 1400);
    }

    this.paused = this.machineState === 'HOLD';
    if (this.machineState === 'ROTATE' || this.machineState === 'PINCH' || this.machineState === 'CITY_NAVIGATE' || this.machineState === 'CITY_SWIPE') {
      this.resetting = false;
    }
    if (this.machineState === 'PINCH' && previousState !== 'PINCH') this.pinchSequence++;
    if (this.gestureConfidence >= .55 && raw !== 'NONE') this.markActivity();

    const center = {
      x: 1 - (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[17].x) / 4,
      y: (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[17].y) / 4,
    };
    const rawSpeed = this.lastRawCenter
      ? Math.hypot(center.x - this.lastRawCenter.x, center.y - this.lastRawCenter.y) / dt
      : 0;
    this.lastRawCenter = { ...center };
    this.smooth = {
      x: this.handFilterX.filter(center.x, time),
      y: this.handFilterY.filter(center.y, time),
      speed: rawSpeed,
    };
    this.handNdc.x = this.smooth.x * 2 - 1;
    this.handNdc.y = 1 - this.smooth.y * 2;

    const index = normalizeHandCoordinates(landmarks[8]);
    this.indexPosition = {
      x: this.indexFilterX.filter(index.x, time),
      y: this.indexFilterY.filter(index.y, time),
    };
    this.indexNdc.x = this.indexPosition.x * 2 - 1;
    this.indexNdc.y = 1 - this.indexPosition.y * 2;
    this.pinchNdc.x = (1 - (landmarks[4].x + landmarks[8].x) / 2) * 2 - 1;
    this.pinchNdc.y = 1 - ((landmarks[4].y + landmarks[8].y) / 2) * 2;

    this.updateSwipe(raw, time, dt);
    const confidentGesture = this.gestureConfidence >= .5;
    if (!confidentGesture || this.gesture !== 'PALM' || this.machineState !== 'ROTATE' || this.paused) {
      this.targetAngularVelocity.x = 0;
      this.targetAngularVelocity.y = 0;
      this.angularInputHold = 0;
    } else {
      const dx = deadZone((this.smooth.x - (this.previousSmoothX ?? this.smooth.x)) / dt, GESTURE_CONFIG.rotation.deadZone);
      const dy = deadZone((this.smooth.y - (this.previousSmoothY ?? this.smooth.y)) / dt, GESTURE_CONFIG.rotation.deadZone);
      this.targetAngularVelocity.y = clamp(dx * GESTURE_CONFIG.rotation.sensitivityY, -3.5, 3.5);
      this.targetAngularVelocity.x = clamp(dy * GESTURE_CONFIG.rotation.sensitivityX, -2.6, 2.6);
      this.angularInputHold = dx !== 0 || dy !== 0 ? .09 : 0;
    }
    this.previousSmoothX = this.smooth.x;
    this.previousSmoothY = this.smooth.y;

    if (confidentGesture && this.gesture === 'PINCH' && this.machineState === 'PINCH' && !this.paused) {
      const normalizedPinch = normalizedPinchDistance(landmarks);
      if (this.lastPinch) {
        this.targetZoom = clamp(this.targetZoom * Math.exp(deadZone(Math.log(normalizedPinch / this.lastPinch), .008) * 2.25), .7, 1.65);
        this.targetCameraDistance = zoomToCameraDistance(this.targetZoom);
      }
      this.lastPinch = lerp(this.lastPinch ?? normalizedPinch, normalizedPinch, .45);
      this.targetAngularVelocity.x = 0;
      this.targetAngularVelocity.y = 0;
    } else if (this.gesture !== 'PINCH') this.lastPinch = null;

    this.debug.rawGesture = raw;
    this.debug.stableGesture = this.gesture;
    this.debug.handX = this.smooth.x;
    this.debug.handY = this.smooth.y;
    this.debug.indexX = this.indexPosition.x;
    this.debug.indexY = this.indexPosition.y;
    this.debug.deltaX = this.swipeDeltaX;
    this.debug.swipeVelocity = this.swipeVelocity;
    this.debug.gestureConfidence = this.gestureConfidence;
    this.debug.fingerScores = details.fingerScores;
    this.debug.surface = details.surface;
    this.debug.handedness = handedness;
    this.debug.pinchRatio = details.pinchRatio;
    this.debug.state = this.machineState;
  }

  updateSwipe(raw, time, dt) {
    const backhandArmed = this.machineState === 'CITY_NAVIGATE' || this.machineState === 'CITY_SWIPE' || this.stateMachine.candidate === 'BACKHAND';
    if (raw !== 'BACKHAND' || !backhandArmed || !this.indexPosition) {
      // Ignore brief classifier flicker; webcam landmarks may shift for one frame during a swipe.
      if (this.swipeSession && time - this.swipeSession.lastPointAt <= 90) return;
      this.swipeSession = null;
      this.swipeDeltaX = 0;
      this.swipeVelocity = 0;
      if (time >= this.swipeCooldownUntil) this.swipeLocked = false;
      return;
    }

    const position = this.indexPosition;
    if (!this.swipeSession) {
      this.swipeSession = { startX: position.x, startY: position.y, startAt: time, lastX: position.x, lastY: position.y, lastPointAt: time };
      this.swipeDeltaX = 0;
      this.swipeVelocity = 0;
      return;
    }

    const session = this.swipeSession;
    session.lastPointAt = time;
    if (this.swipeLocked && time >= this.swipeCooldownUntil && Math.abs(this.swipeDeltaX) < GESTURE_CONFIG.swipe.distance * .4) {
      // Let a held back-of-hand gesture perform another deliberate flick after it
      // returns to its center, without requiring the user to fold the finger.
      this.swipeLocked = false;
      session.startX = position.x;
      session.startY = position.y;
      session.startAt = time;
      session.lastX = position.x;
      session.lastY = position.y;
      this.swipeDeltaX = 0;
    }
    const elapsedMs = time - session.startAt;
    if (elapsedMs > GESTURE_CONFIG.swipe.maxDurationMs && !this.swipeLocked) {
      session.startX = position.x;
      session.startY = position.y;
      session.startAt = time;
    }
    const interval = Math.max(dt, .001);
    this.swipeDeltaX = position.x - session.startX;
    const deltaY = position.y - session.startY;
    this.swipeVelocity = (position.x - session.lastX) / interval;
    session.lastX = position.x;
    session.lastY = position.y;

    const duration = time - session.startAt;
    const averageVelocity = duration > 0 ? this.swipeDeltaX / (duration / 1000) : 0;
    const enoughDistance = Math.abs(this.swipeDeltaX) >= GESTURE_CONFIG.swipe.distance;
    const enoughVelocity = Math.max(Math.abs(this.swipeVelocity), Math.abs(averageVelocity)) >= GESTURE_CONFIG.swipe.velocity;
    const mostlyHorizontal = Math.abs(this.swipeDeltaX) >= Math.abs(deltaY) * GESTURE_CONFIG.swipe.horizontalRatio;
    if (!this.swipeLocked && this.machineState === 'CITY_NAVIGATE' && duration <= GESTURE_CONFIG.swipe.maxDurationMs && enoughDistance && enoughVelocity && mostlyHorizontal && this.gestureConfidence >= .54) {
      const direction = this.swipeDeltaX > 0 ? 'NEXT_CITY' : 'PREVIOUS_CITY';
      this.pendingCitySwipe = direction;
      this.swipeLocked = true;
      this.swipeCooldownUntil = time + GESTURE_CONFIG.swipe.cooldownMs;
      this.stateMachine.setCitySwipe(time, GESTURE_CONFIG.swipe.cooldownMs);
      this.machineState = 'CITY_SWIPE';
      this.setGestureAction(direction === 'NEXT_CITY' ? 'NEXT NODE' : 'PREVIOUS NODE', time, 950);
      this.markActivity();
    }
  }

  drag(dx, dy) {
    if (this.paused) return;
    this.markActivity();
    this.locationFlight = null;
    this.focusTimer = -1;
    this.focusIntensity = 0;
    this.focusedLocation = null;
    this.hoveredCity = null;
    this.resetting = false;
    if (this.machineState === 'CITY_FOCUS') this.stateMachine.leaveCityFocus();
    this.machineState = 'TRACKING';
    this.rotation.y += dx * .004;
    this.rotation.x = clamp(this.rotation.x + dy * .003, -Math.PI, Math.PI);
    this.velocity.y = clamp(dx * .03, -1, 1);
    this.velocity.x = clamp(dy * .02, -.7, .7);
  }

  scroll(dy) {
    if (!this.paused) {
      this.markActivity();
      this.locationFlight = null;
      this.focusTimer = -1;
      this.focusIntensity = 0;
      this.focusedLocation = null;
      this.resetting = false;
      this.targetZoom = clamp(this.targetZoom * Math.exp(-dy * .001), .7, 1.65);
      this.targetCameraDistance = zoomToCameraDistance(this.targetZoom);
    }
  }

  update(delta) {
    const transitionDelta = Math.min(delta, .1);
    const dt = Math.min(delta, .05);
    if (this.locationFlight && !this.paused) {
      const flight = this.locationFlight;
      flight.elapsed = Math.min(flight.elapsed + transitionDelta, flight.duration);
      const progress = flight.elapsed / flight.duration;
      const eased = easeInOutCubic(progress);
      this.flightQuaternion.slerpQuaternions(flight.start, flight.target, eased);
      this.flightEuler.setFromQuaternion(this.flightQuaternion, 'XYZ');
      this.rotation.x = this.flightEuler.x;
      this.rotation.y = this.flightEuler.y + flight.inertia * dt * (1 - eased);
      this.rotation.z = this.flightEuler.z;
      this.focusIntensity = Math.max(this.focusIntensity, THREE.MathUtils.smoothstep(eased, .42, .92));
      this.targetZoom = flight.targetZoom;
      this.targetCameraDistance = zoomToCameraDistance(this.targetZoom);
      if (progress >= 1) {
        this.flightEuler.setFromQuaternion(flight.target, 'XYZ');
        this.rotation.x = this.flightEuler.x;
        this.rotation.y = this.flightEuler.y;
        this.rotation.z = this.flightEuler.z;
        this.locationFlight = null;
        this.focusTimer = 4.8;
        this.focusIntensity = 1;
      }
    } else if (this.resetting) {
      const amount = 1 - Math.exp(-5 * dt);
      this.rotation.x = lerp(this.rotation.x, DEFAULT_VIEW.x, amount);
      const target = DEFAULT_VIEW.y + Math.round((this.rotation.y - DEFAULT_VIEW.y) / (Math.PI * 2)) * Math.PI * 2;
      this.rotation.y = lerp(this.rotation.y, target, amount);
      this.rotation.z = lerp(this.rotation.z, 0, amount);
      if (Math.abs(this.rotation.x - DEFAULT_VIEW.x) + Math.abs(this.rotation.y - target) + Math.abs(this.rotation.z) < .001) this.resetting = false;
    } else if (!this.paused) {
      this.rotation.x = clamp(this.rotation.x + this.velocity.x * dt, -Math.PI, Math.PI);
      this.rotation.y += this.velocity.y * dt;
      if (this.machineState === 'ROTATE' && this.gesture === 'PALM' && this.hasHand && this.angularInputHold > 0) {
        const reverseX = this.targetAngularVelocity.x * this.velocity.x < 0;
        const reverseY = this.targetAngularVelocity.y * this.velocity.y < 0;
        this.velocity.x = lerp(this.velocity.x, this.targetAngularVelocity.x, reverseX ? .7 : GESTURE_CONFIG.rotation.response);
        this.velocity.y = lerp(this.velocity.y, this.targetAngularVelocity.y, reverseY ? .7 : GESTURE_CONFIG.rotation.response);
        this.angularInputHold = Math.max(0, this.angularInputHold - dt);
      } else {
        const damping = Math.pow(GESTURE_CONFIG.rotation.damping, dt * 60);
        this.velocity.x *= damping;
        this.velocity.y *= damping;
      }
    }

    if (!this.locationFlight && this.focusTimer >= 0) {
      this.focusTimer = Math.max(0, this.focusTimer - transitionDelta);
      this.focusIntensity = this.focusTimer < 1.2 ? this.focusTimer / 1.2 : 1;
      if (this.focusTimer === 0) {
        this.focusedLocation = null;
        this.focusTimer = -1;
        if (this.machineState === 'CITY_FOCUS') {
          this.stateMachine.leaveCityFocus();
          this.machineState = this.stateMachine.state;
        }
      }
    }

    if (!this.paused) {
      this.cameraDistance = lerp(this.cameraDistance, this.targetCameraDistance, .1);
      this.zoom = cameraDistanceToZoom(this.cameraDistance);
    }
  }
}

export default GestureController;
