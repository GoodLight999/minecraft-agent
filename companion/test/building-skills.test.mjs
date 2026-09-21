import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeBlueprint, normalizeBuildingPlan, registerBuildingSkills } from '../src/skills/building-skills.mjs';

class Registry {
  constructor(){ this.skills=[]; }
  register(skill){ this.skills.push(skill); }
}

const air = position => ({name:'air',boundingBox:'empty',position});
const solid = (name,position) => ({name,boundingBox:'block',position});

function ctxWith(blocks = new Map()) {
  const key=p=>`${p.x}_${p.y}_${p.z}`;
  const blockAt=p=>blocks.get(key(p)) ?? air(p);
  const supportAt=p=>blockAt({x:p.x,y:p.y-1,z:p.z}).boundingBox !== 'empty';
  return {blockAt,canPlaceBlockAt:supportAt};
}

test('wall blueprint rotates and materializes deterministically', () => {
  const state={plan:{building:{blueprint:'wall',material:'oak_planks',anchor:{x:10,y:64,z:20},facing:'east',width:3,height:2}}};
  const build=normalizeBuildingPlan(state);
  const cells=materializeBlueprint(build);
  assert.equal(cells.length,6);
  assert.ok(cells.some(c=>c.position.x===10 && c.position.y===65 && c.position.z===22));
});

test('building candidates expose only incomplete supported cells', async () => {
  const registry=new Registry(); registerBuildingSkills(registry);
  const skill=registry.skills[0];
  const state={
    position:{x:0,y:64,z:0},
    inventoryCounts:{oak_planks:20},
    plan:{building:{blueprint:'wall',material:'oak_planks',anchor:{x:2,y:64,z:2},facing:'north',width:3,height:2}}
  };
  const blocks=new Map();
  for(let x=2;x<=4;x++) blocks.set(`${x}_63_2`,solid('stone',{x,y:63,z:2}));
  blocks.set('2_64_2',solid('oak_planks',{x:2,y:64,z:2}));
  blocks.set('3_64_2',solid('stone',{x:3,y:64,z:2}));
  const ctx=ctxWith(blocks);
  assert.equal(await skill.when(state,ctx),true);
  const variants=await skill.expand(state,ctx);
  assert.deepEqual(variants.map(v=>v.params.cell.position),[{x:2,y:65,z:2},{x:4,y:64,z:2}]);
  assert.ok(!variants.some(v=>v.params.cell.position.x===3 && v.params.cell.position.y===65));
});

test('frame blueprint de-duplicates corners and edges', () => {
  const build={blueprint:'frame',material:'stone',anchor:{x:0,y:0,z:0},facing:'north',width:3,depth:3,height:3};
  const cells=materializeBlueprint(build);
  assert.equal(new Set(cells.map(c=>`${c.position.x}_${c.position.y}_${c.position.z}`)).size,cells.length);
  assert.equal(cells.length,20);
});
