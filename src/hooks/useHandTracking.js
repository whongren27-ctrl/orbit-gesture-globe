import { useCallback, useEffect, useRef, useState } from 'react';

const STATUS_INTERVAL_MS = 100;
const FALLBACK_CAPTURE_INTERVAL_MS = 1000 / 30;

function controllerStatus(controller, camera = 'CONNECTED', fps = 0, error = '') {
  const debug = controller.debug;
  return {
    camera,
    tracking: controller.hasHand,
    gesture: controller.gesture,
    confidence: controller.confidence,
    gestureConfidence: controller.gestureConfidence || 0,
    fps,
    error,
    debug: { ...debug },
  };
}

export function useHandTracking(controller) {
  const videoRef = useRef(null);
  const landmarksRef = useRef([]);
  const [attempt, setAttempt] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState({
    camera: 'REQUESTING', tracking: false, gesture: 'NONE', confidence: 0,
    gestureConfidence: 0, fps: 0, error: '',
    debug: { rawGesture: 'NONE', stableGesture: 'NONE', handX: 0, handY: 0, indexX: 0, indexY: 0, deltaX: 0, swipeVelocity: 0, gestureConfidence: 0, fingerScores: [0, 0, 0, 0], surface: 'UNKNOWN', handedness: 'Right', pinchRatio: 0, state: 'IDLE' },
  });
  const retry = useCallback(() => { setEnabled(true); setAttempt(value => value + 1); }, []);
  const toggle = useCallback(() => setEnabled(value => !value), []);

  useEffect(() => {
    if (!enabled) {
      controller.clear();
      landmarksRef.current = [];
      setStatus(controllerStatus(controller, 'OFF'));
      return undefined;
    }

    let disposed = false;
    let stream;
    let worker;
    let fallbackTimer = 0;
    let videoCallbackId = 0;
    let watchdog = 0;
    let busy = false;
    let ready = false;
    let previousFrame = -1;
    let lastResultAt = 0;
    let lastStatusAt = 0;
    let lastFps = 0;

    const stopScheduler = () => {
      clearInterval(fallbackTimer);
      fallbackTimer = 0;
      if (videoCallbackId && videoRef.current?.cancelVideoFrameCallback) {
        videoRef.current.cancelVideoFrameCallback(videoCallbackId);
      }
      videoCallbackId = 0;
    };

    const fail = error => {
      if (disposed) return;
      clearTimeout(watchdog);
      stopScheduler();
      stream?.getTracks().forEach(track => track.stop());
      worker?.terminate();
      controller.clear();
      landmarksRef.current = [];
      const camera = error.name === 'NotAllowedError' ? 'DENIED' : 'UNAVAILABLE';
      const message = error.name === 'NotAllowedError'
        ? 'Camera permission is off. Allow camera access in your browser, then retry.'
        : error.name === 'NotFoundError'
          ? 'No camera found. Connect a webcam to enable gesture control.'
          : error.message || 'Camera could not start. Try again.';
      setStatus(controllerStatus(controller, camera, 0, message));
    };

    const captureFrame = async video => {
      if (!ready || busy || disposed || document.hidden || video.readyState < 2) return;
      if (video.currentTime === previousFrame) return;
      busy = true;
      previousFrame = video.currentTime;
      try {
        const bitmap = await createImageBitmap(video);
        if (disposed) { bitmap.close(); return; }
        worker.postMessage({ type: 'frame', bitmap, time: performance.now() }, [bitmap]);
      } catch (error) {
        busy = false;
        fail(error);
      }
    };

    async function start() {
      try {
        setStatus(current => ({ ...current, camera: 'REQUESTING', error: '' }));
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs localhost or a secure HTTPS connection.');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' },
          audio: false,
        });
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        if (disposed) return;
        stream.getVideoTracks()[0].onended = () => fail(new Error('Camera disconnected. Reconnect your webcam and retry.'));
        setStatus(current => ({ ...current, camera: 'LOADING MODEL' }));

        const assetBase = import.meta.env.BASE_URL;
        worker = new Worker(`${assetBase}hand-worker.js`);
        watchdog = setTimeout(() => fail(new Error('Hand tracker took too long to load. Please retry.')), 45000);
        worker.onerror = event => fail(new Error(event.message || 'Hand tracker could not initialize.'));
        worker.onmessage = ({ data }) => {
          if (disposed) return;
          if (data.type === 'ready') {
            clearTimeout(watchdog);
            ready = true;
            setStatus(current => ({ ...current, camera: 'CONNECTED' }));
            const schedule = () => {
              videoCallbackId = video.requestVideoFrameCallback(async () => {
                schedule();
                await captureFrame(video);
              });
            };
            if (typeof video.requestVideoFrameCallback === 'function') schedule();
            else fallbackTimer = setInterval(() => { void captureFrame(video); }, FALLBACK_CAPTURE_INTERVAL_MS);
            return;
          }
          if (data.type === 'error') { fail(new Error(data.message)); return; }

          busy = false;
          landmarksRef.current = data.landmarks ?? [];
          const now = performance.now();
          if (lastResultAt) lastFps = Math.min(30, Math.round(1000 / (now - lastResultAt)));
          lastResultAt = now;
          controller.input(data.landmarks, now, data.confidence ?? 0, data.handedness ?? 'Right', data.hands ?? [], data.handednesses ?? []);

          // Keep the renderer reading refs at inference speed; React/HUD only receives 10 Hz snapshots.
          if (now - lastStatusAt >= STATUS_INTERVAL_MS) {
            setStatus(controllerStatus(controller, 'CONNECTED', lastFps));
            lastStatusAt = now;
          }
        };
        worker.postMessage({ type: 'init', base: assetBase });
      } catch (error) {
        fail(error);
      }
    }

    void start();
    const visibility = () => {
      if (!document.hidden) return;
      controller.clear();
      landmarksRef.current = [];
      setStatus(current => ({ ...current, tracking: false, gesture: 'NONE', gestureConfidence: 0 }));
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      clearTimeout(watchdog);
      stopScheduler();
      worker?.terminate();
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [controller, attempt, enabled]);

  return { videoRef, landmarksRef, status, retry, enabled, toggle };
}
