import test from 'node:test';
import assert from 'node:assert/strict';
import { IrodoriClient } from '../src/voice/irodori-client.mjs';

test('Irodori request uses short-utterance mode and optional caption conditioning', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8088/v1/audio/speech');
    request = JSON.parse(init.body);
    return new Response(new Uint8Array([1,2,3]), {status:200});
  };
  const client = new IrodoriClient({voice:'alice',caption:'明るく自然な話し方',fetchImpl});
  const audio = await client.synthesize('こんにちは。');
  assert.equal(audio.length, 3);
  assert.equal(request.model, 'irodori-tts');
  assert.equal(request.voice, 'alice');
  assert.equal(request.irodori.chunking_enabled, false);
  assert.equal(request.irodori.caption, '明るく自然な話し方');
});
