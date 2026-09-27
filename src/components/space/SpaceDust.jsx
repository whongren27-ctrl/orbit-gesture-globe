import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const POOL_SIZE = 18;
const UP = new THREE.Vector3(0, 1, 0);

function createParticle() {
  return { active: false, age: 0, life: .6, speed: 4, length: .4, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, -.5, 0), orientation: new THREE.Quaternion() };
}

export default function SpaceDust({ events, controller, reducedMotion = false, quality }) {
  const groupRef = useRef();
  const headsRef = useRef();
  const trailsRef = useRef();
  const seenEvent = useRef(0);
  const seenFocus = useRef(controller?.focusSequence || 0);
  const lastCameraZ = useRef(null);
  const wasCameraMoving = useRef(false);
  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, createParticle), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const headGeometry = useMemo(() => new THREE.SphereGeometry(.013, 7, 7), []);
  const tailGeometry = useMemo(() => new THREE.CylinderGeometry(.004, .001, 1, 5, 1, true), []);
  const headMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfffff', transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const tailMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#56dfff', transparent: true, opacity: .34, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const tail = useMemo(() => new THREE.Vector3(), []);
  const activeLimit=Math.max(7,Math.round(POOL_SIZE*(quality?.particles??1)));

  useEffect(() => () => {
    headGeometry.dispose();
    tailGeometry.dispose();
    headMaterial.dispose();
    tailMaterial.dispose();
  }, [headGeometry, tailGeometry, headMaterial, tailMaterial]);

  useFrame(({ camera }, delta) => {
    const event = events?.activeEvent;
    const flybyStarted = event?.type === 'CAMERA_FLYBY' && event.id !== seenEvent.current;
    const focusStarted = controller && controller.focusSequence !== seenFocus.current;
    const cameraMoving = lastCameraZ.current !== null && Math.abs(camera.position.z - lastCameraZ.current) > .012;
    const cameraMoveStarted = cameraMoving && !wasCameraMoving.current;
    if (event?.type === 'CAMERA_FLYBY') seenEvent.current = event.id;
    if (controller) seenFocus.current = controller.focusSequence;
    if (!reducedMotion && (flybyStarted || focusStarted || cameraMoveStarted)) {
      const amount = flybyStarted ? 11 : focusStarted && cameraMoveStarted ? 9 : focusStarted ? 7 : 5;
      spawnBurst(pool, Math.min(amount,activeLimit),activeLimit);
    }
    lastCameraZ.current = camera.position.z;
    wasCameraMoving.current = cameraMoving;

    if (groupRef.current) {
      camera.getWorldDirection(forward);
      groupRef.current.position.copy(camera.position).addScaledVector(forward, 3.25);
      groupRef.current.quaternion.copy(camera.quaternion);
    }
    const step = Math.min(delta, .08);
    pool.forEach((particle, index) => {
      if(index>=activeLimit)particle.active=false;
      if (particle.active) {
        particle.age += step;
        if (particle.age >= particle.life) particle.active = false;
      }
      if (!particle.active || reducedMotion) {
        write(headsRef.current, index, dummy, null, UP, 0, tint, 0);
        write(trailsRef.current, index, dummy, null, UP, 0, tint, 0);
        return;
      }
      const progress = particle.age / particle.life;
      const fade = Math.min(1, particle.age / .08, (1 - progress) / .28);
      head.copy(particle.origin).addScaledVector(particle.direction, particle.speed * particle.age);
      tail.copy(head).addScaledVector(particle.direction, -particle.length * .5);
      write(headsRef.current, index, dummy, head, particle.orientation, 1, tint, fade);
      write(trailsRef.current, index, dummy, tail, particle.orientation, particle.length, tint, fade);
    });
    [headsRef.current, trailsRef.current].forEach(mesh => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  });

  return <group ref={groupRef} frustumCulled={false}>
    <instancedMesh ref={trailsRef} args={[tailGeometry, tailMaterial, POOL_SIZE]} frustumCulled={false} renderOrder={11}/>
    <instancedMesh ref={headsRef} args={[headGeometry, headMaterial, POOL_SIZE]} frustumCulled={false} renderOrder={12}/>
  </group>;
}

function spawnBurst(pool, amount,activeLimit=pool.length) {
  for (let count = 0; count < amount; count++) {
    const index = pool.slice(0,activeLimit).findIndex(particle => !particle.active);
    if (index < 0) return;
    spawn(pool[index]);
  }
}

function spawn(particle) {
  particle.active = true;
  particle.age = Math.random() * .16;
  particle.life = .45 + Math.random() * .65;
  particle.speed = 3.2 + Math.random() * 3.8;
  particle.length = .18 + Math.random() * .5;
  particle.origin.set(-5.3 - Math.random() * .6, 2.5 + Math.random() * 2.2, (Math.random() - .5) * 1.2);
  particle.direction.set(.7 + Math.random() * .8, -.35 - Math.random() * .65, (Math.random() - .5) * .18).normalize();
  particle.orientation.setFromUnitVectors(UP, particle.direction);
}

function write(mesh, index, dummy, position, orientation, length, color, intensity) {
  if (!mesh) return;
  if (position) dummy.position.copy(position);
  else dummy.position.set(0, 0, 0);
  dummy.quaternion.copy(orientation);
  dummy.scale.set(.72, length, .72);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  mesh.setColorAt(index, color.setRGB(intensity, intensity, intensity));
}
