'use client';
import {useEffect,useState} from 'react';
export default function OpeningTransition(){
 const [visible,setVisible]=useState(true);
 useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches){setVisible(false);return;}const timer=setTimeout(()=>setVisible(false),1350);return()=>clearTimeout(timer);},[]);
 if(!visible)return null;
 return <div className="opening-transition" aria-label="Gesture Kombat opening"><div className="opening-flare"/><div className="opening-title"><span>THE NEON RIFT</span><strong>GESTURE <em>KOMBAT</em></strong><small>YOUR BODY. YOUR BATTLEGROUND.</small></div><button onClick={()=>setVisible(false)}>Skip intro</button></div>;
}
