import test from 'node:test';
import assert from 'node:assert/strict';
import { DecisionRouter, experientialFreeTierFallback } from '../src/models/decision-router.mjs';

const candidates = [
  {id:'follow_master',description:'Follow'},
  {id:'wait',description:'Wait'}
];

test('falls through from Experiential free-tier quota to TypeSafe and cools down the exhausted lane', async () => {
  let expCalls = 0, directCalls = 0, now = 1000;
  const quota = new Error('experiential HTTP 402: free_limit_reached: hourly token allowance spent');
  quota.code = 'insufficient_quota'; quota.providerMessage = 'free_limit_reached: hourly token allowance spent';
  const router = new DecisionRouter({
    now:()=>now,
    fallbackCooldownMs:300_000,
    providers:[
      {id:'experiential',client:{decide:async()=>{expCalls++; throw quota;}},fallbackOn:experientialFreeTierFallback},
      {id:'typesafe',client:{decide:async()=>{directCalls++; return {action:'follow_master',confidence:.8};}}}
    ]
  });
  const first = await router.decide({}, candidates);
  assert.equal(first.action, 'follow_master');
  assert.equal(first.provider, 'typesafe');
  assert.equal(expCalls, 1); assert.equal(directCalls, 1);
  const second = await router.decide({}, candidates);
  assert.equal(second.provider, 'typesafe');
  assert.equal(expCalls, 1); assert.equal(directCalls, 2);
});

test('does not automatically fall through on ambiguous transport failure', async () => {
  const timeout = new Error('timed out'); timeout.name = 'AbortError';
  let directCalls = 0;
  const router = new DecisionRouter({providers:[
    {id:'experiential',client:{decide:async()=>{throw timeout;}},fallbackOn:experientialFreeTierFallback},
    {id:'typesafe',client:{decide:async()=>{directCalls++; return {action:'wait'};}}}
  ]});
  await assert.rejects(()=>router.decide({}, candidates), /timed out/);
  assert.equal(directCalls, 0);
});

test('router validates the minimum backend contract even for future non-System-One providers', async () => {
  const router = new DecisionRouter({providers:[{id:'future-fast-decision-model',client:{decide:async()=>({action:'invented_action'})}}]});
  await assert.rejects(()=>router.decide({}, candidates), /unknown action/);
});
