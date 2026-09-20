import test from 'node:test';
import assert from 'node:assert/strict';
import { DialogueRuntime } from '../src/voice/dialogue-runtime.mjs';

const tick = () => new Promise(r => setTimeout(r, 0));

test('streams dialogue into sentence-level TTS queue', async () => {
  const spoken = [];
  const director = { async *streamDialogue(){ yield 'マスター、鉄が'; yield 'あります。'; yield '掘りますか？'; } };
  const speech = { enqueue:t=>spoken.push(t), interrupt:()=>{} };
  const runtime = new DialogueRuntime({director,speech,getState:()=>({}),getRecentDialogue:()=>[]});
  const reply = await runtime.respond('何かある？');
  assert.equal(reply, 'マスター、鉄があります。掘りますか？');
  assert.deepEqual(spoken, ['マスター、鉄があります。','掘りますか？']);
});

test('interrupt aborts model generation as well as queued speech', async () => {
  let signal;
  let speechInterrupts = 0;
  const director = { async *streamDialogue({signal:s}) {
    signal = s;
    yield '途中です。';
    await new Promise((resolve, reject) => {
      s.addEventListener('abort', () => { const e=new Error('aborted'); e.name='AbortError'; reject(e); }, {once:true});
    });
  }};
  const speech = { enqueue:()=>{}, interrupt:()=>speechInterrupts++ };
  const runtime = new DialogueRuntime({director,speech,getState:()=>({})});
  const pending = runtime.respond('話して');
  await tick();
  runtime.interrupt();
  assert.equal(signal.aborted, true);
  assert.equal(await pending, null);
  assert.ok(speechInterrupts >= 2);
});
