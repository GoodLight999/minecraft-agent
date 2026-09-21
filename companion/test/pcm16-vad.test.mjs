import test from 'node:test';
import assert from 'node:assert/strict';
import { Pcm16VadSegmenter } from '../src/voice/pcm16-vad.mjs';

function frame(amplitude,samples=320){
  const out=Buffer.alloc(samples*2);
  for(let i=0;i<samples;i++) out.writeInt16LE(Math.round(amplitude*32767),i*2);
  return out;
}

test('VAD emits immediate speech-start and a bounded segment after silence',()=>{
  const vad=new Pcm16VadSegmenter({startFrames:2,endFrames:3,prerollFrames:2,minSpeechMs:40,minStartRms:0.02,minEndRms:0.01});
  const events=[];
  for(let i=0;i<4;i++) events.push(...vad.push(frame(0.001)));
  events.push(...vad.push(frame(0.2)));
  events.push(...vad.push(frame(0.2)));
  events.push(...vad.push(frame(0.2)));
  events.push(...vad.push(frame(0.001)));
  events.push(...vad.push(frame(0.001)));
  events.push(...vad.push(frame(0.001)));
  assert.equal(events.filter(e=>e.type==='speech-start').length,1);
  const segment=events.find(e=>e.type==='segment');
  assert.ok(segment);
  assert.ok(segment.audio.length>0);
  assert.equal(segment.reason,'silence');
});
