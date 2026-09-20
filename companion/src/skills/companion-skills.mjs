const ORE = /(_ore$|ancient_debris$)/;
const CROPS = new Set(['wheat','carrots','potatoes','beetroots']);

const positionId = p => `${p.x}_${p.y}_${p.z}`;
const byDistance = (a,b) => (a.distance ?? Infinity) - (b.distance ?? Infinity);

function masterEntity(state, ctx) {
  if (state.master?.entityId != null) return ctx.bot.entities[state.master.entityId];
  return ctx.masterEntity?.() ?? null;
}

function observedBlock(ctx, observed) {
  const block = ctx.blockAt(observed.position);
  return block?.name === observed.name ? block : null;
}

export function registerCompanionSkills(registry) {
  registry.register({
    id: 'wait', tags: ['social','idle'], priority: -10,
    describe: () => 'Wait briefly, observe the world, and avoid pointless movement.',
    run: async (_state, ctx) => { ctx.stopMovement(); await ctx.bot.waitForTicks(6); return 'waited briefly'; }
  });

  registry.register({
    id: 'look_at_master', tags: ['social','attention'],
    when: state => Boolean(state.master?.visible),
    describe: state => `Look at the master naturally. Current master distance: ${state.master.distance.toFixed(1)} blocks.`,
    run: async (state, ctx) => {
      const master = masterEntity(state, ctx); if (!master) throw new Error('master not visible');
      await ctx.bot.lookAt(master.position.offset(0, 1.5, 0), true); return 'looked at master';
    }
  });

  registry.register({
    id: 'follow_master', tags: ['social','movement'], priority: 4,
    when: state => Boolean(state.master?.visible && state.master.distance > (state.plan?.social?.preferredDistance ?? 5)),
    describe: state => `Follow the master for one short movement segment without crowding them. Distance is ${state.master.distance.toFixed(1)} blocks, then return control to the decision loop.`,
    run: async (state, ctx) => {
      const master = masterEntity(state, ctx); if (!master) throw new Error('master not visible');
      const range = Math.max(2, state.plan?.social?.preferredDistance ?? 5);
      await ctx.followEntitySegment(master, range, 16);
      return 'followed master for one short segment';
    }
  });

  registry.register({
    id: 'catch_up_to_master', tags: ['social','movement','urgent'], priority: 8,
    when: state => Boolean(state.master?.visible && state.master.distance > (state.plan?.social?.maxDistance ?? 14)),
    describe: state => `Catch up toward the master for one short movement segment because they are far away (${state.master.distance.toFixed(1)} blocks), then immediately re-observe.`,
    run: async (state, ctx) => {
      const master = masterEntity(state, ctx); if (!master) throw new Error('master not visible');
      await ctx.followEntitySegment(master, 4, 24);
      return 'caught up for one short segment';
    }
  });

  registry.register({
    id: 'protect_master', tags: ['combat','social','urgent'], priority: 10,
    when: state => state.threats?.some(t => t.distanceToMaster != null && t.distanceToMaster < 8),
    expand: state => state.threats
      .filter(t => t.distanceToMaster != null && t.distanceToMaster < 8)
      .sort((a,b) => a.distanceToMaster - b.distanceToMaster)
      .slice(0,4)
      .map(t => ({
        id:`${t.name}_${t.entityId}`,
        params:t,
        description:`Protect the master from observed ${t.name} (entity ${t.entityId}), ${t.distanceToMaster.toFixed(1)} blocks from the master and ${t.distance.toFixed(1)} blocks from me.`
      })),
    describe: () => 'Protect the master from an observed hostile.',
    run: async (_state, ctx, variant) => {
      const target = ctx.bot.entities[variant.params.entityId];
      if (!target) throw new Error('observed threat no longer exists');
      const attacked = await ctx.attackOnce(target);
      return attacked ? `attacked observed ${target.name}` : `moved toward observed ${target.name}`;
    }
  });

  registry.register({
    id: 'collect_nearby_drop', tags: ['inventory','work'],
    when: state => state.drops?.some(d => d.distance < 12),
    expand: state => state.drops.filter(d => d.distance < 12).sort(byDistance).slice(0,6).map(d => ({
      id:`${d.name}_${d.entityId}`,
      params:d,
      description:`Move toward and collect observed dropped ${d.name} (entity ${d.entityId}), ${d.distance.toFixed(1)} blocks away. Use only one short movement segment before re-observing if still far.`
    })),
    describe: () => 'Collect an observed nearby dropped item.',
    run: async (_state, ctx, variant) => {
      const target = ctx.bot.entities[variant.params.entityId];
      if (!target) throw new Error('observed drop no longer exists');
      const reached = await ctx.moveNearSegment(target.position, 0.8, 28);
      if (!reached) return `moved toward dropped ${variant.params.name}`;
      await ctx.bot.waitForTicks(4);
      return `reached dropped ${variant.params.name}`;
    }
  });

  registry.register({
    id: 'mine_nearby_ore', tags: ['mining','work'],
    when: state => state.nearbyBlocks?.some(b => ORE.test(b.name)),
    expand: state => state.nearbyBlocks.filter(b => ORE.test(b.name)).sort(byDistance).slice(0,8).map(b => ({
      id:`${b.name}_${positionId(b.position)}`,
      params:b,
      description:`Mine observed ${b.name} at (${b.position.x},${b.position.y},${b.position.z}), ${b.distance.toFixed(1)} blocks away. This exact observed block is the target.`
    })),
    describe: () => 'Mine one observed ore block.',
    run: async (_state, ctx, variant) => {
      let block = observedBlock(ctx, variant.params);
      if (!block) throw new Error('observed ore changed or disappeared');
      if (block.position.distanceTo(ctx.bot.entity.position) > 4.5) {
        const reached = await ctx.moveNearSegment(block.position, 3, 30);
        if (!reached) return `moved toward ${block.name}`;
        block = observedBlock(ctx, variant.params);
        if (!block) throw new Error('observed ore changed after approach');
      }
      await ctx.digBlock(block);
      return `mined ${block.name} at ${positionId(variant.params.position)}`;
    }
  });

  registry.register({
    id: 'give_useful_item_to_master', tags: ['social','inventory'],
    when: state => Boolean(state.master?.visible && state.master.distance < 5 && state.inventory?.length),
    expand: state => {
      const preferred = new Set(['diamond','iron_ingot','gold_ingot','bread','cooked_beef','torch']);
      return state.inventory.filter(i => preferred.has(i.name)).slice(0,6).map(i => ({
        id:i.name,
        params:{name:i.name},
        description:`Give the master one carried ${i.name} stack only if sharing it advances the current shared activity. Currently carrying ${i.count} in this stack.`
      }));
    },
    describe: () => 'Give the master a useful carried item.',
    run: async (_state, ctx, variant) => {
      const stack = ctx.bot.inventory.items().find(i => i.name === variant.params.name);
      if (!stack) throw new Error('selected shareable item is no longer carried');
      const master = ctx.masterEntity();
      if (master) await ctx.bot.lookAt(master.position.offset(0,1,0), true);
      await ctx.bot.tossStack(stack);
      return `gave ${stack.name}`;
    }
  });

  registry.register({
    id: 'mine_plan_target', tags: ['mining','work','generic'], priority: 3,
    when: state => Object.entries(state.plan?.targets ?? {}).some(([name, target]) => {
      const have = state.inventoryCounts?.[name] ?? 0;
      return Number.isFinite(Number(target)) && have < Number(target) && state.nearbyBlocks?.some(b => b.name === name);
    }),
    expand: state => {
      const needed = new Set(Object.entries(state.plan?.targets ?? {})
        .filter(([name,target]) => Number.isFinite(Number(target)) && (state.inventoryCounts?.[name] ?? 0) < Number(target))
        .map(([name]) => name));
      return state.nearbyBlocks.filter(b => needed.has(b.name)).sort(byDistance).slice(0,10).map(b => ({
        id:`${b.name}_${positionId(b.position)}`,
        params:b,
        description:`Mine exact observed plan target ${b.name} at (${b.position.x},${b.position.y},${b.position.z}), ${b.distance.toFixed(1)} blocks away, because the shared plan still needs it.`
      }));
    },
    describe: () => 'Mine an observed block requested by the current shared plan.',
    run: async (_state, ctx, variant) => {
      let block = observedBlock(ctx, variant.params);
      if (!block) throw new Error('observed plan target changed or disappeared');
      if (block.position.distanceTo(ctx.bot.entity.position) > 4.5) {
        const reached = await ctx.moveNearSegment(block.position, 3, 30);
        if (!reached) return `moved toward plan target ${block.name}`;
        block = observedBlock(ctx, variant.params);
        if (!block) throw new Error('plan target changed after approach');
      }
      await ctx.digBlock(block);
      return `mined plan target ${block.name}`;
    }
  });

  registry.register({
    id: 'harvest_and_replant_crop', tags: ['farming','work'], priority: 3,
    when: state => state.nearbyBlocks?.some(b => CROPS.has(b.name) && b.mature),
    expand: state => state.nearbyBlocks.filter(b => CROPS.has(b.name) && b.mature).sort(byDistance).slice(0,10).map(b => ({
      id:`${b.name}_${positionId(b.position)}`,
      params:b,
      description:`Harvest exact mature ${b.name} at (${b.position.x},${b.position.y},${b.position.z}), ${b.distance.toFixed(1)} blocks away, and replant if its seed/item is available.`
    })),
    describe: () => 'Harvest and replant one observed mature crop.',
    run: async (_state, ctx, variant) => {
      let crop = observedBlock(ctx, variant.params);
      if (!crop || !ctx.isMatureCrop(crop)) throw new Error('observed crop is no longer mature');
      if (crop.position.distanceTo(ctx.bot.entity.position) > 4.5) {
        const reached = await ctx.moveNearSegment(crop.position, 3, 30);
        if (!reached) return `moved toward mature ${crop.name}`;
        crop = observedBlock(ctx, variant.params);
        if (!crop || !ctx.isMatureCrop(crop)) throw new Error('crop changed after approach');
      }
      const seedName = {wheat:'wheat_seeds',carrots:'carrot',potatoes:'potato',beetroots:'beetroot_seeds'}[crop.name];
      const farmland = ctx.bot.blockAt(crop.position.offset(0,-1,0));
      await ctx.bot.dig(crop, true);
      await ctx.bot.waitForTicks(4);
      const seed = ctx.bot.inventory.items().find(i => i.name === seedName);
      if (seed && farmland?.name === 'farmland') {
        await ctx.bot.equip(seed,'hand');
        await ctx.bot.placeBlock(farmland, ctx.toVec3({x:0,y:1,z:0}));
        return `harvested and replanted ${crop.name}`;
      }
      return `harvested ${crop.name}; replant item unavailable`;
    }
  });
}
