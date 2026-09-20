import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../src/runtime/state.mjs';

const point = (x,y,z) => ({
  x,y,z,
  distanceTo(other) { return Math.hypot(x-other.x, y-other.y, z-other.z); }
});

test('observes semantically useful blocks plus arbitrary plan targets instead of nearest noise', () => {
  const blocks = [
    { name:'stone', position:point(1,64,0), getProperties:()=>({}) },
    { name:'wheat', position:point(2,64,0), getProperties:()=>({age:7}) },
    { name:'modded_machine', position:point(3,64,0), getProperties:()=>({}) }
  ];
  const byX = new Map(blocks.map(b => [b.position.x, b]));
  const bot = {
    entity:{position:point(0,64,0)},
    game:{dimension:'overworld'},
    health:20, food:20, heldItem:null, players:{}, entities:{},
    inventory:{items:()=>[]},
    findBlocks({matching}) { return blocks.filter(matching).map(b=>b.position); },
    blockAt(p) { return byX.get(p.x) ?? null; }
  };
  const state = snapshot(bot, {plan:{targets:{modded_machine:1}}});
  assert.deepEqual(state.nearbyBlocks.map(b=>b.name).sort(), ['modded_machine','wheat']);
  assert.equal(state.nearbyBlocks.find(b=>b.name==='wheat').mature, true);
});
