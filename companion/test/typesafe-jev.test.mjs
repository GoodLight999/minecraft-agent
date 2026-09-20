import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeJevClient } from '../src/models/typesafe-jev.mjs';

const candidates = [
  {id:'follow_master',description:'Follow the master'},
  {id:'wait',description:'Wait'}
];

function validResponse(choice='follow_master') {
  return {
    model:'jev-latest',
    answers:{
      action:{type:'choice',choice,probabilities:{follow_master:.8,wait:.2},confidence:.8},
      interrupt_now:{type:'noul',noul:.1},
      speech_value:{type:'noul',noul:.25},
      urgency:{type:'score',score:1.1,legend:{0:'No urgency',1:'Routine action',2:'Important',3:'Immediate danger'},probabilities:{0:.1,1:.7,2:.2,3:0},confidence:.6}
    },
    usage:{input_tokens:123,output_tokens:10}
  };
}

test('builds one rich JEV request with action and parallel social/safety questions', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(init.headers.authorization, 'Bearer x');
    request = JSON.parse(init.body);
    return new Response(JSON.stringify(validResponse()), {status:200,headers:{'content-type':'application/json'}});
  };
  const client = new TypeSafeJevClient({apiKey:'x',fetchImpl});
  const result = await client.decide({master:{distance:9}}, candidates);
  assert.equal(result.action, 'follow_master');
  assert.equal(result.speechProbability, .25);
  assert.deepEqual(Object.keys(request.questions), ['action','interrupt_now','speech_value','urgency']);
  assert.equal(request.questions.action.criteria.follow_master, 'Follow the master');
});

test('fails closed for missing credentials and unknown actions', async () => {
  await assert.rejects(() => new TypeSafeJevClient({apiKey:''}).decide({}, candidates), /missing/);
  const client = new TypeSafeJevClient({apiKey:'x',fetchImpl:async()=>new Response(JSON.stringify(validResponse('destroy_world')),{status:200})});
  await assert.rejects(() => client.decide({}, candidates), /Invalid JEV Choice/);
});

test('rejects more than 255 JEV Choice candidates', async () => {
  const client = new TypeSafeJevClient({apiKey:'x',fetchImpl:async()=>{throw new Error('should not call');}});
  const tooMany = Array.from({length:256}, (_,i)=>({id:`a${i}`,description:'x'}));
  await assert.rejects(()=>client.decide({}, tooMany), /255/);
});
