const RANCHABLE = new Set(['cow','sheep','pig','chicken']);

const HOSTILES = new Set([
  'zombie','husk','drowned','skeleton','stray','creeper','spider','cave_spider','witch',
  'pillager','vindicator','evoker','ravager','phantom','silverfish','blaze','ghast','piglin_brute',
  'hoglin','zoglin','warden'
]);

const pos = p => p ? ({ x:+p.x.toFixed(2), y:+p.y.toFixed(2), z:+p.z.toFixed(2) }) : null;

function inventory(bot) {
  return bot.inventory.items().map(i => ({ name:i.name, count:i.count, slot:i.slot }));
}

function inventoryCounts(bot) {
  const counts = {};
  for (const item of bot.inventory.items()) counts[item.name] = (counts[item.name] ?? 0) + item.count;
  return counts;
}

const ALWAYS_INTERESTING = /(_ore$|ancient_debris$|_log$|_stem$|_hyphae$|_sapling$|wheat$|carrots$|potatoes$|beetroots$|farmland$|chest$|barrel$|furnace$|blast_furnace$|smoker$|crafting_table$|_bed$|_fence$|_fence_gate$|hopper$|dispenser$|dropper$|observer$|piston$|sticky_piston$|redstone_wire$|redstone_torch$|repeater$|comparator$)/;

function nearbyBlocks(bot, plan, maxDistance = 16, count = 96) {
  const planTargets = new Set(Object.keys(plan?.targets ?? {}));
  const positions = bot.findBlocks({
    matching: block => Boolean(block && (planTargets.has(block.name) || ALWAYS_INTERESTING.test(block.name))),
    maxDistance, count
  });
  return positions.map(p => {
    const block = bot.blockAt(p);
    const props = block?.getProperties?.() ?? {};
    const matureAge = {wheat:7,carrots:7,potatoes:7,beetroots:3}[block?.name];
    return { name:block?.name ?? 'unknown', position:pos(p), distance:+p.distanceTo(bot.entity.position).toFixed(1), mature:matureAge == null ? undefined : Number(props.age) >= matureAge };
  });
}

export function freshnessSnapshot(bot) {
  return {
    capturedAt:Date.now(),
    dimension:bot.game?.dimension,
    position:pos(bot.entity?.position)
  };
}

export function snapshot(bot, { masterName, plan = null, recent = [], activity = null } = {}) {
  const master = masterName ? bot.players[masterName]?.entity : null;
  const entities = Object.values(bot.entities ?? {});
  const threats = entities.filter(e => HOSTILES.has(e.name) && e.position)
    .map(e => ({
      entityId:e.id, name:e.name,
      distance:+e.position.distanceTo(bot.entity.position).toFixed(1),
      distanceToMaster:master ? +e.position.distanceTo(master.position).toFixed(1) : null,
      position:pos(e.position)
    })).sort((a,b) => a.distance-b.distance).slice(0,16);
  const animals = entities.filter(e => RANCHABLE.has(e.name) && e.position)
    .map(e => ({ entityId:e.id, name:e.name, distance:+e.position.distanceTo(bot.entity.position).toFixed(1), position:pos(e.position) }))
    .sort((a,b) => a.distance-b.distance).slice(0,16);
  const drops = entities.filter(e => e.name === 'item' && e.position)
    .map(e => ({ entityId:e.id, name:e.getDroppedItem?.()?.name ?? 'item', distance:+e.position.distanceTo(bot.entity.position).toFixed(1), position:pos(e.position) }))
    .sort((a,b) => a.distance-b.distance).slice(0,16);

  return {
    ...freshnessSnapshot(bot),
    health:bot.health,
    food:bot.food,
    heldItem:bot.heldItem?.name ?? null,
    inventory:inventory(bot),
    inventoryCounts:inventoryCounts(bot),
    inventorySlotsUsed:bot.inventory.items().length,
    inventorySlotsFree:Math.max(0, 36 - bot.inventory.items().length),
    master:master ? { entityId:master.id, visible:true, position:pos(master.position), distance:+master.position.distanceTo(bot.entity.position).toFixed(1) } : { visible:false },
    threats, animals, drops,
    nearbyBlocks:nearbyBlocks(bot, plan),
    plan, activity,
    recent:recent.slice(-8)
  };
}
