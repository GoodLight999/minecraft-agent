import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/core/skill-registry.mjs';
import { registerWorkSkills } from '../src/skills/work-skills.mjs';

test('storage, crafting, smelting and ranching expose concrete safe candidates', async () => {
  const registry=new SkillRegistry();
  registerWorkSkills(registry);
  const state={
    activity:'storage ranching smelting',
    master:{visible:true,distance:4},
    inventory:[
      {name:'raw_iron',count:6,slot:1},
      {name:'coal',count:4,slot:2},
      {name:'wheat',count:8,slot:3},
      {name:'dirt',count:48,slot:4}
    ],
    inventoryCounts:{raw_iron:6,coal:4,wheat:8,dirt:48,iron_ingot:0,stick:0},
    inventorySlotsFree:2,
    nearbyBlocks:[
      {name:'chest',distance:3,position:{x:1,y:64,z:0}},
      {name:'furnace',distance:4,position:{x:2,y:64,z:0}},
      {name:'blast_furnace',distance:5,position:{x:3,y:64,z:0}},
      {name:'smoker',distance:6,position:{x:4,y:64,z:0}},
      {name:'crafting_table',distance:3,position:{x:0,y:64,z:2}}
    ],
    animals:[{entityId:20,name:'cow',distance:3,position:{x:1,y:64,z:1}}],
    plan:{
      activity:'ranching',
      objective:'organize storage, breed animals, craft sticks and smelt iron',
      targets:{iron_ingot:4,stick:4}
    }
  };
  const ctx={
    findCraftRecipe:name=>name==='stick'?{item:{name:'stick'},recipe:{result:{count:4}},table:null}:null,
    onCooldown:()=>false
  };
  const candidates=await registry.candidates(state,ctx);
  const ids=candidates.map(c=>c.id);

  assert.ok(ids.includes('craft_plan_target__stick'));
  assert.ok(ids.some(id=>id.startsWith('load_furnace_for_plan__iron_ingot_raw_iron_furnace_')));
  assert.ok(ids.some(id=>id.startsWith('load_furnace_for_plan__iron_ingot_raw_iron_blast_furnace_')));
  assert.ok(!ids.some(id=>id.includes('iron_ingot_raw_iron_smoker_')));
  assert.ok(ids.some(id=>id.startsWith('feed_ranch_animal__cow_20_wheat')));
  assert.ok(ids.some(id=>id.startsWith('withdraw_plan_targets__chest_')));

  const deposits=candidates.filter(c=>c.skillId==='deposit_bulk_item');
  assert.ok(deposits.some(c=>c.params.itemName==='dirt'));
  assert.ok(!deposits.some(c=>c.params.itemName==='raw_iron'));
  assert.ok(!deposits.some(c=>c.params.itemName==='coal'));
});

test('ranching candidates respect interaction cooldowns', async () => {
  const registry=new SkillRegistry(); registerWorkSkills(registry);
  const state={
    activity:'ranching',
    inventory:[{name:'wheat',count:3}],
    inventoryCounts:{wheat:3},
    inventorySlotsFree:30,
    nearbyBlocks:[],
    animals:[{entityId:20,name:'cow',distance:3,position:{x:1,y:64,z:1}}],
    plan:{targets:{},objective:'breed cows'}
  };
  const candidates=await registry.candidates(state,{findCraftRecipe:()=>null,onCooldown:key=>key==='animal:20'});
  assert.ok(!candidates.some(c=>c.skillId==='feed_ranch_animal'));
});
