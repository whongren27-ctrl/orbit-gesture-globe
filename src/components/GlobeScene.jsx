import {Component,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {EffectComposer,Bloom,Vignette,Noise} from '@react-three/postprocessing';
import {BlendFunction} from 'postprocessing';
import AtmosphereGlow from './globe/AtmosphereGlow';
import CityNetwork from './globe/CityNetwork';
import DotEarth from './globe/DotEarth';
import MeteorShower from './space/MeteorShower';
import StarField from './space/StarField';
import SpaceDust from './space/SpaceDust';
import SunGlow from './space/SunGlow';
import OrbitalCompanions from './space/OrbitalCompanions';
import { getAdjacentLocation } from './globe/LocationNavigator';
import { CameraController, CAMERA_MODES } from '../controllers/CameraController.js';
import { cities } from '../data/cities.js';
import { locations } from '../data/locations.js';
const R=2;
function useReducedMotion(){const [reduced,setReduced]=useState(false);useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(query.matches);update();query.addEventListener?.('change',update);return()=>query.removeEventListener?.('change',update)},[]);return reduced;}
function PostProcessing({quality}){return <EffectComposer multisampling={0} resolutionScale={quality?.bloomResolution??1}><Bloom intensity={.82} luminanceThreshold={.78} luminanceSmoothing={.28} mipmapBlur/><Vignette offset={.18} darkness={.34}/><Noise opacity={.012} blendFunction={BlendFunction.SOFT_LIGHT}/></EffectComposer>}
function World({controller,director,visualEvents,quality,focusedLocation,onTelemetry,onError}){
 const group=useRef(),last=useRef(0),{camera,size}=useThree(),reducedMotion=useReducedMotion();
 const cameraController=useMemo(()=>new CameraController(),[]);
 const cityHover=useRef({name:null,since:0});
 const handledPinch=useRef(0);
 const citySamples=useMemo(()=>cities.map(city=>{
  const latitude=THREE.MathUtils.degToRad(city.lat),longitude=THREE.MathUtils.degToRad(city.lng);
  const normal=new THREE.Vector3(Math.cos(latitude)*Math.sin(longitude),Math.sin(latitude),Math.cos(latitude)*Math.cos(longitude));
  const location=locations.find(item=>item.name.toUpperCase()===city.name)||{
   name:city.name.split(' ').map(word=>word[0]+word.slice(1).toLowerCase()).join(' '),
   latitude:city.lat,longitude:city.lng,cameraDistance:2.65,cameraTilt:0,accentColor:'#75ffe4',
  };
  return{city,location,local:normal.clone().multiplyScalar(R+.02),world:new THREE.Vector3(),normal:new THREE.Vector3(),projected:new THREE.Vector3()};
 }),[]);
 const cameraWorld=useMemo(()=>new THREE.Vector3(),[]);
 const cameraToCity=useMemo(()=>new THREE.Vector3(),[]);
 const findNearestCity=(ndc,maxDistance)=>{
  if(!group.current)return null;
  group.current.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  camera.getWorldPosition(cameraWorld);
  let nearest=null,nearestDistance=maxDistance;
  for(const sample of citySamples){
   sample.world.copy(sample.local).applyMatrix4(group.current.matrixWorld);
   sample.normal.copy(sample.world).normalize();
   if(sample.normal.dot(cameraToCity.copy(cameraWorld).sub(sample.world).normalize())<=0)continue;
   sample.projected.copy(sample.world).project(camera);
   if(sample.projected.z< -1||sample.projected.z>1)continue;
   const dx=(sample.projected.x-ndc.x)*size.width*.5;
   const dy=(sample.projected.y-ndc.y)*size.height*.5;
   const distancePx=Math.hypot(dx,dy);
   if(distancePx<nearestDistance){nearestDistance=distancePx;nearest=sample.location;}
  }
  return nearest;
 };

 useFrame((state,dt)=>{
  director.update(dt,controller,{reducedMotion});
  visualEvents.update(dt,{reducedMotion});
  controller.update(dt);
  group.current.rotation.set(controller.rotation.x,controller.rotation.y,controller.rotation.z||0,'XYZ');

  if(controller.consumeMeteorTrigger())visualEvents.trigger('METEOR_SHOWER');
  const swipe=controller.consumeCitySwipe();
  if(swipe){
   const direction=swipe==='NEXT_CITY'?1:-1;
   const location=getAdjacentLocation(controller.lastFocusedLocation||controller.focusedLocation,direction);
   controller.focusLocation(location,{reducedMotion,duration:1.55,source:'swipe'});
  }

  const rotating=controller.machineState==='ROTATE'&&controller.gesture==='PALM'&&controller.hasHand;
  if(rotating){
   const candidate=findNearestCity(controller.handNdc,Math.max(65,Math.min(115,size.width*.09)));
   if(candidate){
    if(cityHover.current.name!==candidate.name)cityHover.current={name:candidate.name,since:state.clock.elapsedTime};
    else if(state.clock.elapsedTime-cityHover.current.since>=.22)controller.hoveredCity=candidate;
   }else{cityHover.current={name:null,since:0};controller.hoveredCity=null;}
  }else{cityHover.current={name:null,since:0};controller.hoveredCity=null;}

  if(controller.pinchSequence!==handledPinch.current){
   handledPinch.current=controller.pinchSequence;
   const city=findNearestCity(controller.pinchNdc,Math.max(115,Math.min(165,size.width*.13)));
   if(city)controller.focusLocation(city,{reducedMotion,duration:2.25,source:'gesture'});
  }

  const aspect=size.width/size.height;
  const base=aspect<1.1?6.45:aspect<1.2?8.0:7.9;
  const event=visualEvents.activeEvent;
  const flybyDolly=event?.type==='CAMERA_FLYBY'&&!reducedMotion?Math.sin(Math.PI*event.progress)*.075:0;
  const cameraMode=controller.resetting?CAMERA_MODES.RESETTING
   :director.active?CAMERA_MODES.AUTOPILOT
   :(controller.machineState==='CITY_FOCUS'||controller.locationFlight||controller.focusIntensity>.025)?CAMERA_MODES.CITY_FOCUS
   :controller.zoom>=1.48?CAMERA_MODES.CLOSE_UP
   :controller.zoom<=.82?CAMERA_MODES.WIDE_SPACE
   :CAMERA_MODES.DEFAULT;
  if(!(controller.paused&&controller.locationFlight))cameraController.update(camera,dt,{mode:cameraMode,zoom:controller.zoom,cameraDistance:controller.cameraDistance,baseDistance:base/7.9,dolly:flybyDolly,reducedMotion});

  if(state.clock.elapsedTime-last.current>.1){
   last.current=state.clock.elapsedTime;
   onTelemetry({x:controller.rotation.x*180/Math.PI,y:controller.rotation.y*180/Math.PI,z:(controller.rotation.z||0)*180/Math.PI,zoom:controller.zoom,cameraDistance:controller.cameraDistance,paused:controller.paused,focusIntensity:controller.focusIntensity,focusedLocation:controller.focusedLocation,hoveredCity:controller.hoveredCity,locationLocked:Boolean(controller.locationFlight),autopilot:director.active,visualEvent:visualEvents.activeEvent?.type||null,gestureAction:performance.now()<controller.gestureActionUntil?controller.gestureAction:'',cameraMode,quality:quality?.name||'HIGH'});
  }
 });
 return <><ambientLight intensity={.65}/><directionalLight position={[-8,6,-12]} intensity={1.4} color="#bdefff"/><StarField controller={controller} quality={quality} reducedMotion={reducedMotion}/><SunGlow events={visualEvents} reducedMotion={reducedMotion}/><OrbitalCompanions events={visualEvents} reducedMotion={reducedMotion}/><MeteorShower quality={quality} reducedMotion={reducedMotion} events={visualEvents}/><SpaceDust quality={quality} reducedMotion={reducedMotion} events={visualEvents} controller={controller}/><AtmosphereGlow radius={R}/><group ref={group}><DotEarth radius={R} quality={quality} onError={onError}/><CityNetwork radius={R} quality={quality} reducedMotion={reducedMotion} focusedLocation={focusedLocation} hoveredCity={controller.hoveredCity} controller={controller} events={visualEvents}/></group><PostProcessing quality={quality}/></>
}
class SceneBoundary extends Component{state={error:false};static getDerivedStateFromError(){return{error:true}}render(){return this.state.error?<div className="scene-error">WebGL could not start. Enable hardware acceleration in Chrome and reload.</div>:this.props.children}}
export default function GlobeScene({controller,director,visualEvents,quality,focusedLocation,onTelemetry,onError}){
 const pointer=useRef(null);
 return <div className="globe-canvas" onPointerDown={e=>{if(e.target.tagName!=='CANVAS')return;pointer.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!pointer.current)return;controller.drag(e.clientX-pointer.current.x,e.clientY-pointer.current.y);pointer.current={x:e.clientX,y:e.clientY}}} onPointerUp={()=>pointer.current=null} onPointerCancel={()=>pointer.current=null} onWheel={e=>controller.scroll(e.deltaY)} role="application" aria-label="Interactive Earth. Drag to rotate, scroll to zoom. Arrow keys rotate, plus and minus zoom, R resets." tabIndex={0} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','r','R'].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft')controller.drag(-12,0);if(e.key==='ArrowRight')controller.drag(12,0);if(e.key==='ArrowUp')controller.drag(0,-12);if(e.key==='ArrowDown')controller.drag(0,12);if(e.key==='+'||e.key==='=')controller.scroll(-100);if(e.key==='-')controller.scroll(100);if(e.key.toLowerCase()==='r')controller.reset()}}><SceneBoundary><Canvas camera={{position:[0,0,8.65],fov:42,near:.1,far:200}} dpr={[1,quality?.dpr??1.5]} gl={{antialias:true,alpha:true,powerPreference:'high-performance',stencil:false,depth:true}} onCreated={({gl})=>gl.setClearColor('#000000',0)}><World controller={controller} director={director} visualEvents={visualEvents} quality={quality} focusedLocation={focusedLocation} onTelemetry={onTelemetry} onError={onError}/></Canvas></SceneBoundary></div>
}
