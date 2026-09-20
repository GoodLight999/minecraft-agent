import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/core/skill-registry.mjs';
import { ActionManager } from '../src/core/action-manager.mjs';
import { JevLoop } from '../src/core/jev-loop.mjs';

test('uses a lightweight freshness snapshot after the backend decision', async () => {
  let full=0, fresh=0, ran=0;
  const registry=new SkillRegistry().register({id:'wait',describe:()=> 'wait',run:async()=>{ran++;}});
  const before={capturedAt:Date.now(),dimension:'overworld',position:{x:0,y:64,z:0},nearbyBlocks:['expensive']};
  const loop=new JevLoop({
    getState:async()=>{full++; return {...before,capturedAt:Date.now()};},
    getFreshState:async()=>{fresh++; return {capturedAt:Date.now(),dimension:'overworld',position:{x:0,y:64,z:0}};},
    registry,context:{},jev:{decide:async()=>({action:'wait'})},actions:new ActionManager()
  });
  await loop.step();
  assert.equal(full,1);
  assert.equal(fresh,1);
  assert.equal(ran,1);
});
