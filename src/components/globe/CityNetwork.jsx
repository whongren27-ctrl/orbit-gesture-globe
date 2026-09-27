import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {activeRoutes,cities,staticConnections} from '../../data/cities';

function cityVector(city,radius){
  const polar=(90-city.lat)*Math.PI/180;
  const longitude=city.lng*Math.PI/180;
  return new THREE.Vector3(
    radius*Math.sin(polar)*Math.sin(longitude),
    radius*Math.cos(polar),
    radius*Math.sin(polar)*Math.cos(longitude),
  );
}

class SurfaceArcCurve extends THREE.Curve{
  constructor(fromCity,toCity,radius,lift){
    super();
    this.start=cityVector(fromCity,1).normalize();
    this.end=cityVector(toCity,1).normalize();
    this.radius=radius;
    this.angle=Math.acos(THREE.MathUtils.clamp(this.start.dot(this.end),-1,1));
    this.lift=lift;
    if(Math.PI-this.angle<1e-4){
      this.antipodalAxis=new THREE.Vector3(1,0,0).cross(this.start);
      if(this.antipodalAxis.lengthSq()<1e-5)this.antipodalAxis.set(0,1,0).cross(this.start);
      this.antipodalAxis.normalize();
    }
  }

  getPoint(t,target=new THREE.Vector3()){
    const height=this.lift+this.angle*.065;
    if(this.antipodalAxis){
      target.copy(this.start).multiplyScalar(Math.cos(Math.PI*t))
        .addScaledVector(this.antipodalAxis,Math.sin(Math.PI*t));
    }else if(this.angle<1e-5){
      target.copy(this.start);
    }else{
      const sinAngle=Math.sin(this.angle);
      const startWeight=Math.sin((1-t)*this.angle)/sinAngle;
      const endWeight=Math.sin(t*this.angle)/sinAngle;
      target.copy(this.start).multiplyScalar(startWeight).addScaledVector(this.end,endWeight);
    }
    return target.multiplyScalar(this.radius+.014+Math.sin(Math.PI*t)*height);
  }
}

function makeArcCurve(fromCity,toCity,radius,lift){
  return new SurfaceArcCurve(fromCity,toCity,radius,lift);
}

