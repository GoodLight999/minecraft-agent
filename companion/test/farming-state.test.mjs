import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/core/skill-registry.mjs';
import { registerCompanionSkills } from '../src/skills/companion-skills.mjs';

test('farming skill becomes a concrete JEV candidate when a mature crop is observed', async () => {
  const registry = new SkillRegistry(); registerCompanionSkills(registry);
  const state = {
    nearbyBlocks:[{name:'wheat',mature:true,distance:2,position:{x:1,y:64,z:2}}],
    master:{visible:false}, threats:[], drops:[], inventory:[], inventoryCounts:{}, plan:{targets:{}}
  };
  const candidates = await registry.candidates(state, {});
  assert.ok(candidates.some(c=>c.id.startsWith('harvest_and_replant_crop__wheat_1_64_2')));
});
