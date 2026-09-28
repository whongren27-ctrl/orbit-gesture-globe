/* Classic worker: MediaPipe's WASM loader uses importScripts. Frames never block the render loop. */
let landmarker;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   self.exports={};
   importScripts(new URL('vendor/vision_bundle.js',self.location.href).href);
   const vision=self.exports;
   const files=await vision.FilesetResolver.forVisionTasks(data.base+'/vendor/wasm');
   landmarker=await vision.HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:data.base+'/models/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.54,minHandPresenceConfidence:.5,minTrackingConfidence:.46});
   self.postMessage({type:'ready'});
  }else if(data.type==='frame'){
   try{const result=landmarker.detectForVideo(data.bitmap,data.time);const hands=result.landmarks??[];const handednesses=(result.handedness??[]).map(item=>item?.[0]);const primary=handednesses[0];self.postMessage({type:'result',landmarks:hands[0]??[],hands,confidence:primary?.score??0,handedness:primary?.categoryName??'Right',handednesses:handednesses.map(hand=>hand?.categoryName??'Right')});}finally{data.bitmap.close();}
  }
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
