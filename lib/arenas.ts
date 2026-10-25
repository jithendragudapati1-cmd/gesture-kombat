export const ARENAS={
 'sky-temple':{id:'sky-temple',name:'Sky Temple',subtitle:'Sunset above the clouds',image:'/arenas/sky-temple.png',key:0xffdfba,fill:0x96bfff},
 'moon-citadel':{id:'moon-citadel',name:'Moon Citadel',subtitle:'Fire and ice beneath the moon',image:'/arenas/moon-citadel.png',key:0xc8dfff,fill:0x977fc2},
 'neon-city':{id:'neon-city',name:'Neon City',subtitle:'Storm over the skyline',image:'/arenas/neon-city.png',key:0xb1d9ff,fill:0xe295d2},
} as const;
export type ArenaId=keyof typeof ARENAS;
export function arenaId(value:unknown):ArenaId{return value==='sky-temple'||value==='neon-city'?value:'moon-citadel';}
