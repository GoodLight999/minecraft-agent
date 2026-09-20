import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeJevClient } from '../src/models/typesafe-jev.mjs';
import { ExperientialJevClient } from '../src/models/experiential-jev.mjs';

const candidates = [
  {id:'follow_master',description:'Follow the master'},
  {id:'wait',description:'Wait'}
];
function valid() {
  return {
    model:'jev-latest',
    answers:{
      action:{type:'choice',choice:'follow_master',confidence:.8,probabilities:{follow_master:.8,wait:.2}},
      interrupt_now:{type:'noul',noul:.1},
      speech_value:{type:'noul',noul:.2},
      urgency:{type:'score',score:1.1,confidence:.5,legend:{0:'x',1:'y'},probabilities:{0:.4,1:.6}}
    }, usage:{input_tokens:10,output_tokens:0}
  };
}

test('TypeSafe direct and Experiential use the same normalized decision contract', async () => {
  const seen=[];
  const fetchImpl=async(url,init)=>{ seen.push({url,body:JSON.parse(init.body)}); return new Response(JSON.stringify(valid()),{status:200}); };
  const direct = new TypeSafeJevClient({apiKey:'ts',fetchImpl,retries:0});
  const exp = new ExperientialJevClient({apiKey:'xpl',fetchImpl});
  const a=await direct.decide({},candidates), b=await exp.decide({},candidates);
  assert.equal(a.action,'follow_master'); assert.equal(b.action,'follow_master');
  assert.equal(a.provider,'typesafe'); assert.equal(b.provider,'experiential');
  assert.equal(seen[0].url,'https://api.typesafe.ai/v1/systemone');
  assert.equal(seen[1].url,'https://api.experientiallabs.ai/v1/systemone');
  assert.deepEqual(Object.keys(seen[1].body.questions),['action','interrupt_now','speech_value','urgency']);
});

test('Experiential does not retry ambiguous failures by default', async () => {
  let calls=0;
  const client=new ExperientialJevClient({apiKey:'x',fetchImpl:async()=>{calls++; throw new TypeError('connection reset');}});
  await assert.rejects(()=>client.decide({},candidates),/connection reset/);
  assert.equal(calls,1);
});
