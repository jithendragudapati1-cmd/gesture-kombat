'use client';
import {useEffect,useRef,useState} from 'react';
import {publishLivePose,clearLivePose} from '../lib/live-pose';
import {createPortal} from 'react-dom';
import {Camera,CameraOff,RotateCcw,ScanLine} from 'lucide-react';
import {GestureRecognition,type TrackingResult} from '../lib/gestures';
type HolisticInstance={setOptions:(x:Record<string,unknown>)=>void;onResults:(fn:(r:TrackingResult)=>void)=>void;send:(x:{image:HTMLVideoElement})=>Promise<void>;close:()=>Promise<void>};
declare global{interface Window{Holistic?:new(x:{locateFile:(f:string)=>string})=>HolisticInstance;}}
const CDN='https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/';
let library:Promise<void>|undefined;
function load(){return library??=new Promise<void>((resolve,reject)=>{if(window.Holistic){resolve();return;}const s=document.createElement('script');s.src=CDN+'holistic.js';s.crossOrigin='anonymous';s.onload=()=>resolve();s.onerror=()=>{library=undefined;reject(Error('Could not load tracking. Check your connection and retry.'));};document.head.appendChild(s);});}
const connections=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
const handConnections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export default function CameraPanel({host,onActions,onReady,forceOff=false}:{forceOff?:boolean;host:HTMLElement|null;onActions:(actions:string[],events:string[])=>void;onReady:(ready:boolean)=>void}){
 const video=useRef<HTMLVideoElement|null>(null),canvas=useRef<HTMLCanvasElement>(null),recognizer=useRef(new GestureRecognition()),streamRef=useRef<MediaStream|null>(null);
 const callbacks=useRef({onActions,onReady});callbacks.current={onActions,onReady};
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('Your movement is the controller'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[active,setActive]=useState<string[]>([]),[metrics,setMetrics]=useState({fps:0,ms:0}),[profile,setProfile]=useState('fast');
 useEffect(()=>{if(forceOff)setEnabled(false);},[forceOff]);
 useEffect(()=>{if(!enabled){setActive([]);setStatus('Your movement is the controller');setMetrics({fps:0,ms:0});callbacks.current.onReady(false);callbacks.current.onActions([],[]);return;}
  let alive=true,model:HolisticInstance|undefined,raf=0,vfc=0,scheduledVideo:HTMLVideoElement|null=null,inflight:Promise<void>|undefined,ready=false,lastVideo=-1,count=0,started=performance.now(),totalMs=0;
  const abort=new AbortController();
  // Keep one tracking pipeline per origin: multiple open game tabs otherwise
  // compete for the webcam and run duplicate full-body inference models.
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('gesture-kombat-camera'):null;
  if(channel){channel.onmessage=e=>{if(e.data==='claim-camera')setEnabled(false);};channel.postMessage('claim-camera');}

  setBusy(true);setError('');setStatus('Loading body + hand tracking…');
  const clear=()=>{clearLivePose();callbacks.current.onActions([],[]);setActive([]);recognizer.current.reset();};
  const visibility=()=>{if(document.hidden)clear();};document.addEventListener('visibilitychange',visibility,{signal:abort.signal});
  (async()=>{try{
   await load();if(!alive)return;
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:60,max:60},facingMode:'user'},audio:false});
   if(!alive){stream.getTracks().forEach(t=>t.stop());return;}streamRef.current=stream;
   const v=document.createElement('video');v.muted=true;v.playsInline=true;video.current=v;v.srcObject=stream;await v.play();if(!alive)return;
   model=new window.Holistic!({locateFile:f=>CDN+f});model.setOptions({modelComplexity:profile==='accurate'?1:0,smoothLandmarks:false,enableSegmentation:false,refineFaceLandmarks:false,minDetectionConfidence:.5,minTrackingConfidence:.5});
   let lastActions='';
   model.onResults(r=>{if(!alive||document.hidden)return;publishLivePose(r);const result=recognizer.current.update(r,performance.now());
    const signature=result.actions.join('|');if(signature!==lastActions){lastActions=signature;setActive(result.actions);}setStatus(result.status);callbacks.current.onActions(result.actions,result.events);
    if(!ready){ready=true;setBusy(false);callbacks.current.onReady(true);}
    const c=canvas.current,v=video.current;if(!c||!v)return;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,640,480);ctx.drawImage(v,0,0,640,480);
    const line=(points:NonNullable<TrackingResult['poseLandmarks']>,edges:number[][])=>{ctx.strokeStyle='#78f6ad';ctx.fillStyle='#b8ffd6';ctx.lineWidth=2;for(const [a,b]of edges){if((points[a].visibility??1)<.4||(points[b].visibility??1)<.4)continue;ctx.beginPath();ctx.moveTo(points[a].x*640,points[a].y*480);ctx.lineTo(points[b].x*640,points[b].y*480);ctx.stroke();}for(const p of points){if((p.visibility??1)<.4)continue;ctx.beginPath();ctx.arc(p.x*640,p.y*480,2,0,7);ctx.fill();}};
    if(r.poseLandmarks)line(r.poseLandmarks,connections);if(r.leftHandLandmarks)line(r.leftHandLandmarks,handConnections);if(r.rightHandLandmarks)line(r.rightHandLandmarks,handConnections);
   });
   // One inference in flight. Schedule against fresh video frames; never queue stale frames.
   function schedule(){if(!alive)return;const v=video.current;if(v&&!document.hidden&&v.requestVideoFrameCallback){scheduledVideo=v;vfc=v.requestVideoFrameCallback(()=>void frame());}else raf=requestAnimationFrame(()=>void frame());}
   async function frame(){if(!alive||!model)return;const v=video.current;if(document.hidden||!v||v.readyState<2||v.currentTime===lastVideo){schedule();return;}
    lastVideo=v.currentTime;const begin=performance.now();
    try{inflight=model.send({image:v});await inflight;const end=performance.now();count++;totalMs+=end-begin;
     if(alive&&end-started>=500){setMetrics({fps:Math.round(count*1000/(end-started)),ms:Math.round(totalMs/count)});count=0;totalMs=0;started=end;}
    }catch(e){if(alive){setError(e instanceof Error?e.message:'Tracking stopped. Retry camera.');setEnabled(false);}return;}
    schedule();
   }
   schedule();
  }catch(e){if(alive){setError(e instanceof Error?e.message:'Allow camera access, then retry.');setBusy(false);setEnabled(false);}}})();
  return()=>{channel?.close();clearLivePose();alive=false;abort.abort();cancelAnimationFrame(raf);if(vfc)scheduledVideo?.cancelVideoFrameCallback(vfc);streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;const oldVideo=video.current;video.current=null;void (inflight??Promise.resolve()).catch(()=>{}).then(()=>{oldVideo?.pause();if(oldVideo)oldVideo.srcObject=null;return model?.close();});recognizer.current.reset();callbacks.current.onReady(false);callbacks.current.onActions([],[]);};
 },[enabled,profile]);
 const content=<section className="camera-panel"><div className="section-label"><span><ScanLine size={14}/> MOTION TRACKING</span><span className={enabled&&!busy?'live-dot':'muted'}>{enabled&&!busy?'LIVE':'OFF'}</span></div><div className="camera-view"><canvas ref={canvas} width={640} height={480} style={{display:enabled?'block':'none'}}/>{!enabled&&<div className="camera-empty"><Camera size={30}/><strong>Step into the game.</strong><span>Turn your body into a controller.</span><button className="small-btn" onClick={()=>setEnabled(true)}>Enable camera <span>↗</span></button></div>}{busy&&enabled&&<div className="camera-loading"><span className="spinner"/> Loading tracking</div>}<div className="camera-corners"/></div>{error&&<p className="error-text" role="alert">{error}</p>}<div className="tracking-metrics"><span>{metrics.fps} <b>TRACK FPS</b></span><span>{metrics.ms} <b>ms / FRAME</b></span><span className="green">LOCAL</span></div><label className="tracking-profile">TRACKING MODE<select value={profile} onChange={e=>setProfile(e.target.value)}><option value="fast">Fast response</option><option value="accurate">Higher accuracy</option></select></label><div className="camera-status"><span className={enabled?'green':'muted'}>●</span><span>{status}</span></div><div className="camera-actions">{active.length?active.map(a=><span key={a}>{a}</span>):<span className="muted">No active gestures</span>}</div><div className="camera-buttons"><button onClick={()=>{clearLivePose();recognizer.current.reset();setStatus('Reference reset — stand upright');}} disabled={!enabled}><RotateCcw size={13}/> Recalibrate</button>{enabled&&<button onClick={()=>setEnabled(false)}><CameraOff size={13}/> Turn off</button>}</div><p className="privacy-note">Camera stays on your device. Actions animate immediately.</p></section>;
 return host?createPortal(content,host):null;
}
