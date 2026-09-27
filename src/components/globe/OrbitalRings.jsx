import {useEffect,useMemo} from 'react';
import * as THREE from 'three';

export default function OrbitalRings(){
  const geometry=useMemo(()=>{
    const points=[];
    for(let index=0;index<=180;index++){
      const angle=index/180*Math.PI*2;
      points.push(new THREE.Vector3(4.25*Math.cos(angle),-.55+1.42*Math.sin(angle),-.95+1.12*Math.sin(angle+1.2)));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <lineLoop geometry={geometry} renderOrder={0}><lineBasicMaterial color="#4d8492" transparent opacity={.07} depthWrite={false} toneMapped={false}/></lineLoop>;
}
