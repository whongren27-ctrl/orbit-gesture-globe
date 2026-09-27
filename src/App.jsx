import {useCallback,useEffect,useMemo,useState} from 'react';
import GlobeScene from './components/GlobeScene';import HUD from './components/HUD';import HandCamera from './components/HandCamera';import {useHandTracking} from './hooks/useHandTracking';import{GestureController}from './gesture/GestureController';
import {CinematicDirector} from './controllers/CinematicDirector.js';
import {VisualEventController} from './controllers/VisualEventController.js';
import {useAdaptiveQuality} from './hooks/useAdaptiveQuality.js';
export default function App(){const controller=useMemo(()=>new GestureController(),[]);const director=useMemo(()=>new CinematicDirector(),[]);const visualEvents=useMemo(()=>new VisualEventController(),[]);const quality=useAdaptiveQuality();const tracking=useHandTracking(controller);const[debug,setDebug]=useState(false),[fullscreen,setFullscreen]=useState(false),[error,setError]=useState(''),[reducedMotion,setReducedMotion]=useState(false),[focusedLocation,setFocusedLocation]=useState(null),[telemetry,setTelemetry]=useState({x:7.45,y:-24.06,z:0,zoom:1,paused:false,focusIntensity:0,focusedLocation:null,autopilot:false,visualEvent:null});
 useEffect(()=>{const change=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[]);
 useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReducedMotion(query.matches);update();query.addEventListener?.('change',update);return()=>query.removeEventListener?.('change',update)},[]);
 const onFullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{setError('Fullscreen is unavailable in this browser. Open in Chrome for fullscreen.')}};
 const onError=useCallback(message=>setError(message),[]);
 const onTelemetry=useCallback(next=>{setTelemetry(next);setFocusedLocation(next.focusedLocation||null)},[]);
 const onFocusLocation=useCallback(location=>{controller.markActivity();if(controller.focusLocation(location,{reducedMotion}))setFocusedLocation(location)},[controller,reducedMotion]);
 const onReset=useCallback(()=>{controller.reset();setFocusedLocation(null)},[controller]);
 return <main className="app"><GlobeScene controller={controller} director={director} visualEvents={visualEvents} quality={quality} focusedLocation={focusedLocation} onTelemetry={onTelemetry} onError={onError}/><div className="vignette"/><HUD {...{tracking,telemetry,debug,setDebug,fullscreen,onFullscreen,onReset,focusedLocation,error}}/><HandCamera tracking={tracking} debug={debug}/></main>
}