function makeStaticGeometry(links,radius){
  const positions=[];
  for(const {a,b} of links){
    const curve=makeArcCurve(cities[a],cities[b],radius,.018);
    const segments=18;
    for(let step=0;step<segments;step++){
      const start=curve.getPoint(step/segments);
      const end=curve.getPoint((step+1)/segments);
      positions.push(start.x,start.y,start.z,end.x,end.y,end.z);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  return geometry;
}

function createGlowTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const context=canvas.getContext('2d');
  const gradient=context.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,0.92)');
  gradient.addColorStop(.18,'rgba(255,255,255,0.52)');
  gradient.addColorStop(.48,'rgba(255,255,255,0.13)');
  gradient.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle=gradient;
  context.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

const tierScale={1:1,2:.78,3:.48};

export default function CityNetwork({radius=2,reducedMotion=false,focusedLocation,hoveredCity,controller,events,quality}){
  const pulseRefs=useRef([]);
  const markerRefs=useRef([]);
  const eventPulseRefs=useRef([]);
  const particleCoreRef=useRef();
  const particleGlowRef=useRef();
  const burstRef=useRef();
  const burstSequence=useRef(controller?.focusSequence||0);
  const eventBurstId=useRef(0);
  const burstElapsed=useRef(1.1);
  const burstOrigin=useRef(new THREE.Vector3());
  const focusRingRef=useRef();
  const focusSpriteRef=useRef();
  const hoverRingRef=useRef();
  const hoverSpriteRef=useRef();
  const focusAlpha=useRef(0);
  const networkGain=useRef(0);
  const dummy=useMemo(()=>new THREE.Object3D(),[]);
  const focusedName=focusedLocation?.name?.toUpperCase();
  const hoveredName=hoveredCity?.name?.toUpperCase();

  const staticGeometry=useMemo(()=>makeStaticGeometry(staticConnections,radius),[radius]);
  const nameToCity=useMemo(()=>new Map(cities.map(city=>[city.name,city])),[]);
  const arcData=useMemo(()=>activeRoutes.map(route=>{
    const from=nameToCity.get(route.from);
    const to=nameToCity.get(route.to);
    const curve=makeArcCurve(from,to,radius,.09);
    return{...route,curve,glowGeometry:new THREE.TubeGeometry(curve,56,.010,5,false),coreGeometry:new THREE.TubeGeometry(curve,56,.0035,5,false)};
  }),[nameToCity,radius]);
  const markerData=useMemo(()=>cities.map(city=>{
    const normal=cityVector(city,1).normalize();
    return{
      city,
      position:normal.clone().multiplyScalar(radius+.014),
      quaternion:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal),
    };
  }),[radius]);
  const glowTexture=useMemo(createGlowTexture,[]);
  const coreGeometry=useMemo(()=>new THREE.SphereGeometry(1,12,12),[]);
  const pulseGeometry=useMemo(()=>new THREE.TorusGeometry(.045,.0025,5,36),[]);
  const focusPulseGeometry=useMemo(()=>new THREE.TorusGeometry(.072,.003,6,48),[]);
  const eventPulseGeometry=useMemo(()=>new THREE.TorusGeometry(.058,.0028,5,40),[]);
  const particleGeometry=useMemo(()=>new THREE.SphereGeometry(.018,10,10),[]);
  const particleGlowGeometry=useMemo(()=>new THREE.SphereGeometry(.052,10,10),[]);
  const burstGeometry=useMemo(()=>new THREE.SphereGeometry(.012,8,8),[]);
  const burstDirections=useMemo(()=>Array.from({length:18},(_,index)=>{
    const z=1-2*(index+.5)/18;
    const angle=index*2.399963229728653;
    const ring=Math.sqrt(1-z*z);
    return new THREE.Vector3(Math.cos(angle)*ring,z,Math.sin(angle)*ring);
  }),[]);
  const coreMaterials=useMemo(()=>({
    1:new THREE.MeshBasicMaterial({color:'#eafff8',toneMapped:false}),
    2:new THREE.MeshBasicMaterial({color:'#a8f5e7',toneMapped:false}),
    3:new THREE.MeshBasicMaterial({color:'#55b8ad',toneMapped:false}),
  }),[]);
  const spriteMaterials=useMemo(()=>({
    1:new THREE.SpriteMaterial({map:glowTexture,color:'#50ffd5',transparent:true,opacity:.76,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    2:new THREE.SpriteMaterial({map:glowTexture,color:'#42cfc1',transparent:true,opacity:.48,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
  }),[glowTexture]);
  const pulseMaterials=useMemo(()=>({
    1:new THREE.MeshBasicMaterial({color:'#7bffe0',transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    2:new THREE.MeshBasicMaterial({color:'#54d8c5',transparent:true,opacity:.34,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
  }),[]);
  const activeArcMaterials=useMemo(()=>({
    glow:new THREE.MeshBasicMaterial({color:'#36d8c7',transparent:true,opacity:.15,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    core:new THREE.MeshBasicMaterial({color:'#92ffea',transparent:true,opacity:.72,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
  }),[]);
  const focusMaterials=useMemo(()=>({
    arc:new THREE.MeshBasicMaterial({color:'#75ffe4',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    ring:new THREE.MeshBasicMaterial({color:'#75ffe4',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    sprite:new THREE.SpriteMaterial({map:glowTexture,color:'#75ffe4',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
  }),[glowTexture]);
  const hoverMaterials=useMemo(()=>({
    ring:new THREE.MeshBasicMaterial({color:'#8affeb',transparent:true,opacity:.72,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    sprite:new THREE.SpriteMaterial({map:glowTexture,color:'#75ffe4',transparent:true,opacity:.78,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
  }),[glowTexture]);
  const particleMaterials=useMemo(()=>({
    glow:new THREE.MeshBasicMaterial({color:'#44ffd4',transparent:true,opacity:.46,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    core:new THREE.MeshBasicMaterial({color:'#eafff8',toneMapped:false}),
  }),[]);
  const burstMaterial=useMemo(()=>new THREE.MeshBasicMaterial({color:'#84ffe8',transparent:true,opacity:.92,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),[]);
  const eventPulseMaterial=useMemo(()=>new THREE.MeshBasicMaterial({color:'#8bffe8',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),[]);
  const staticMaterial=useMemo(()=>new THREE.LineBasicMaterial({color:'#38848a',transparent:true,opacity:.26,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),[]);

  useEffect(()=>()=>{
    staticGeometry.dispose();
    arcData.forEach(route=>{route.glowGeometry.dispose();route.coreGeometry.dispose()});
    glowTexture.dispose();
    coreGeometry.dispose();
    pulseGeometry.dispose();
    focusPulseGeometry.dispose();
    eventPulseGeometry.dispose();
    particleGeometry.dispose();
    particleGlowGeometry.dispose();
    burstGeometry.dispose();
    Object.values(coreMaterials).forEach(material=>material.dispose());
    Object.values(spriteMaterials).forEach(material=>material.dispose());
    Object.values(pulseMaterials).forEach(material=>material.dispose());
    Object.values(activeArcMaterials).forEach(material=>material.dispose());
    Object.values(focusMaterials).forEach(material=>material.dispose());
    Object.values(hoverMaterials).forEach(material=>material.dispose());
    Object.values(particleMaterials).forEach(material=>material.dispose());
    burstMaterial.dispose();
    eventPulseMaterial.dispose();
    staticMaterial.dispose();
  },[staticGeometry,arcData,glowTexture,coreGeometry,pulseGeometry,focusPulseGeometry,eventPulseGeometry,particleGeometry,particleGlowGeometry,burstGeometry,coreMaterials,spriteMaterials,pulseMaterials,activeArcMaterials,focusMaterials,hoverMaterials,particleMaterials,burstMaterial,eventPulseMaterial,staticMaterial]);

  useFrame(({clock},delta)=>{
    const time=reducedMotion?0:clock.elapsedTime;
    const targetFocus=focusedName&&controller?.focusedLocation?.name?.toUpperCase()===focusedName?controller.focusIntensity:0;
    focusAlpha.current=THREE.MathUtils.damp(focusAlpha.current,targetFocus,8,delta);
    const accent=focusedLocation?.accentColor||'#75ffe4';
    focusMaterials.arc.color.set(accent);
    focusMaterials.ring.color.set(accent);
    focusMaterials.sprite.color.set(accent);
    hoverMaterials.ring.opacity=hoveredName?THREE.MathUtils.damp(hoverMaterials.ring.opacity,.72,9,delta):THREE.MathUtils.damp(hoverMaterials.ring.opacity,0,9,delta);
    hoverMaterials.sprite.opacity=hoveredName?THREE.MathUtils.damp(hoverMaterials.sprite.opacity,.76,9,delta):THREE.MathUtils.damp(hoverMaterials.sprite.opacity,0,9,delta);
    focusMaterials.arc.opacity=focusAlpha.current*.54;
    focusMaterials.ring.opacity=focusAlpha.current*.88;
    focusMaterials.sprite.opacity=focusAlpha.current*.74;
    if(focusRingRef.current){const pulse=reducedMotion?1:.92+.18*Math.sin(time*3.4);focusRingRef.current.scale.setScalar(pulse);}
    if(focusSpriteRef.current){const glow=.24+focusAlpha.current*.1;focusSpriteRef.current.scale.set(glow,glow,1);}
    if(hoverRingRef.current){const pulse=reducedMotion?1:.94+.13*Math.sin(time*4.2);hoverRingRef.current.scale.setScalar(pulse);}
    if(hoverSpriteRef.current){const glow=.2+hoverMaterials.sprite.opacity*.09;hoverSpriteRef.current.scale.set(glow,glow,1);}
    if(controller&&controller.focusSequence!==burstSequence.current){
      burstSequence.current=controller.focusSequence;
      const city=cities.find(item=>item.name===controller.focusedLocation?.name?.toUpperCase());
      if(city){burstOrigin.current.copy(cityVector(city,radius+.045));burstElapsed.current=0;burstMaterial.color.set(controller.focusedLocation.accentColor||'#84ffe8');}
    }
    const activeEvent=events?.activeEvent;
    const globalBurst=activeEvent?.type==='GLOBAL_NETWORK_BURST'?Math.sin(Math.PI*activeEvent.progress):0;
    networkGain.current=THREE.MathUtils.damp(networkGain.current,globalBurst,2.8,delta);
    activeArcMaterials.glow.opacity=.15+networkGain.current*.3;
    activeArcMaterials.core.opacity=.72+networkGain.current*.24;
    staticMaterial.opacity=.26+networkGain.current*.3;
    if((activeEvent?.type==='CITY_PULSE'||activeEvent?.type==='GLOBAL_NETWORK_BURST')&&activeEvent.id!==eventBurstId.current){
      eventBurstId.current=activeEvent.id;
      const city=cities.find(item=>item.name===activeEvent.payload.cityName);
      if(city){
        burstOrigin.current.copy(cityVector(city,radius+.045));
        burstElapsed.current=0;
        burstMaterial.color.set('#8bffe8');
      }
    }
    const eventCity=activeEvent?.type==='CITY_PULSE'||activeEvent?.type==='GLOBAL_NETWORK_BURST'?activeEvent.payload.cityName:null;
    eventPulseMaterial.opacity=eventCity?Math.max(0,1-activeEvent.progress)*.9:0;
    eventPulseMaterial.color.set('#8bffe8');
    eventPulseRefs.current.forEach(({node,city})=>{
      if(!node)return;
      const isEventCity=city.name===eventCity;
      node.visible=Boolean(isEventCity);
      if(isEventCity)node.scale.setScalar(1+activeEvent.progress*(activeEvent.type==='GLOBAL_NETWORK_BURST'?7.5:2.4));
    });
    if(burstRef.current){
      burstElapsed.current=Math.min(1.1,burstElapsed.current+delta);
      const progress=THREE.MathUtils.clamp(burstElapsed.current/.85,0,1);
      burstDirections.forEach((direction,index)=>{
        const distance=.035+progress*.34;
        dummy.position.copy(burstOrigin.current).addScaledVector(direction,distance);
        dummy.scale.setScalar(progress<1?.012*(1-progress):0);
        dummy.updateMatrix();
        burstRef.current.setMatrixAt(index,dummy.matrix);
      });
      burstRef.current.instanceMatrix.needsUpdate=true;
    }
    pulseRefs.current.forEach(({node,index,city})=>{
      if(!node)return;
      const tier=tierScale[city.tier]??1;
      const amplitude=city.tier===1?.28:.17;
      const speed=city.tier===1?1.55:1.12;
      const phase=index*1.618;
      const eventBoost=city.name===eventCity?(1-activeEvent.progress)*1.2:0;
      const hoverBoost=city.name===hoveredName? .45:0;
      node.scale.setScalar(tier*(1+amplitude*(.5+.5*Math.sin(time*speed+phase))+eventBoost+hoverBoost));
    });
    markerRefs.current.forEach(({node,city})=>{
      if(!node)return;
      const locationTransition=Boolean(controller?.locationFlight&&focusedName);
      const target=locationTransition&&city.name!==focusedName?.toUpperCase()? .78:1;
      const scale=THREE.MathUtils.damp(node.scale.x,target,6,delta);
      node.scale.setScalar(scale);
    });

    if(!particleCoreRef.current||!particleGlowRef.current)return;
    arcData.forEach((route,index)=>{
      const speed=(.34+(index%5)*.052)*(1+networkGain.current*3.2);
      const phase=(index*.61803398875)%1;
      let progress=reducedMotion?phase:(phase+time*speed)%1;
      const linked=focusedName&&(route.from===focusedName||route.to===focusedName);
      if(linked&&controller?.locationFlight){
        const converge=controller.focusIntensity;
        const target=route.to===focusedName?1:0;
        progress=THREE.MathUtils.lerp(progress,target,converge*.9);
      }
      route.curve.getPointAt(progress,dummy.position);
      const qualityVisible=quality?.particles!==undefined?(index/arcData.length)<quality.particles:true;
      dummy.scale.setScalar(qualityVisible?1:0);
      dummy.updateMatrix();
      particleCoreRef.current.setMatrixAt(index,dummy.matrix);
      dummy.scale.setScalar(qualityVisible?(reducedMotion?1:1.35+.12*Math.sin(time*5+index)):0);
      dummy.updateMatrix();
      particleGlowRef.current.setMatrixAt(index,dummy.matrix);
    });
    particleCoreRef.current.instanceMatrix.needsUpdate=true;
    particleGlowRef.current.instanceMatrix.needsUpdate=true;
  });

  return <group>
    <lineSegments geometry={staticGeometry} material={staticMaterial} frustumCulled={false} renderOrder={1}/>

    {arcData.map(route=>{
      const linked=Boolean(focusedName&&(route.from===focusedName||route.to===focusedName));
      return <group key={`${route.from}-${route.to}`}>
      <mesh geometry={route.glowGeometry} material={activeArcMaterials.glow} renderOrder={2}/>
      <mesh geometry={route.coreGeometry} material={activeArcMaterials.core} renderOrder={3}/>
      {linked&&<mesh geometry={route.glowGeometry} material={focusMaterials.arc} renderOrder={4}/>}
    </group>;
    })}

    {markerData.map(({city,position,quaternion},index)=>{
      const scale=tierScale[city.tier]??1;
      const important=city.tier<3;
      const isFocused=city.name===focusedName;
      const isHovered=city.name===hoveredName;
      return <group key={city.name} ref={node=>{markerRefs.current[index]={node,city}}} position={position} quaternion={quaternion}>
        {important&&<sprite material={spriteMaterials[city.tier]} position={[0,0,.012]} scale={[city.tier===1?.22:.17,city.tier===1?.22:.17,1]} renderOrder={2}/>}
        {important&&<mesh ref={node=>{pulseRefs.current[index]={node,index,city}}} geometry={pulseGeometry} material={pulseMaterials[city.tier]} position={[0,0,.012]} scale={scale} renderOrder={3}/>}
        <mesh ref={node=>{eventPulseRefs.current[index]={node,city}}} geometry={eventPulseGeometry} material={eventPulseMaterial} position={[0,0,.025]} visible={false} renderOrder={6}/>
        {isFocused&&<sprite ref={focusSpriteRef} material={focusMaterials.sprite} position={[0,0,.018]} scale={[.26,.26,1]} renderOrder={4}/>}
        {isFocused&&<mesh ref={focusRingRef} geometry={focusPulseGeometry} material={focusMaterials.ring} position={[0,0,.02]} renderOrder={5}/>}
        {isHovered&&<sprite ref={hoverSpriteRef} material={hoverMaterials.sprite} position={[0,0,.024]} scale={[.25,.25,1]} renderOrder={6}/>}
        {isHovered&&<mesh ref={hoverRingRef} geometry={focusPulseGeometry} material={hoverMaterials.ring} position={[0,0,.025]} scale={1.3} renderOrder={7}/>}
        <mesh geometry={coreGeometry} material={coreMaterials[city.tier]} position={[0,0,.02]} scale={(city.tier===1?.022:city.tier===2?.017:.011)*(isHovered?1.65:1)} renderOrder={4}/>
      </group>;
    })}

    <instancedMesh ref={particleGlowRef} args={[particleGlowGeometry,particleMaterials.glow,arcData.length]} frustumCulled={false} renderOrder={4}/>
    <instancedMesh ref={particleCoreRef} args={[particleGeometry,particleMaterials.core,arcData.length]} frustumCulled={false} renderOrder={5}/>
    <instancedMesh ref={burstRef} args={[burstGeometry,burstMaterial,burstDirections.length]} frustumCulled={false} renderOrder={6}/>
  </group>;
}
