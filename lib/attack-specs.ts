export const MAX_HP=250;
export const ATTACKS:Record<string,{damage:number;reach:number;cooldown:number;cost:number;windup:number;speed?:number;duration:number}>={
 PUNCH:{damage:6,reach:12,cooldown:550,cost:0,windup:180,duration:580},
 'DOUBLE PUNCH':{damage:11,reach:14,cooldown:850,cost:6,windup:220,duration:650},
 KICK:{damage:9,reach:18,cooldown:750,cost:3,windup:260,duration:750},
 'FIRE BLAST':{damage:15,reach:90,cooldown:2600,cost:25,windup:240,speed:78,duration:1450},
 LIGHTNING:{damage:12,reach:95,cooldown:3000,cost:25,windup:440,duration:850},
 'COMBO ENERGY':{damage:23,reach:90,cooldown:5500,cost:45,windup:300,speed:65,duration:1750}
};
export const attackAge=(action:string,now:number,at:number)=>Math.max(0,now-at-(ATTACKS[action]?.windup??0));
export const projectileX=(origin:number,direction:number,action:string,age:number)=>origin+direction*(ATTACKS[action]?.speed??0)*age/1000;
