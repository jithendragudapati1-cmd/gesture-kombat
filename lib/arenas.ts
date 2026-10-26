export const ARENAS={
 'sky-temple':{id:'sky-temple',name:'Cloud Pavilion',subtitle:'Quiet sky · soft daylight',image:'/arenas/cloud-pavilion.svg',key:0xffdfba,fill:0x96bfff},
 'moon-citadel':{id:'moon-citadel',name:'Pearl Dojo',subtitle:'Ivory stone · studio lighting',image:'/arenas/pearl-dojo.svg',key:0xc8dfff,fill:0x977fc2},
 'neon-city':{id:'neon-city',name:'Silver Orbit',subtitle:'Open space · cool silver',image:'/arenas/silver-orbit.svg',key:0xb1d9ff,fill:0xe295d2},
} as const;
export type ArenaId=keyof typeof ARENAS;
export function arenaId(value:unknown):ArenaId{return value==='sky-temple'||value==='neon-city'?value:'moon-citadel';}
