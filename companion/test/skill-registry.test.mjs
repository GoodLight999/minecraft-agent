import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/core/skill-registry.mjs';

test('exposes only skills whose guards are satisfied', async () => {
  const registry = new SkillRegistry()
    .register({id:'a',when:s=>s.ok,describe:()=> 'A',run:async()=>1})
    .register({id:'b',when:()=>false,describe:()=> 'B',run:async()=>2});
  const candidates = await registry.candidates({ok:true},{});
  assert.deepEqual(candidates.map(x=>x.id), ['a']);
  assert.equal(await candidates[0].run(), 1);
});
