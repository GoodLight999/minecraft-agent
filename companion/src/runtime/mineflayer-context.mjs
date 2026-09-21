import { Vec3 } from 'vec3';

const CROP_AGE = { wheat:7, carrots:7, potatoes:7, beetroots:3 };
const PLACEMENT_REPLACEABLE = new Set(['air','cave_air','void_air','water','lava','short_grass','tall_grass','snow']);

export function createMineflayerContext(bot, { goals, getMasterName = () => null } = {}) {
  const interactionCooldowns = new Map();
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

  const findCraftRecipe = itemName => {
    const item = bot.registry.itemsByName[itemName];
    if (!item) return null;
    let recipes = bot.recipesFor(item.id, null, 1, null);
    if (recipes?.length) return { item, recipe:recipes[0], table:null };
    const table = bot.findBlock({ matching:block => block?.name === 'crafting_table', maxDistance:16 });
    if (!table) return null;
    recipes = bot.recipesFor(item.id, null, 1, table);
    return recipes?.length ? { item, recipe:recipes[0], table } : null;
  };


  const placementFaces = target => [
    { reference:target.offset(0,-1,0), face:new Vec3(0,1,0) },
    { reference:target.offset(0,1,0), face:new Vec3(0,-1,0) },
    { reference:target.offset(-1,0,0), face:new Vec3(1,0,0) },
    { reference:target.offset(1,0,0), face:new Vec3(-1,0,0) },
    { reference:target.offset(0,0,-1), face:new Vec3(0,0,1) },
    { reference:target.offset(0,0,1), face:new Vec3(0,0,-1) }
  ];

  const replaceableForPlacement = block =>
    !block || block.boundingBox === 'empty' || PLACEMENT_REPLACEABLE.has(block.name);

  const placementSupport = position => {
    const target = toVec3(position);
    const current = bot.blockAt(target);
    if (!replaceableForPlacement(current)) return null;
    for (const option of placementFaces(target)) {
      const reference = bot.blockAt(option.reference);
      if (reference && reference.boundingBox !== 'empty' && !PLACEMENT_REPLACEABLE.has(reference.name)) {
        return { reference, face:option.face };
      }
    }
    return null;
  };

  const canPlaceBlockAt = position => Boolean(placementSupport(position));

  const placeBlockAt = async (position, itemName) => {
    const target = toVec3(position);
    const current = bot.blockAt(target);
    if (current?.name === itemName) return current;
    if (!replaceableForPlacement(current)) throw new Error(`target cell is occupied by ${current?.name ?? 'unknown block'}`);
    const stack = bot.inventory.items().find(i => i.name === itemName);
    if (!stack) throw new Error(`placement item ${itemName} is unavailable`);
    const support = placementSupport(target);
    if (!support) throw new Error('target cell has no solid placement face yet');
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    await bot.equip(stack, 'hand');
    await bot.lookAt(target.offset(0.5,0.5,0.5), true);
    await bot.placeBlock(support.reference, support.face);
    await bot.waitForTicks(2);
    const placed = bot.blockAt(target);
    if (!placed || replaceableForPlacement(placed)) throw new Error(`block placement did not fill target cell with ${itemName}`);
    return placed;
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
    findCraftRecipe,
    canPlaceBlockAt,
    placeBlockAt,
    onCooldown:key => (interactionCooldowns.get(key) ?? 0) > Date.now(),
    markCooldown:(key, ms) => interactionCooldowns.set(key, Date.now() + ms),
    isMatureCrop: block => {
      const age = CROP_AGE[block?.name];
      return age != null && Number(block.getProperties?.().age) >= age;
    }
  };
}
