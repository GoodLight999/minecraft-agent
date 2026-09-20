import test from 'node:test';
import assert from 'node:assert/strict';
import { SentenceChunker } from '../src/voice/sentence-chunker.mjs';

test('emits Japanese sentence chunks before full response completes', () => {
  const c = new SentenceChunker();
  assert.deepEqual(c.push('マスター、鉄が'), []);
  assert.deepEqual(c.push('ありました。次は'), ['マスター、鉄がありました。']);
  assert.deepEqual(c.push('どうします？'), ['次はどうします？']);
  assert.deepEqual(c.flush(), []);
});
