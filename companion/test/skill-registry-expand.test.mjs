import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/core/skill-registry.mjs';

test('expands one skill into concrete parameterized JEV candidates', async () => {
  const seen = [];
  const registry = new SkillRegistry().register({
    id:'mine_ore',
    expand:()=>[
      {id:'iron_1_64_2',params:{name:'iron_ore',x:1,y:64,z:2}},
      {id:'coal_-3_63_1',params:{name:'coal_ore',x:-3,y:63,z:1}}
    ],
    describe:(_state,_ctx,v)=>`Mine ${v.params.name} at ${v.params.x},${v.params.y},${v.params.z}`,
    run:async(_state,_ctx,v)=>{seen.push(v.params.name); return v.params.name;}
  });
  const candidates = await registry.candidates({},{});
  assert.deepEqual(candidates.map(c=>c.id), ['mine_ore__iron_1_64_2','mine_ore__coal_-3_63_1']);
  assert.match(candidates[1].description,/coal_ore/);
  assert.equal(await candidates[0].run(),'iron_ore');
  assert.deepEqual(seen,['iron_ore']);
});

test('rejects duplicate expanded candidate ids before they reach a decision backend', async () => {
  const registry = new SkillRegistry().register({
    id:'x',
    expand:()=>[{id:'same'},{id:'same'}],
    describe:()=> 'x',
    run:async()=>{}
  });
  await assert.rejects(()=>registry.candidates({},{}),/duplicate candidate id/);
});
