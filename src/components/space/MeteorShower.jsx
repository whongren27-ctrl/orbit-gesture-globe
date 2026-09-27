import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const POOL_SIZE = 40;
const UP = new THREE.Vector3(0, 1, 0);

function createMeteor() {
  const direction = new THREE.Vector3(.72 + Math.random() * .62, -.48 - Math.random() * .55, (Math.random() - .5) * .08).normalize();
  const front = Math.random() < .82;
  return {
    active: false,
    age: 0,
    life: .4 + Math.random() * 1.1,
    speed: 8 + Math.random() * 7,
    tailLength: .5 + Math.random() * 1.5,
    origin: front
      ? new THREE.Vector3(-4.6 + Math.random() * 2.6, 1.8 + Math.random() * 1.7, 3.15 + Math.random() * .65)
      : new THREE.Vector3(-10 + Math.random() * 20, 3 + Math.random() * 5, -8 + Math.random() * 5),
    direction,
    orientation: new THREE.Quaternion().setFromUnitVectors(UP, direction),
  };
}

export default function MeteorShower({ reducedMotion = false, events, quality }) {
  const headRef = useRef();
  const tailRef = useRef();
  const glowRef = useRef();
  const pool = useMemo(() => Array.from({ length: POOL_SIZE }, createMeteor), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const headPosition = useMemo(() => new THREE.Vector3(), []);
  const tailPosition = useMemo(() => new THREE.Vector3(), []);
  const tailRotation = useMemo(() => new THREE.Quaternion(), []);
  const event = useRef({ id: 0, elapsed: 0, duration: 0, total: 0, spawned: 0 });
  const activeLimit=Math.max(8,Math.round(POOL_SIZE*(quality?.meteors??1)));
  const ambientWait = useRef(38 + Math.random() * 22);
  const headGeometry = useMemo(() => new THREE.SphereGeometry(.036, 8, 8), []);
  const tailGeometry = useMemo(() => createTrailGeometry(.02, .002, .12), []);
  const glowGeometry = useMemo(() => createTrailGeometry(.048, .003, .2), []);
  const headMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#eaffff', transparent: true, opacity: .98, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const tailMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d7feff', vertexColors: true, transparent: true, opacity: .96, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const glowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#39cfff', vertexColors: true, transparent: true, opacity: .26, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);

  useEffect(() => () => {
    headGeometry.dispose();
    tailGeometry.dispose();
    glowGeometry.dispose();
    headMaterial.dispose();
    tailMaterial.dispose();
    glowMaterial.dispose();
  }, [headGeometry, tailGeometry, glowGeometry, headMaterial, tailMaterial, glowMaterial]);

  useFrame((_, delta) => {
    const step = Math.min(delta, .1);
    const visualEvent = events?.activeEvent;
    if (visualEvent?.type === 'METEOR_SHOWER' && visualEvent.id !== event.current.id) {
      const qualityScale=quality?.meteors??1;
      event.current = { id: visualEvent.id, elapsed: 0, duration: visualEvent.duration, total: Math.max(12,Math.min(30,Math.round(visualEvent.payload.count*qualityScale))), spawned: 0 };
      ambientWait.current = 38 + Math.random() * 22;
    }

    if (reducedMotion) event.current.spawned = event.current.total;
    else {
      if (visualEvent?.type === 'METEOR_SHOWER' && visualEvent.id === event.current.id) {
        event.current.elapsed = visualEvent.elapsed;
        const elapsed=event.current.elapsed;
        const progress=Math.max(0,elapsed-.6)/Math.max(.1,event.current.duration-.6);
        const stagedCount=elapsed<.15?0:elapsed<.3?1:elapsed<.6?4:4+Math.floor((event.current.total-4)*Math.min(1,progress));
        const due=Math.min(event.current.total,stagedCount);
        while (event.current.spawned < due) {
          if(spawnMeteor(pool,activeLimit))event.current.spawned++;
          else break;
        }
      } else if (event.current.spawned < event.current.total) {
        event.current.spawned = event.current.total;
      }

      if (!visualEvent) {
        ambientWait.current -= step;
        if (ambientWait.current <= 0) {
          const count = 1 + Math.floor(Math.random() * 3);
          for (let index = 0; index < count; index++) spawnMeteor(pool,activeLimit);
          ambientWait.current = 42 + Math.random() * 26;
        }
      }
    }

    pool.forEach((meteor, index) => {
      if(index>=activeLimit)meteor.active=false;
      if (meteor.active) {
        meteor.age += step;
        if (meteor.age >= meteor.life) meteor.active = false;
      }
      if (!meteor.active) {
        writeInstance(headRef.current, index, dummy, null, UP, 0, true, tint, 0);
        writeInstance(tailRef.current, index, dummy, null, UP, 0, false, tint, 0);
        writeInstance(glowRef.current, index, dummy, null, UP, 0, false, tint, 0);
        return;
      }

      const progress = meteor.age / meteor.life;
      const fade = Math.min(1, meteor.age / .1, (1 - progress) / .16);
      headPosition.copy(meteor.origin).addScaledVector(meteor.direction, meteor.speed * meteor.age);
      tailPosition.copy(headPosition).addScaledVector(meteor.direction, -meteor.tailLength * .5);
      tailRotation.copy(meteor.orientation);
      writeInstance(headRef.current, index, dummy, headPosition, tailRotation, .8 + fade * .2, true, tint, fade);
      writeInstance(tailRef.current, index, dummy, tailPosition, tailRotation, meteor.tailLength, false, tint, fade);
      writeInstance(glowRef.current, index, dummy, tailPosition, tailRotation, meteor.tailLength, false, tint, fade);
    });
    [headRef.current, tailRef.current, glowRef.current].forEach(mesh => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  });

  return <group frustumCulled={false}>
    <instancedMesh ref={glowRef} args={[glowGeometry, glowMaterial, POOL_SIZE]} frustumCulled={false} renderOrder={8}/>
    <instancedMesh ref={tailRef} args={[tailGeometry, tailMaterial, POOL_SIZE]} frustumCulled={false} renderOrder={9}/>
    <instancedMesh ref={headRef} args={[headGeometry, headMaterial, POOL_SIZE]} frustumCulled={false} renderOrder={10}/>
  </group>;
}

function spawnMeteor(pool,activeLimit=pool.length) {
  const meteor = pool.slice(0,activeLimit).find(item => !item.active);
  if (!meteor) return false;
  meteor.active = true;
  meteor.age = 0;
  meteor.life = .4 + Math.random() * 1.1;
  meteor.speed = 8 + Math.random() * 7;
  meteor.tailLength = .5 + Math.random() * 1.5;
  const lane = Math.random();
  const front = lane < .68;
  const nearSide = lane >= .68 && lane < .93;
  if (front) meteor.origin.set(-4.6 + Math.random() * 2.6, 1.8 + Math.random() * 1.7, 3.15 + Math.random() * .65);
  else if (nearSide) meteor.origin.set(-6.8 + Math.random() * 1.3, 2.8 + Math.random() * 1, .7 + Math.random() * .8);
  else meteor.origin.set(-10 + Math.random() * 20, 3 + Math.random() * 5, -8 + Math.random() * 5);
  meteor.direction.set(.72 + Math.random() * .62, -.48 - Math.random() * .55, front || nearSide ? (Math.random() - .5) * .08 : (Math.random() - .5) * .42).normalize();
  meteor.orientation.setFromUnitVectors(UP, meteor.direction);
  return true;
}

function createTrailGeometry(radiusAtHead, radiusAtTail, brightnessAtTail) {
  const geometry = new THREE.CylinderGeometry(radiusAtHead, radiusAtTail, 1, 6, 1, true);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index++) {
    const alongTrail = THREE.MathUtils.clamp(positions.getY(index) + .5, 0, 1);
    const headFade = alongTrail * alongTrail * (3 - 2 * alongTrail);
    const brightness = THREE.MathUtils.lerp(brightnessAtTail, 1, headFade);
    colors[index * 3] = brightness * .28;
    colors[index * 3 + 1] = brightness * .86;
    colors[index * 3 + 2] = brightness;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function writeInstance(mesh, index, dummy, position, orientation, scaleY, uniformScale, color, intensity) {
  if (!mesh) return;
  if (position) dummy.position.copy(position);
  else dummy.position.set(0, 0, 0);
  dummy.quaternion.copy(orientation);
  if (scaleY === 0) dummy.scale.setScalar(0);
  else if (uniformScale) dummy.scale.setScalar(scaleY);
  else dummy.scale.set(.8, scaleY, .8);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  mesh.setColorAt(index, color.setRGB(intensity, intensity, intensity));
}
