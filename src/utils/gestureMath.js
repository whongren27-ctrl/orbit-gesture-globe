export const lerp = (a,b,t) => a+(b-a)*t;
export const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
export const deadZone = (value,threshold=.012) => Math.sign(value)*Math.max(Math.abs(value)-threshold,0);

/** Convert camera landmarks into the same left/right coordinates the user sees in a mirrored selfie preview. */
export function normalizeHandCoordinates(point,{mirrored=true}={}) {
  return {x:mirrored?1-point.x:point.x,y:point.y};
}

/** Speed-adaptive low-pass filter used for normalized landmark coordinates (1€ filter). */
export class OneEuroFilter {
  constructor({minCutoff=.85,beta=1.05,derivativeCutoff=1,minAlpha=.16,maxAlpha=.45}={}) {
    this.minCutoff=minCutoff;
    this.beta=beta;
    this.derivativeCutoff=derivativeCutoff;
    this.minAlpha=minAlpha;
    this.maxAlpha=maxAlpha;
    this.lastRaw=null;
    this.lastTime=null;
    this.value=null;
    this.derivative=0;
  }

  alpha(cutoff,dt) {
    const tau=1/(2*Math.PI*cutoff);
    return clamp(1/(1+tau/dt),this.minAlpha,this.maxAlpha);
  }

  filter(raw,timeMs) {
    if(this.value===null||this.lastTime===null){this.lastRaw=raw;this.lastTime=timeMs;this.value=raw;return raw;}
    const dt=clamp((timeMs-this.lastTime)/1000,1/120,.1);
    const rawDerivative=(raw-this.lastRaw)/dt;
    const derivativeAlpha=this.alpha(this.derivativeCutoff,dt);
    this.derivative=lerp(this.derivative,rawDerivative,derivativeAlpha);
    const cutoff=this.minCutoff+this.beta*Math.abs(this.derivative);
    this.value=lerp(this.value,raw,this.alpha(cutoff,dt));
    this.lastRaw=raw;
    this.lastTime=timeMs;
    return this.value;
  }

  reset() {this.lastRaw=null;this.lastTime=null;this.value=null;this.derivative=0;}
}

function angleAt(lm,previous,joint,next) {
  const ax=lm[previous].x-lm[joint].x, ay=lm[previous].y-lm[joint].y, az=(lm[previous].z??0)-(lm[joint].z??0);
  const bx=lm[next].x-lm[joint].x, by=lm[next].y-lm[joint].y, bz=(lm[next].z??0)-(lm[joint].z??0);
  const denominator=Math.hypot(ax,ay,az)*Math.hypot(bx,by,bz);
  if(denominator<1e-6)return 0;
  return Math.acos(clamp((ax*bx+ay*by+az*bz)/denominator,-1,1))*180/Math.PI;
}

/** Combines finger bend and extension distance, so the result tolerates rotated palms and slightly bent fingertips. */
export function fingerExtensionScore(lm,mcp,pip,tip) {
  if(!lm||lm.length!==21)return 0;
  const segment=Math.max(distance(lm[mcp],lm[pip]),.001);
  const extensionRatio=distance(lm[mcp],lm[tip])/segment;
  const lengthScore=clamp((extensionRatio-1.05)/.95,0,1);
  const angleScore=clamp((angleAt(lm,mcp,pip,tip)-112)/62,0,1);
  return lengthScore*.68+angleScore*.32;
}

const FINGER_TRIPLETS=[[5,6,8],[9,10,12],[13,14,16],[17,18,20]];
const fingerState=(score)=>score>=.56?'EXTENDED':score<=.44?'FOLDED':'AMBIGUOUS';

