import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleSttClient } from '../src/voice/openai-stt-client.mjs';

test('OpenAI-compatible STT posts multipart audio and returns trimmed text',async()=>{
  let seen;
  const client=new OpenAICompatibleSttClient({
    baseUrl:'http://stt.local',apiKey:'test-key',model:'whisper-test',language:'ja',
    fetchImpl:async(url,init)=>{seen={url,init};return {ok:true,json:async()=>({text:'  こんにちは  '})};}
  });
  const text=await client.transcribe(Buffer.from('RIFFfake'));
  assert.equal(text,'こんにちは');
  assert.equal(seen.url,'http://stt.local/v1/audio/transcriptions');
  assert.equal(seen.init.headers.authorization,'Bearer test-key');
  assert.equal(seen.init.body.get('model'),'whisper-test');
  assert.equal(seen.init.body.get('language'),'ja');
});
