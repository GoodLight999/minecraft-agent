import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekDirector } from '../src/models/deepseek-director.mjs';

test('director uses deepseek-flash in explicit non-thinking JSON mode', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.headers.authorization, 'Bearer x');
    request = JSON.parse(init.body);
    return new Response(JSON.stringify({
      model:'deepseek-flash',
      choices:[{message:{content:JSON.stringify({objective:'Help the master mine',activity:'mining',targets:{},constraints:[],notes:'',social:{stayNearMaster:true,preferredDistance:6,maxDistance:14}})}}],
      usage:{prompt_tokens:10,completion_tokens:20}
    }), {status:200,headers:{'content-type':'application/json'}});
  };
  const director = new DeepSeekDirector({apiKey:'x',fetchImpl});
  const out = await director.plan({master:{distance:5}});
  assert.equal(out.plan.objective, 'Help the master mine');
  assert.equal(request.model, 'deepseek-flash');
  assert.deepEqual(request.thinking, {type:'disabled'});
  assert.deepEqual(request.response_format, {type:'json_object'});
});

test('director fails before network when the API key is missing', async () => {
  const director = new DeepSeekDirector({apiKey:'',fetchImpl:async()=>{throw new Error('network should not run');}});
  await assert.rejects(() => director.plan({}), /DEEPSEEK_API_KEY is missing/);
});
