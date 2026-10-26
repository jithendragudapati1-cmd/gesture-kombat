import test from 'node:test';import assert from 'node:assert/strict';
import {fighter,makeRoom,joinRoom,applyAttack,resolveHits,advance,input,MAX_HP} from '../lib/combat.ts';
const now=10000;
function duel(){const r=makeRoom('r','ABC123','friend','one','One',now);joinRoom(r,'two','Two',now);r.start=now;r.fighters[0].x=40;r.fighters[1].x=50;return r;}
test('new fighters start with 250 HP',()=>assert.equal(fighter('One',40,now).hp,250));
test('melee starts without damage and applies once on contact after windup',()=>{const r=duel();applyAttack(r,0,'PUNCH',now);assert.equal(r.fighters[1].hp,MAX_HP);resolveHits(r,now+200);assert.equal(r.fighters[1].hp,MAX_HP-6);resolveHits(r,now+400);assert.equal(r.fighters[1].hp,MAX_HP-6);});
test('moving away before a strike or crossing behind the attacker avoids damage',()=>{for(const x of [70,30]){const r=duel();applyAttack(r,0,'PUNCH',now);r.fighters[1].x=x;resolveHits(r,now+200);assert.equal(r.fighters[1].hp,MAX_HP);}});
test('projectile only damages when its swept path reaches the opponent',()=>{const r=duel();r.fighters[1].x=70;applyAttack(r,0,'FIRE BLAST',now);resolveHits(r,now+250);assert.equal(r.fighters[1].hp,MAX_HP);resolveHits(r,now+650);assert.equal(r.fighters[1].hp,MAX_HP-15);});
test('crouching below a projectile avoids contact damage',()=>{const r=duel();applyAttack(r,0,'FIRE BLAST',now);r.fighters[1].actions=['BEND'];resolveHits(r,now+500);assert.equal(r.fighters[1].hp,MAX_HP);});
test('lightning telegraphs a position and misses when target moves away',()=>{const r=duel();applyAttack(r,0,'LIGHTNING',now);r.fighters[1].x=65;resolveHits(r,now+450);assert.equal(r.fighters[1].hp,MAX_HP);});

test('depth movement changes 3D position and lets a target sidestep a projectile',()=>{const r=duel();input(r,'two',['MOVE FORWARD'],1,now);advance(r,now+400);assert.ok((r.fighters[1].z??0)>0);applyAttack(r,0,'FIRE BLAST',now+400);resolveHits(r,now+1000);assert.equal(r.fighters[1].hp,MAX_HP);});
test('turning away prevents a melee attack hitting an opponent behind the fist',()=>{const r=duel();r.fighters[0].yaw=Math.PI;applyAttack(r,0,'PUNCH',now);resolveHits(r,now+300);assert.equal(r.fighters[1].hp,MAX_HP);});
