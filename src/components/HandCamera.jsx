import {useEffect,useRef} from 'react';
import {HAND_CONNECTIONS} from '../utils/gestureMath';
export default function HandCamera({tracking,debug}){
 const canvasRef=useRef(null);
 useEffect(()=>{if(!debug)return;const id=setInterval(()=>{const canvas=canvasRef.current;if(!canvas)return;const c=canvas.getContext('2d');c.clearRect(0,0,640,480);const lm=tracking.landmarksRef.current;if(!lm.length)return;c.strokeStyle='#67f5dc';c.lineWidth=2;HAND_CONNECTIONS.forEach(([a,b])=>{c.beginPath();c.moveTo(lm[a].x*640,lm[a].y*480);c.lineTo(lm[b].x*640,lm[b].y*480);c.stroke()});c.fillStyle='#fff';lm.forEach(p=>{c.beginPath();c.arc(p.x*640,p.y*480,4,0,Math.PI*2);c.fill()})},50);return()=>clearInterval(id)},[debug,tracking.landmarksRef]);
 const d=tracking.status.debug||{};
 const rows=[
  ['RAW GESTURE',d.rawGesture||'NONE'],['STABLE GESTURE',d.stableGesture||'NONE'],
  ['CURRENT STATE',d.state||'IDLE'],['HAND SURFACE',`${d.surface||'UNKNOWN'} · ${d.handedness||'RIGHT'} HAND`],
  ['HAND X / Y',`${(d.handX||0).toFixed(3)} / ${(d.handY||0).toFixed(3)}`],
  ['INDEX X / Y',`${(d.indexX||0).toFixed(3)} / ${(d.indexY||0).toFixed(3)}`],
  ['DELTA X',`${(d.deltaX||0)>=0?'+':''}${(d.deltaX||0).toFixed(3)}`],
  ['SWIPE VELOCITY',`${(d.swipeVelocity||0)>=0?'+':''}${(d.swipeVelocity||0).toFixed(2)} / s`],
  ['FINGERS I / M / R / P',(d.fingerScores||[0,0,0,0]).map(score=>score.toFixed(2)).join(' · ')],
  ['THUMB–INDEX RATIO',(d.pinchRatio||0).toFixed(2)],
  ['GESTURE CONFIDENCE',`${Math.round((d.gestureConfidence||0)*100)}%`],
 ];
 return <div className={`camera-preview ${debug?'visible':''}`} aria-hidden={!debug}><div className="camera-heading"><span>VISION DEBUG</span><span>{tracking.status.fps} FPS · 21 LANDMARKS</span></div><div className="camera-feed"><video ref={tracking.videoRef} autoPlay playsInline muted/><canvas ref={canvasRef} width="640" height="480"/>{tracking.status.camera!=='CONNECTED'&&<span className="camera-placeholder">{tracking.status.camera}</span>}</div><div className="hand-debug-readout">{rows.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div><small>LOCAL PROCESSING · VIDEO IS NEVER UPLOADED</small></div>
}
