import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechQueue } from '../src/voice/speech-queue.mjs';

const tick = () => new Promise(r => setTimeout(r, 0));

test('interrupt aborts the currently playing utterance and clears queued speech', async () => {
  const synthesized = [];
  let playingSignal;
  let release;
  const tts = { synthesize:async text => { synthesized.push(text); return Buffer.from(text); } };
  const play = (_audio, {signal}) => new Promise((resolve, reject) => {
    playingSignal = signal;
    release = resolve;
    signal.addEventListener('abort', () => {
      const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
    }, {once:true});
  });
  const q = new SpeechQueue({tts,play});
  q.enqueue('one');
  q.enqueue('two');
  await tick();
  assert.equal(playingSignal?.aborted, false);
  q.interrupt();
  await tick();
  assert.equal(playingSignal.aborted, true);
  assert.deepEqual(synthesized, ['one','two']);
  release?.();
});

test('limits synthesis prefetch while keeping the next utterance warm', async () => {
  const synthesized = [];
  const releases = [];
  const tts = { synthesize:async text => { synthesized.push(text); return Buffer.from(text); } };
  const play = () => new Promise(resolve => releases.push(resolve));
  const q = new SpeechQueue({tts,play,prefetch:2});
  q.enqueue('one'); q.enqueue('two'); q.enqueue('three');
  await tick();
  assert.deepEqual(synthesized, ['one','two']);
  releases.shift()();
  await tick();
  assert.deepEqual(synthesized, ['one','two','three']);
  q.interrupt();
});
