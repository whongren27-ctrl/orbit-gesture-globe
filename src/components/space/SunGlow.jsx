import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(236,255,255,0.92)');
  gradient.addColorStop(.035, 'rgba(198,250,255,0.78)');
  gradient.addColorStop(.14, 'rgba(87,218,255,0.26)');
  gradient.addColorStop(.38, 'rgba(37,153,230,0.085)');
  gradient.addColorStop(1, 'rgba(26,91,168,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function flareTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 512, 0);
  gradient.addColorStop(0, 'rgba(107,220,255,0)');
  gradient.addColorStop(.35, 'rgba(107,220,255,0.015)');
  gradient.addColorStop(.5, 'rgba(205,250,255,0.55)');
  gradient.addColorStop(.65, 'rgba(107,220,255,0.015)');
  gradient.addColorStop(1, 'rgba(107,220,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function SunGlow({ events, reducedMotion = false }) {
  const haloRef = useRef();
  const coreRef = useRef();
  const streakRef = useRef();
  const glowMap = useMemo(radialTexture, []);
  const streakMap = useMemo(flareTexture, []);
  const haloMaterial = useMemo(() => new THREE.SpriteMaterial({ map: glowMap, color: '#67cfff', transparent: true, opacity: .52, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [glowMap]);
  const coreMaterial = useMemo(() => new THREE.SpriteMaterial({ map: glowMap, color: '#e9ffff', transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [glowMap]);
  const streakMaterial = useMemo(() => new THREE.SpriteMaterial({ map: streakMap, color: '#78dfff', transparent: true, opacity: .13, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [streakMap]);

  useEffect(() => () => {
    glowMap.dispose();
    streakMap.dispose();
    haloMaterial.dispose();
    coreMaterial.dispose();
    streakMaterial.dispose();
  }, [glowMap, streakMap, haloMaterial, coreMaterial, streakMaterial]);

  useFrame(({ clock }) => {
    const flare = !reducedMotion && events?.activeEvent?.type === 'SOLAR_FLARE'
      ? Math.sin(Math.PI * events.activeEvent.progress)
      : 0;
    const shimmer = reducedMotion ? 0 : .035 * Math.sin(clock.elapsedTime * .42);
    if (haloRef.current) {
      haloRef.current.material.opacity = .48 + shimmer + flare * .28;
      const scale = 7.4 + flare * .6;
      haloRef.current.scale.set(scale, scale, 1);
    }
    if (coreRef.current) coreRef.current.material.opacity = .76 + flare * .22;
    if (streakRef.current) streakRef.current.material.opacity = .11 + flare * .16;
  });

  return <group position={[-8.1, 5.65, -13.5]} renderOrder={-2}>
    <sprite ref={haloRef} material={haloMaterial} scale={[7.4, 7.4, 1]}/>
    <sprite ref={coreRef} material={coreMaterial} scale={[.9, .9, 1]}/>
    <sprite ref={streakRef} material={streakMaterial} scale={[9.5, .13, 1]}/>
  </group>;
}
