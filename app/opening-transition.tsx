'use client';
import {useEffect,useState} from 'react';
const nodes=[[100,25],[100,50],[75,65],[125,65],[55,105],[145,105],[68,145],[132,145],[85,138],[115,138],[75,192],[125,192],[65,240],[140,240]];
export default function OpeningTransition(){
 const [visible,setVisible]=useState(true);
 useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches){setVisible(false);return;}const timer=setTimeout(()=>setVisible(false),2200);return()=>clearTimeout(timer);},[]);
 if(!visible)return null;
 return <div className="opening-transition mocap-intro" aria-label="Gesture Kombat opening"><div className="intro-orbit orbit-one"/><div className="intro-orbit orbit-two"/><div className="opening-flare"/><svg className="intro-skeleton" viewBox="0 0 200 270" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M100 25L100 50L75 65L55 105L68 145M100 50L125 65L145 105L132 145M75 65L85 138L115 138L125 65M85 138L75 192L65 240M115 138L125 192L140 240"/>{nodes.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i?3:13}/>)}</g></svg><div className="intro-scan"/><div className="opening-title"><span>MOTION CAPTURE · INITIALIZING</span><strong>GESTURE <em>KOMBAT</em></strong><small>MOVE BEYOND THE CONTROLLER</small><div className="intro-progress"><i/></div></div>{Array.from({length:12},(_,i)=><i key={i} className="intro-node" style={{left:(8+i*7.5)+'%',top:(20+(i*19)%67)+'%',animationDelay:(i*.045)+'s'}}/>)}<button onClick={()=>setVisible(false)}>Skip intro</button></div>;
}
