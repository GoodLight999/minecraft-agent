import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/core/skill-registry.mjs';
import { registerCompanionSkills } from '../src/skills/companion-skills.mjs';

test('ordinary-play skills expose concrete world targets to the decision model', async () => {
  const registry = new SkillRegistry();
  registerCompanionSkills(registry);
  const state = {
    master:{visible:true,distance:3,entityId:10},
    threats:[
      {entityId:21,name:'zombie',distance:5,distanceToMaster:2},
      {entityId:22,name:'skeleton',distance:7,distanceToMaster:4}
    ],
    drops:[
      {entityId:31,name:'iron_ingot',distance:4,position:{x:1,y:64,z:2}},
      {entityId:32,name:'wheat_seeds',distance:5,position:{x:2,y:64,z:2}}
    ],
    nearbyBlocks:[
      {name:'iron_ore',distance:3,position:{x:4,y:63,z:0}},
      {name:'coal_ore',distance:6,position:{x:5,y:62,z:1}},
      {name:'wheat',distance:2,mature:true,position:{x:1,y:64,z:4}}
    ],
    inventory:[
      {name:'torch',count:16,slot:2},
      {name:'bread',count:4,slot:3}
    ],
    inventoryCounts:{torch:16,bread:4},
    plan:{targets:{iron_ore:2},social:{preferredDistance:5,maxDistance:14}}
  };
  const candidates = await registry.candidates(state,{});
  const ids = candidates.map(c=>c.id);
  assert.ok(ids.some(id=>id.startsWith('protect_master__zombie_21')));
  assert.ok(ids.some(id=>id.startsWith('protect_master__skeleton_22')));
  assert.ok(ids.some(id=>id.startsWith('collect_nearby_drop__iron_ingot_31')));
  assert.ok(ids.some(id=>id.startsWith('mine_nearby_ore__iron_ore_4_63_0')));
  assert.ok(ids.some(id=>id.startsWith('harvest_and_replant_crop__wheat_1_64_4')));
  assert.ok(ids.includes('give_useful_item_to_master__torch'));
  assert.ok(ids.includes('give_useful_item_to_master__bread'));
  assert.ok(ids.some(id=>id.startsWith('mine_plan_target__iron_ore_4_63_0')));
});

test('follow and catch-up are short-segment candidates rather than long jobs', async () => {
  const registry = new SkillRegistry();
  registerCompanionSkills(registry);
  const state={
    master:{visible:true,distance:20,entityId:10},
    threats:[],drops:[],nearbyBlocks:[],inventory:[],inventoryCounts:{},
    plan:{targets:{},social:{preferredDistance:5,maxDistance:14}}
  };
  const candidates=await registry.candidates(state,{});
  assert.ok(candidates.some(c=>c.id==='follow_master'));
  assert.ok(candidates.some(c=>c.id==='catch_up_to_master'));
  assert.match(candidates.find(c=>c.id==='follow_master').description,/short movement segment/);
});
