import { Vec3 } from 'vec3';

const CROP_AGE = { wheat:7, carrots:7, potatoes:7, beetroots:3 };

export function createMineflayerContext(bot, { goals, getMasterName = () => null } = {}) {
  if (!goals?.GoalNear || !goals?.GoalFollow) throw new TypeError('mineflayer-pathfinder goals are required');

  const stopMovement = () => {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    try { bot.stopDigging(); } catch {}
  };

  const toVec3 = p => p instanceof Vec3 ? p : new Vec3(p.x, p.y, p.z);

  const moveNearSegment = async (position, range = 3, ticks = 24) => {
    const target = toVec3(position);
    if (bot.entity.position.distanceTo(target) <= range + 0.5) return true;
    bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, range), false);
    try {
      for (let elapsed = 0; elapsed < ticks; elapsed += 4) {
        await bot.waitForTicks(Math.min(4, ticks - elapsed));
        if (bot.entity.position.distanceTo(target) <= range + 0.5) return true;
      }
      return bot.entity.position.distanceTo(target) <= range + 0.5;
    } finally {
      bot.pathfinder.setGoal(null);
    }
  };

  const followEntitySegment = async (entity, range = 4, ticks = 16) => {
    if (!entity?.position) throw new Error('follow target is unavailable');
    bot.pathfinder.setGoal(new goals.GoalFollow(entity, range), true);
    try {
      for (let elapsed = 0; elapsed < ticks; elapsed += 4) {
        await bot.waitForTicks(Math.min(4, ticks - elapsed));
        if (!entity.position) break;
        if (bot.entity.position.distanceTo(entity.position) <= range + 0.75) return true;
      }
      return Boolean(entity.position && bot.entity.position.distanceTo(entity.position) <= range + 0.75);
    } finally {
      bot.pathfinder.setGoal(null);
    }
  };

  const digBlock = async block => {
    if (!block) throw new Error('block is unavailable');
    const tool = bot.pathfinder.bestHarvestTool(block);
    if (tool) await bot.equip(tool, 'hand');
    if (!block.canHarvest(bot.heldItem?.type)) throw new Error(`cannot harvest ${block.name} with current tool`);
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    await bot.dig(block, true);
    await bot.waitForTicks(3);
  };

  const attackOnce = async target => {
    if (!target?.position) throw new Error('attack target is unavailable');
    if (bot.entity.position.distanceTo(target.position) > 4.2) {
      const reached = await moveNearSegment(target.position, 3, 12);
      if (!reached || !target.position || bot.entity.position.distanceTo(target.position) > 4.2) return false;
    }
    const weaponNames = ['netherite_sword','diamond_sword','iron_sword','stone_sword','iron_axe','stone_axe'];
    const weapon = weaponNames.map(name => bot.inventory.items().find(i => i.name === name)).find(Boolean);
    if (weapon) await bot.equip(weapon, 'hand');
    await bot.lookAt(target.position.offset(0, 1, 0), true);
    bot.attack(target);
    await bot.waitForTicks(6);
    return true;
  };

  return {
    bot,
    stopMovement,
    toVec3,
    blockAt: p => bot.blockAt(toVec3(p)),
    masterEntity: () => {
      const name = getMasterName();
      return name ? bot.players[name]?.entity ?? null : null;
    },
    moveNearSegment,
    followEntitySegment,
    digBlock,
    attackOnce,
    isMatureCrop: block => {
      const age = CROP_AGE[block?.name];
      return age != null && Number(block.getProperties?.().age) >= age;
    }
  };
}
