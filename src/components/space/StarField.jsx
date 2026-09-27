import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function makeStarGeometry(count, innerRadius, outerRadius) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const z = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
    const ring = Math.sqrt(1 - z * z);
    positions[index * 3] = Math.cos(angle) * ring * radius;
    positions[index * 3 + 1] = z * radius;
    positions[index * 3 + 2] = Math.sin(angle) * ring * radius;
    const brightness = .52 + Math.random() * .48;
    const blueBias = Math.random() < .18 ? 1 : .78;
    colors[index * 3] = brightness * .76;
    colors[index * 3 + 1] = brightness * .9;
    colors[index * 3 + 2] = brightness * blueBias;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function makeForegroundGeometry(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = (Math.random() - .5) * 10;
    positions[index * 3 + 1] = (Math.random() - .5) * 6;
    positions[index * 3 + 2] = (Math.random() - .5) * 2;
    velocity[index * 3] = .025 + Math.random() * .055;
    velocity[index * 3 + 1] = -.018 - Math.random() * .035;
    velocity[index * 3 + 2] = (Math.random() - .5) * .012;
    const brightness = .25 + Math.random() * .35;
    colors[index * 3] = brightness * .48;
    colors[index * 3 + 1] = brightness * .86;
    colors[index * 3 + 2] = brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData.velocity = velocity;
  return geometry;
}

function makeScreenStarGeometry(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = Math.random() * 2 - 1;
    positions[index * 3 + 1] = Math.random() * 2 - 1;
    const brightness = .4 + Math.random() * .6;
    const tint = Math.random() < .13 ? [.52, .78, 1] : [.78, .91, 1];
    colors[index * 3] = brightness * tint[0];
    colors[index * 3 + 1] = brightness * tint[1];
    colors[index * 3 + 2] = brightness * tint[2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export default function StarField({ controller, reducedMotion = false, quality }) {
  const backgroundRef = useRef();
  const screenBackgroundRef = useRef();
  const midRef = useRef();
  const foregroundRef = useRef();
  const { camera } = useThree();
  const starScale = quality?.stars ?? 1;
  const backgroundGeometry = useMemo(() => makeStarGeometry(Math.round(3900 * starScale), 42, 78), [starScale]);
  const screenBackgroundGeometry = useMemo(() => makeScreenStarGeometry(Math.round(3200 * starScale)), [starScale]);
  const midGeometry = useMemo(() => makeStarGeometry(Math.round(640 * starScale), 17, 34), [starScale]);
  const foregroundGeometry = useMemo(() => makeForegroundGeometry(Math.round(42 * (quality?.particles ?? 1))), [quality?.particles]);
  const forward = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => {
    backgroundGeometry.dispose();
    screenBackgroundGeometry.dispose();
    midGeometry.dispose();
    foregroundGeometry.dispose();
  }, [backgroundGeometry, screenBackgroundGeometry, midGeometry, foregroundGeometry]);

  useFrame(({ clock }, delta) => {
    const motion = reducedMotion ? 0 : Math.min(delta, .05);
    const time = reducedMotion ? 0 : clock.elapsedTime;
    if (backgroundRef.current) {
      backgroundRef.current.rotation.y = time * .0007 - (controller?.rotation.y || 0) * .0015;
      backgroundRef.current.rotation.x = (controller?.rotation.x || 0) * .001;
    }
    if (screenBackgroundRef.current) {
      const distanceFromCamera = 82;
      const halfHeight = distanceFromCamera * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
      camera.getWorldDirection(forward);
      screenBackgroundRef.current.position.copy(camera.position).addScaledVector(forward, distanceFromCamera);
      screenBackgroundRef.current.quaternion.copy(camera.quaternion);
      screenBackgroundRef.current.scale.set(halfHeight * camera.aspect, halfHeight, 1);
    }
    if (midRef.current) {
      midRef.current.rotation.y = time * .002 - (controller?.rotation.y || 0) * .009;
      midRef.current.rotation.x = (controller?.rotation.x || 0) * .007;
    }
    if (!foregroundRef.current) return;
    camera.getWorldDirection(forward);
    foregroundRef.current.position.copy(camera.position).addScaledVector(forward, 3.3);
    foregroundRef.current.quaternion.copy(camera.quaternion);
    if (!motion) return;
    const position = foregroundGeometry.attributes.position;
    const velocity = foregroundGeometry.userData.velocity;
    for (let index = 0; index < position.count; index++) {
      const offset = index * 3;
      let x = position.array[offset] + velocity[offset] * motion;
      let y = position.array[offset + 1] + velocity[offset + 1] * motion;
      let z = position.array[offset + 2] + velocity[offset + 2] * motion;
      if (x > 5.2 || y < -3.2 || Math.abs(z) > 1.1) {
        x = -5.2 - Math.random() * 1.5;
        y = 1.8 + Math.random() * 1.8;
        z = (Math.random() - .5) * 1.7;
      }
      position.setXYZ(index, x, y, z);
    }
    position.needsUpdate = true;
  });

  return <group>
    <group ref={screenBackgroundRef} renderOrder={-20}>
      <points geometry={screenBackgroundGeometry} frustumCulled={false} renderOrder={-20}>
        <pointsMaterial size={.9} sizeAttenuation={false} vertexColors transparent opacity={.46} depthWrite={false} toneMapped={false}/>
      </points>
    </group>
    <group ref={backgroundRef}>
      <points geometry={backgroundGeometry} frustumCulled={false}>
        <pointsMaterial size={1.05} sizeAttenuation={false} vertexColors transparent opacity={.48} depthWrite={false} toneMapped={false}/>
      </points>
    </group>
    <group ref={midRef}>
      <points geometry={midGeometry} frustumCulled={false}>
        <pointsMaterial size={1.55} sizeAttenuation={false} vertexColors transparent opacity={.58} depthWrite={false} toneMapped={false}/>
      </points>
    </group>
    <points ref={foregroundRef} geometry={foregroundGeometry} frustumCulled={false}>
      <pointsMaterial size={2.15} sizeAttenuation={false} vertexColors transparent opacity={.55} depthWrite={false} toneMapped={false}/>
    </points>
  </group>;
}
