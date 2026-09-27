import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';

export default function Moon({reducedMotion=false}){
  const ref=useRef();
  const geometry=useMemo(()=>new THREE.IcosahedronGeometry(.18,1),[]);
  const wireGeometry=useMemo(()=>new THREE.IcosahedronGeometry(.184,1),[]);
  const material=useMemo(()=>new THREE.MeshStandardMaterial({color:'#677985',roughness:1,metalness:0,flatShading:true}),[]);
  const wireMaterial=useMemo(()=>new THREE.MeshBasicMaterial({color:'#95b9c0',wireframe:true,transparent:true,opacity:.085,depthWrite:false}),[]);
  useEffect(()=>()=>{geometry.dispose();wireGeometry.dispose();material.dispose();wireMaterial.dispose();},[geometry,wireGeometry,material,wireMaterial]);
  useFrame(({clock},delta)=>{if(!ref.current||reducedMotion)return;const angle=clock.elapsedTime*.035-.8;ref.current.position.set(4.25*Math.cos(angle),-.55+1.42*Math.sin(angle),-.95+1.12*Math.sin(angle+1.2));ref.current.rotation.y+=Math.min(delta,.05)*.12;ref.current.rotation.x+=Math.min(delta,.05)*.035;});
  return <group ref={ref} position={[3.2,-1.8,-1.8]}><mesh geometry={geometry} material={material}/><mesh geometry={wireGeometry} material={wireMaterial}/></group>;
}
