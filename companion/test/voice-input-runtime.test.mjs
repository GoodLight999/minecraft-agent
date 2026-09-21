import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInputRuntime } from '../src/voice/voice-input-runtime.mjs';

class FakeVad {
  push(chunk){ return chunk.toString()==='start'?[{type:'speech-start'}]:chunk.toString()==='segment'?[{type:'segment',audio:Buffer.alloc(320),durationMs:10}]:[]; }
  flush(){ return []; }
}

test('voice input barges in before transcription and forwards finished text',async()=>{
  const order=[];
  const runtime=new VoiceInputRuntime({
    vad:new FakeVad(),
    stt:{transcribe:async()=>{order.push('stt');return 'こんにちは';}},
    onSpeechStart:()=>order.push('barge-in'),
    onTranscript:async text=>order.push(`text:${text}`)
  });
  runtime.pushPcm(Buffer.from('start'));
  runtime.pushPcm(Buffer.from('segment'));
  await runtime.drain();
  assert.deepEqual(order,['barge-in','stt','text:こんにちは']);
});

test('new speech invalidates an older queued segment',async()=>{
  let calls=0;
  const runtime=new VoiceInputRuntime({
    vad:new FakeVad(),
    stt:{transcribe:async()=>{calls++;return 'old';}}
  });
  runtime.pushPcm(Buffer.from('segment'));
  runtime.pushPcm(Buffer.from('start'));
  await runtime.drain();
  assert.equal(calls,0);
});
