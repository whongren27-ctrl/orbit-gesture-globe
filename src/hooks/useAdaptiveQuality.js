import { useEffect, useRef, useState } from 'react';

export const QUALITY_PRESETS = Object.freeze({
  high: { name: 'HIGH', dpr: 1.5, bloomResolution: 1, earthStride: 1, stars: 1, meteors: 1, particles: 1 },
  medium: { name: 'MEDIUM', dpr: 1.15, bloomResolution: .72, earthStride: 2, stars: .58, meteors: .65, particles: .65 },
});

/** Changes quality only after sustained FPS changes, never on an individual slow frame. */
export function useAdaptiveQuality({ lowFps = 45, lowForMs = 3200, recoverFps = 53, recoverForMs = 6200 } = {}) {
  const [quality, setQuality] = useState(QUALITY_PRESETS.high);
  const qualityRef = useRef(QUALITY_PRESETS.high);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lowStartedAt = 0;
    let recoverStartedAt = 0;
    let active = true;

    const sample = now => {
      if (!active) return;
      const delta = Math.max(1, now - last);
      last = now;
      const fps = 1000 / delta;
      if (qualityRef.current === QUALITY_PRESETS.high) {
        lowStartedAt = fps < lowFps ? (lowStartedAt || now) : 0;
        if (lowStartedAt && now - lowStartedAt >= lowForMs) {
          qualityRef.current = QUALITY_PRESETS.medium;
          setQuality(QUALITY_PRESETS.medium);
        }
      } else {
        recoverStartedAt = fps > recoverFps ? (recoverStartedAt || now) : 0;
        if (recoverStartedAt && now - recoverStartedAt >= recoverForMs) {
          qualityRef.current = QUALITY_PRESETS.high;
          setQuality(QUALITY_PRESETS.high);
        }
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [lowFps, lowForMs, recoverFps, recoverForMs]);

  return quality;
}

export default useAdaptiveQuality;
