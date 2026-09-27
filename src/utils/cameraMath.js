import { clamp, distance } from './gestureMath.js';

export const DEFAULT_CAMERA_DISTANCE = 7.9;
export const MIN_CAMERA_DISTANCE = 4.8;
export const MAX_CAMERA_DISTANCE = 11.3;

export function normalizedPinchDistance(landmarks) {
  if (!landmarks || landmarks.length !== 21) return 0;
  const palmSize = Math.max(distance(landmarks[0], landmarks[9]), .025);
  return distance(landmarks[4], landmarks[8]) / palmSize;
}

export function zoomToCameraDistance(zoom) {
  return clamp(DEFAULT_CAMERA_DISTANCE / Math.max(.1, zoom), MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
}

export function cameraDistanceToZoom(cameraDistance) {
  return clamp(DEFAULT_CAMERA_DISTANCE / clamp(cameraDistance, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE), .7, 1.65);
}
