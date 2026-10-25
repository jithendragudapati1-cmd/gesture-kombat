export type CharacterId='raven'|'vortex';
export const CHARACTERS={
 raven:{id:'raven' as const,name:'Raven',tagline:'Speed · Precision · Shadow',color:'#47caff',secondary:'#153d7b',portrait:'/fighters/raven-portrait.webp',atlas:'/fighters/raven-atlas.webp'},
 vortex:{id:'vortex' as const,name:'Vortex',tagline:'Power · Destruction · Fire',color:'#ff374c',secondary:'#6c112b',portrait:'/fighters/vortex-portrait.webp',atlas:'/fighters/vortex-atlas.webp'},
};
export function characterId(value:unknown,fallback:CharacterId='raven'):CharacterId{return value==='raven'||value==='vortex'?value:fallback;}
export function characterFor(fighter:{character?:CharacterId},side=0){return CHARACTERS[characterId(fighter.character,side===0?'raven':'vortex')];}
export function opponentCharacter(id:CharacterId):CharacterId{return id==='raven'?'vortex':'raven';}
