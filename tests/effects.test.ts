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

test('punch uses hand streaks without circles, and enlarged lightning has branches',()=>{
 const scene=new T.Scene(),effect=createPowerEffects(scene),g=scene.children[0];
 const hands:[T.Vector3,T.Vector3]=[new T.Vector3(1,2,.3),new T.Vector3(-1,2,.2)];
 const input={action:'PUNCH',age:200,time:1,origin:40,direction:1,target:70,active:true,solo:true,hands};
 effect.update(input);assert.equal(g.children[4].visible,false);assert.equal(g.children[1].visible,false);assert.equal(g.children[6].visible,true);
 effect.update({...input,action:'LIGHTNING',age:500});assert.equal(g.children[2].children.length,2);assert.ok((g.children[2] as T.Line).geometry.getAttribute('position').getY(0)>6);
});
test('fire launches at hands and its flight does not drag with the caster',()=>{
 const scene=new T.Scene(),effect=createPowerEffects(scene),g=scene.children[0];
 const input={action:'FIRE BLAST',age:300,time:1,origin:40,direction:1,target:70,active:true,solo:true,hands:[new T.Vector3(0,2,0),new T.Vector3(0,2,0)] as [T.Vector3,T.Vector3]};
 effect.update(input);assert.equal(g.children[0].position.y,2);
 effect.update({...input,age:500,hands:[new T.Vector3(5,2,0),new T.Vector3(5,2,0)]});assert.equal(g.children[0].position.x,0);
});
