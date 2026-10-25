'use client';
import Arena3D from './arena-3d';
import {CHARACTERS,type CharacterId} from '../lib/characters';
import type {ArenaId} from '../lib/arenas';
export default function MovePreview({action,character,arena}:{action:string;character:CharacterId;arena:ArenaId}){
 return <div className="move-preview fighter-preview"><Arena3D instructorAction={action} character={character} arena={arena}/><span>{CHARACTERS[character].name.toUpperCase()} · {action}</span></div>;
}
