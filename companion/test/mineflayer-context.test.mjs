import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { createMineflayerContext } from '../src/runtime/mineflayer-context.mjs';

class GoalNear { constructor(x,y,z,range){ Object.assign(this,{x,y,z,range}); } }
class GoalFollow { constructor(entity,range){ Object.assign(this,{entity,range}); } }

function point(x,y,z) { return new Vec3(x,y,z); }

test('movement helpers always return control after a bounded number of ticks', async () => {
  let waits = 0;
  const goalsSeen = [];
  const bot = {
    entity:{position:point(0,64,0)},
    players:{},
    inventory:{items:()=>[]},
    pathfinder:{
      setGoal:g=>goalsSeen.push(g),
      bestHarvestTool:()=>null
    },
    clearControlStates:()=>{},
    stopDigging:()=>{},
    waitForTicks:async ticks=>{waits += ticks;},
    blockAt:()=>null
  };
  const ctx = createMineflayerContext(bot,{goals:{GoalNear,GoalFollow}});
  const reached = await ctx.moveNearSegment(point(30,64,0),3,12);
  assert.equal(reached,false);
  assert.equal(waits,12);
  assert.equal(goalsSeen.at(-1),null);
});

test('follow uses a dynamic GoalFollow and returns to the decision loop', async () => {
  let goal;
  const target={position:point(10,64,0)};
  const bot={
    entity:{position:point(0,64,0)},players:{},inventory:{items:()=>[]},
    pathfinder:{setGoal:g=>{goal=g;},bestHarvestTool:()=>null},
    clearControlStates:()=>{},stopDigging:()=>{},waitForTicks:async()=>{},blockAt:()=>null
  };
  const ctx=createMineflayerContext(bot,{goals:{GoalNear,GoalFollow}});
  await ctx.followEntitySegment(target,4,8);
  assert.equal(goal,null);
});