/** Uses handedness plus thumb/pinky screen order to distinguish palm from dorsum. */
export function classifyHandSurface(lm,handedness='Right') {
  if(!lm||lm.length!==21)return 'UNKNOWN';
  const thumbPinkyDelta=lm[4].x-lm[20].x;
  const palmWidth=Math.max(Math.abs(lm[5].x-lm[17].x),.02);
  if(Math.abs(thumbPinkyDelta)/palmWidth<.38)return 'UNKNOWN';
  const isLeft=String(handedness).toLowerCase()==='left';
  const thumbOnRight=thumbPinkyDelta>0;
  return isLeft===thumbOnRight?'PALM':'BACK';
}

export function classifyGestureDetails(lm,previous='NONE',handedness='Right') {
  if(!lm||lm.length!==21)return {gesture:'NONE',fingerConfidence:0,fingerScores:[]};
  const scale=Math.max(distance(lm[0],lm[9]),.025);
  const fingerScores=FINGER_TRIPLETS.map(([mcp,pip,tip])=>fingerExtensionScore(lm,mcp,pip,tip));
  const states=fingerScores.map(fingerState);
  const surface=classifyHandSurface(lm,handedness);
  const ratio=distance(lm[4],lm[8])/scale;
  // Pinch hysteresis belongs only to an active pinch. Extending it to other
  // poses made a relaxed thumb accidentally switch rotation or city navigation
  // into zoom mode.
  const pinchLimit=previous==='PINCH'?.4:.32;
  const certaintyFor=(indices,expected)=>indices.reduce((sum,index)=>sum+(expected==='EXTENDED'?fingerScores[index]:1-fingerScores[index]),0)/indices.length;
  const structure=(indices,expected)=>indices.every(index=>states[index]===expected);
  const palm=fingerScores.every(score=>score>=.52);
  const threeFinger=fingerScores[0]>=.52&&fingerScores[1]>=.52&&fingerScores[2]>=.52&&fingerScores[3]<=.56;
  const victory=fingerScores[0]>=.58&&fingerScores[1]>=.58&&fingerScores[2]<=.4&&fingerScores[3]<=.4;
  const fist=fingerScores.every(score=>score<=.4);
  const pinch=ratio<pinchLimit&&fingerScores[0]>=.58;
  const backhand=palm&&surface==='BACK'&&fingerScores.every(score=>score>=.64);

  // Explicit three-finger and victory shapes win over thumb proximity; a
  // relaxed thumb must not steal the meteor gesture as PINCH.
  let gesture='NONE',fingerConfidence=certaintyFor([0,1,2,3],states.map((state,index)=>state==='EXTENDED'&&fingerScores[index]>=.56?'EXTENDED':'FOLDED'));
  if(fist){gesture='FIST';fingerConfidence=certaintyFor([0,1,2,3],'FOLDED');}
  else if(threeFinger){gesture='THREE_FINGER';fingerConfidence=(certaintyFor([0,1,2],'EXTENDED')+certaintyFor([3],'FOLDED'))/2;}
  else if(victory){gesture='VICTORY';fingerConfidence=(certaintyFor([0,1],'EXTENDED')+certaintyFor([2,3],'FOLDED'))/2;}
  else if(pinch){
    gesture='PINCH';
    fingerConfidence=clamp(.62+certaintyFor([0],'EXTENDED')*.2+(pinchLimit-ratio)/Math.max(pinchLimit,.01)*.18,0,1);
  }
  else if(backhand){gesture='BACKHAND';fingerConfidence=certaintyFor([0,1,2,3],'EXTENDED');}
  else if(palm){gesture='PALM';fingerConfidence=certaintyFor([0,1,2,3],'EXTENDED');}
  else fingerConfidence=clamp(fingerScores.reduce((sum,score)=>sum+Math.abs(score-.5)*2,0)/4,0,1);

  return {gesture,fingerConfidence:clamp(fingerConfidence,0,1),fingerScores,states,pinchRatio:ratio,surface};
}

export function classifyGesture(lm,previous='NONE',handedness='Right') {
  return classifyGestureDetails(lm,previous,handedness).gesture;
}

export const HAND_CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[16,17],[17,18],[18,19],[19,20],[0,17]];
