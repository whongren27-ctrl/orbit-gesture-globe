import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';

export default function Satellite({events,reducedMotion=false}){
  const ref=useRef();
  const pass=useRef({id:0,elapsed:0,duration:6});
  const curve=useMemo(()=>new THREE.CatmullRomCurve3([new THREE.Vector3(5.1,3.2,-2.4),new THREE.Vector3(3.2,2.1,.8),new THREE.Vector3(.2,.25,3.2),new THREE.Vector3(-3.1,-1.5,2.7),new THREE.Vector3(-5.2,-3,-2.5)]),[]);
  const position=useMemo(()=>new THREE.Vector3(),[]);
  const body=useMemo(()=>new THREE.BoxGeometry(.075,.055,.09),[]);
  const panel=useMemo(()=>new THREE.BoxGeometry(.16,.07,.008),[]);
  const bodyMaterial=useMemo(()=>new THREE.MeshBasicMaterial({color:'#d4ffff',toneMapped:false}),[]);
  const panelMaterial=useMemo(()=>new THREE.MeshBasicMaterial({color:'#64cfdf',toneMapped:false}),[]);
  useEffect(()=>()=>{body.dispose();panel.dispose();bodyMaterial.dispose();panelMaterial.dispose();},[body,panel,bodyMaterial,panelMaterial]);
  useFrame((_,delta)=>{const event=events?.activeEvent;if(event?.type==='SATELLITE_PASS'&&event.id!==pass.current.id)pass.current={id:event.id,elapsed:0,duration:event.duration};if(!ref.current)return;if(event?.type==='SATELLITE_PASS'&&pass.current.id===event.id&&!reducedMotion){pass.current.elapsed=Math.min(pass.current.duration,pass.current.elapsed+Math.min(delta,.1));curve.getPoint(THREE.MathUtils.smoothstep(pass.current.elapsed/pass.current.duration,0,1),position);ref.current.position.copy(position);ref.current.visible=true;ref.current.rotation.z=-.22;}else ref.current.visible=false;});
  return <group ref={ref} visible={false}><mesh geometry={body} material={bodyMaterial}/><mesh geometry={panel} material={panelMaterial} position={[-.13,0,0]}/><mesh geometry={panel} material={panelMaterial} position={[.13,0,0]}/><mesh geometry={panel} material={panelMaterial} position={[0,.115,0]} scale={[.62,.4,.65]}/></group>;
}
