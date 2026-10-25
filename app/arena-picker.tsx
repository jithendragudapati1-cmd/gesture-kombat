'use client';
import {ARENAS,type ArenaId} from '../lib/arenas';
export default function ArenaPicker({value,onChange,disabled=false}:{value:ArenaId;onChange:(id:ArenaId)=>void;disabled?:boolean}){
 return <fieldset className="arena-picker" disabled={disabled}><legend>CHOOSE YOUR ARENA</legend><div>{Object.values(ARENAS).map(a=><button type="button" key={a.id} aria-pressed={value===a.id} className={value===a.id?'arena-option selected':'arena-option'} onClick={()=>onChange(a.id)}><img src={a.image} alt="" loading="lazy"/><span>{a.name}</span><small>{a.subtitle}</small>{value===a.id&&<b aria-label="Selected">✓</b>}</button>)}</div></fieldset>;
}
