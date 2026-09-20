import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncDirector } from '../src/runtime/async-director.mjs';

test('periodic planning never multiplies concurrent requests', async () => {
  let resolvePlan;
  let calls=0;
  const director={plan:async()=>{calls++; return await new Promise(r=>{resolvePlan=r;});}};
  const runtime=new AsyncDirector({director,getState:()=>({}),initialPlan:{objective:'initial'}});
  const a=runtime.request('periodic');
  const b=runtime.request('periodic');
  assert.equal(a,b);
  assert.equal(calls,1);
  resolvePlan({plan:{objective:'next'}});
  await a;
  assert.equal(runtime.plan.objective,'next');
});

test('a master message force-aborts stale planning and owns the next plan', async () => {
  const calls=[];
  const director={
    plan:(_state,{reason,userMessage,signal})=>new Promise((resolve,reject)=>{
      const call={reason,userMessage,signal,resolve}; calls.push(call);
      signal.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e);},{once:true});
    })
  };
  const runtime=new AsyncDirector({director,getState:()=>({}),initialPlan:{objective:'initial'}});
  const old=runtime.request('periodic');
  await Promise.resolve();
  const fresh=runtime.request('master-message',{userMessage:'畑やろう',force:true});
  await Promise.resolve();
  assert.equal(calls[0].signal.aborted,true);
  assert.equal(calls[1].userMessage,'畑やろう');
  calls[1].resolve({plan:{objective:'farm together'}});
  await fresh;
  await old;
  assert.equal(runtime.plan.objective,'farm together');
});
