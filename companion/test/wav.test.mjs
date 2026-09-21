import test from 'node:test';
import assert from 'node:assert/strict';
import { pcm16MonoToWav } from '../src/voice/wav.mjs';

test('PCM16 WAV header is valid and preserves payload',()=>{
  const pcm=Buffer.from([1,2,3,4]);
  const wav=pcm16MonoToWav(pcm,{sampleRate:16000});
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  assert.equal(wav.toString('ascii',8,12),'WAVE');
  assert.equal(wav.readUInt32LE(24),16000);
  assert.equal(wav.readUInt32LE(40),4);
  assert.deepEqual(wav.subarray(44),pcm);
});
