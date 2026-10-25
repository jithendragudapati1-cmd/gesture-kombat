import assert from 'node:assert/strict';
const base=process.env.ARENA_URL||'http://127.0.0.1:5173';
const p1=crypto.randomUUID(),p2=crypto.randomUUID(),p3=crypto.randomUUID();
async function api(token,payload,ok=true){const r=await fetch(base+'/api/arena',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,name:token===p1?'Test Ember':'Test Frost',character:token===p1?'vortex':'raven',...payload})});const b=await r.json();if(ok)assert.ok(r.ok,JSON.stringify(b));return b;}
try{
 const a=await api(p1,{op:'create',mode:'friend',arena:'neon-city'});assert.equal(a.room.status,'waiting');assert.equal(a.room.arena,'neon-city');assert.equal(a.room.code.length,6);assert.equal(a.room.fighters[0].character,'vortex');
 const b=await api(p2,{op:'join',code:a.room.code});assert.equal(b.room.status,'playing');assert.equal(b.room.arena,'neon-city');assert.equal(b.room.side,1);assert.equal(b.room.fighters[1].character,'raven');
 const denied=await api(p3,{op:'input',roomId:a.room.id,seq:1,actions:['FIRE BLAST']},false);assert.match(denied.error,/not a player/);
 const full=await api(p3,{op:'join',code:a.room.code},false);assert.match(full.error,/full|started/);
 const synced=await api(p1,{op:'input',roomId:a.room.id,seq:1,actions:[]});assert.equal(synced.room.fighters[1].name,'Test Frost');
 await api(p1,{op:'leave'});const won=await api(p2,{op:'input',roomId:a.room.id,seq:1,actions:[]});assert.equal(won.room.winner,1);
 await api(p2,{op:'leave'});
 const [q1,q2]=await Promise.all([api(p1,{op:'queue',arena:'sky-temple'}),api(p2,{op:'queue',arena:'moon-citadel'})]);
 const m1=await api(p1,{op:'queue'}),m2=await api(p2,{op:'queue'});assert.equal(m1.room.id,m2.room.id);assert.equal(m1.room.arena,m2.room.arena);assert.ok(['sky-temple','moon-citadel'].includes(m1.room.arena));assert.equal(m1.room.mode,'random');assert.equal(m1.room.fighters.length,2);assert.equal(m1.room.fighters[m1.room.side].character,'vortex');assert.equal(m2.room.fighters[m2.room.side].character,'raven');
 await api(p1,{op:'leave'});await api(p2,{op:'leave'});
 const ai=await api(p1,{op:'create',mode:'ai',difficulty:'easy',arena:'sky-temple'});assert.equal(ai.room.fighters[1].name,'Training AI');assert.equal(ai.room.arena,'sky-temple');assert.equal(ai.room.status,'playing');
 console.log('PASS: friend create/join, room capacity, player authorization, shared state, forfeit, concurrent random queue, AI match.');
}finally{await Promise.allSettled([api(p1,{op:'leave'}),api(p2,{op:'leave'}),api(p3,{op:'leave'})]);}
