import {useEffect,useMemo,useState} from 'react';
import * as THREE from 'three';
import vertexShader from '../../shaders/dotEarth.vert?raw';
import fragmentShader from '../../shaders/dotEarth.frag?raw';
import {latLngToVector3} from '../../utils/geoMath.js';

function EarthBase({radius}){
  const uniforms=useMemo(()=>({
    uBaseColor:{value:new THREE.Color('#04151c')},
    uLightDirection:{value:new THREE.Vector3(-.55,.72,.42).normalize()},
  }),[]);
  return <mesh><sphereGeometry args={[radius,96,96]}/><shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} toneMapped={false}/></mesh>;
}

function EarthGrid({radius}){
  const geometry=useMemo(()=>{
    const positions=[];
    const a=new THREE.Vector3(),b=new THREE.Vector3();
    for(let lat=-75;lat<=75;lat+=15)for(let lng=-180;lng<180;lng+=3){latLngToVector3(lat,lng,radius+.003,a);latLngToVector3(lat,lng+3,radius+.003,b);positions.push(...a.toArray(),...b.toArray());}
    for(let lng=-180;lng<180;lng+=15)for(let lat=-90;lat<90;lat+=3){latLngToVector3(lat,lng,radius+.003,a);latLngToVector3(lat+3,lng,radius+.003,b);positions.push(...a.toArray(),...b.toArray());}
    return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  },[radius]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#17505a" transparent opacity={.3}/></lineSegments>;
}

function LandPoints({quality,onError}){
  const [positions,setPositions]=useState(null);
  useEffect(()=>{
    const abort=new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/land-points.bin`,{signal:abort.signal})
      .then(response=>{if(!response.ok)throw new Error('Map point data failed to load');return response.arrayBuffer();})
      .then(buffer=>{if(buffer.byteLength%12!==0)throw new Error('Map point data is invalid');setPositions(new Float32Array(buffer));})
      .catch(error=>{if(error.name!=='AbortError')onError?.(error.message);});
    return()=>abort.abort();
  },[onError]);

  const renderPositions=useMemo(()=>{
    const stride=quality?.earthStride??1;
    if(!positions||stride===1)return positions;
    const reduced=new Float32Array(Math.ceil(positions.length/3/stride)*3);
    let write=0;
    for(let vertex=0;vertex<positions.length/3;vertex+=stride){reduced[write++]=positions[vertex*3];reduced[write++]=positions[vertex*3+1];reduced[write++]=positions[vertex*3+2];}
    return reduced;
  },[positions,quality?.earthStride]);
  const highlightPositions=useMemo(()=>{
    if(!renderPositions)return new Float32Array();
    const selected=[];
    for(let vertex=0;vertex<renderPositions.length/3;vertex++){
      const sample=Math.sin((vertex+1)*78.233)*43758.5453%1;
      if(Math.abs(sample)<.075)selected.push(renderPositions[vertex*3],renderPositions[vertex*3+1],renderPositions[vertex*3+2]);
    }
    return new Float32Array(selected);
  },[renderPositions]);
  const landGeometry=useMemo(()=>{const geometry=new THREE.BufferGeometry();if(renderPositions)geometry.setAttribute('position',new THREE.BufferAttribute(renderPositions,3));return geometry;},[renderPositions]);
  const highlightGeometry=useMemo(()=>{const geometry=new THREE.BufferGeometry();if(highlightPositions.length)geometry.setAttribute('position',new THREE.BufferAttribute(highlightPositions,3));return geometry;},[highlightPositions]);
  useEffect(()=>()=>landGeometry.dispose(),[landGeometry]);
  useEffect(()=>()=>highlightGeometry.dispose(),[highlightGeometry]);
  if(!renderPositions)return null;
  return <group>
    <points geometry={landGeometry} frustumCulled={false}><pointsMaterial color="#36cfc9" size={.04} sizeAttenuation transparent opacity={.09} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}/></points>
    <points geometry={landGeometry} frustumCulled={false}><pointsMaterial color="#42ddd7" size={.024} sizeAttenuation transparent opacity={.76} depthWrite={false} toneMapped={false}/></points>
    <points geometry={highlightGeometry} frustumCulled={false}><pointsMaterial color="#8ceee1" size={.025} sizeAttenuation transparent opacity={.82} depthWrite={false} toneMapped={false}/></points>
  </group>;
}

export default function DotEarth({radius=2,quality,onError}){
  return <><EarthBase radius={radius}/><EarthGrid radius={radius}/><LandPoints quality={quality} onError={onError}/></>;
}
