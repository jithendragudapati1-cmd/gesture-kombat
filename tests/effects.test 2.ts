import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createPowerEffects} from '../lib/power-effects.ts';
test('fire and combo render visible moving geometry; lightning waits for telegraph',()=>{
 const scene=new T.Scene(),effect=createPowerEffects(scene),group=scene.children[0];
 assert.equal(group.visible,false);
 const input={action:'FIRE BLAST',age:300,time:1,origin:40,direction:1,target:70,active:true,solo:false};
 effect.update(input);assert.ok(group.visible);const orb=group.children[0];assert.ok(orb.visible);const x=orb.position.x;
 effect.update({...input,age:650});assert.ok(orb.position.x>x);
 effect.update({...input,action:'COMBO ENERGY'});assert.ok(orb.visible);
 effect.update({...input,action:'LIGHTNING',age:100});assert.equal(group.children[2].visible,false);assert.equal(group.children[5].visible,true);
 effect.update({...input,action:'LIGHTNING',age:500});assert.equal(group.children[2].visible,true);
 effect.update({...input,age:2000});assert.equal(group.visible,false);
});
