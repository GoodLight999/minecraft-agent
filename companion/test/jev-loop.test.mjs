import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/core/skill-registry.mjs';
import { ActionManager } from '../src/core/action-manager.mjs';
import { JevLoop } from '../src/core/jev-loop.mjs';

test('keeps rmalde-style state -> candidates -> JEV -> bounded action loop', async () => {
  let ran = 0;
  const registry = new SkillRegistry().register({id:'work',describe:()=> 'Do useful work',run:async()=>{ran++; return 'ok';}});
  const state = {capturedAt:Date.now(),dimension:'overworld',position:{x:0,y:64,z:0}};
  const loop = new JevLoop({
    getState:async()=>({...state,capturedAt:Date.now()}), registry, context:{},
    jev:{decide:async()=>({action:'work',confidence:.9})},
    actions:new ActionManager(),
    onDecision:()=>{},onResult:()=>{}
  });
  const out = await loop.step();
  assert.equal(out.result.ok, true);
  assert.equal(ran, 1);
});
