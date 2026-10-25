'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {readLivePose,readLiveTranslation} from '../lib/live-pose';
import {fighter,type Fighter} from '../lib/combat';
import {previewFighters,type LocalControl} from '../lib/local-preview';
import {ARENAS,type ArenaId} from '../lib/arenas';
import {CHARACTERS,type CharacterId} from '../lib/characters';
export type ArenaView={fighters:Fighter[];status:string;serverTime:number;start:number;side:number;winner:number|null;arena?:ArenaId};
export default function Arena3D({room,hero=false,controls,instructorAction,character='raven',arena='moon-citadel',live=false,actions=[]}:{room?:ArenaView|null;hero?:boolean;controls?:RefObject<()=>LocalControl>;instructorAction?:string;character?:CharacterId;arena?:ArenaId;live?:boolean;actions?:string[]}){
 const canvas=useRef<HTMLCanvasElement>(null),data=useRef({room,at:Date.now(),instructorAction,character,live,actions}),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 if(data.current.room!==room)data.current.at=Date.now();Object.assign(data.current,{room,instructorAction,character,live,actions});
 const solo=live||instructorAction!==undefined,location=ARENAS[room?.arena??arena];
 useEffect(()=>{let alive=true,dispose:(()=>void)|undefined;const started=Date.now();setLoaded(false);setError('');
  import('../lib/scene3d').then(({mountScene})=>{if(!alive||!canvas.current)return;try{
   dispose=mountScene(canvas.current,solo,()=>{const d=data.current,r=d.room,now=Date.now();const demo=solo?[fighter(CHARACTERS[d.character].name,50,now,d.character)]:[fighter('Raven',29,started,'raven'),fighter('Vortex',71,started,'vortex')];return {liveTranslation:d.live?readLiveTranslation():undefined,soloActions:d.actions,soloMode:d.live?'live':'training',selectedCharacter:d.character,localPose:d.live||r?.status==='playing'&&r.serverTime>=r.start?readLivePose():undefined,localSide:d.live?0:r?.side,fighters:r?.fighters.length===2?r.status==='playing'&&r.serverTime>=r.start&&controls?previewFighters(r.fighters,r.side,controls.current(),r.serverTime,d.at,now):r.fighters:demo,now:r?r.serverTime+now-d.at:now,outcome:r?.status==='finished'?r.winner:undefined,instructorAction:d.instructorAction,instructorPhase:((now-started)%2800)/2800};},location.id);
  }catch(e){setError(e instanceof Error?e.message:'3D rendering is unavailable. Enable browser hardware acceleration.');}}).catch(()=>setError('Could not load 3D. Refresh and retry.'));
  const status=setInterval(()=>{const c=canvas.current;if(c?.dataset.modelState==='ready')setLoaded(true);if(c?.dataset.error)setError(c.dataset.error);},150);
  return()=>{alive=false;clearInterval(status);dispose?.();};
 },[solo,controls,location.id]);
 return <div className={'webgl-scene arena-art-scene'+(hero?' hero-3d':'')+(solo?' solo-3d':'')} style={{backgroundImage:`url("${location.image}")`}}><canvas className="arena-canvas" ref={canvas} aria-label={live?'Live 3D '+CHARACTERS[character].name:solo?CHARACTERS[character].name+' demonstrates '+instructorAction:'3D Raven and Vortex in '+location.name}/>{!loaded&&!error&&<span className="scene-loading">Loading your fighter…</span>}{error&&<div className="scene-error" role="alert">{error}</div>}<span className="render-label">{live?'LIVE BODY MOTION':solo?'FIGHTER DEMONSTRATION':location.name.toUpperCase()}</span></div>;
}
