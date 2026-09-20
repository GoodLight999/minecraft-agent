const ORE = /(_ore$|ancient_debris$)/;

function nearest(list, origin) {
  return list.filter(Boolean).sort((a,b) => a.position.distanceTo(origin) - b.position.distanceTo(origin))[0];
}

function masterEntity(state, ctx) {
  if (state.master?.entityId != null) return ctx.bot.entities[state.master.entityId];
  return ctx.masterEntity?.() ?? null;
}

export function registerCompanionSkills(registry) {
  registry.register({
    id: 'wait', tags: ['social','idle'], priority: -10,
    describe: () => 'Wait briefly, observe the world, and avoid pointless movement.',
    run: async (_state, ctx) => { ctx.stopMovement(); await ctx.bot.waitForTicks(8); return 'waited'; }
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
    describe: state => `Move closer to the master without crowding them. Distance is ${state.master.distance.toFixed(1)} blocks.`,
    run: async (state, ctx) => {
      const master = masterEntity(state, ctx); if (!master) throw new Error('master not visible');
      await ctx.goNear(master.position, Math.max(2, state.plan?.social?.preferredDistance ?? 5), 7000);
      return 'moved toward master';
    }
  });

  registry.register({
    id: 'catch_up_to_master', tags: ['social','movement','urgent'], priority: 8,
    when: state => Boolean(state.master?.visible && state.master.distance > (state.plan?.social?.maxDistance ?? 14)),
    describe: state => `Catch up because the master is far away (${state.master.distance.toFixed(1)} blocks). Prioritize regrouping over optional work.`,
    run: async (state, ctx) => {
      const master = masterEntity(state, ctx); if (!master) throw new Error('master not visible');
      await ctx.goNear(master.position, 4, 10000); return 'caught up';
    }
  });

  registry.register({
    id: 'protect_master', tags: ['combat','social','urgent'], priority: 10,
    when: state => state.threats?.some(t => t.distanceToMaster != null && t.distanceToMaster < 7),
    describe: state => {
      const t = state.threats.find(x => x.distanceToMaster != null && x.distanceToMaster < 7);
      return `Protect the master from nearby hostile ${t?.name ?? 'mob'}; prioritize immediate shared safety.`;
    },
    run: async (state, ctx) => {
      const threat = state.threats?.filter(t => t.distanceToMaster != null && t.distanceToMaster < 7)
        .sort((a,b) => a.distanceToMaster - b.distanceToMaster)[0];
      const target = threat ? ctx.bot.entities[threat.entityId] : null;
      if (!target) throw new Error('observed threat no longer exists');
      await ctx.attackOnce(target); return `attacked ${target.name}`;
    }
  });

  registry.register({
    id: 'collect_nearby_drop', tags: ['inventory','work'],
    when: state => state.drops?.some(d => d.distance < 10),
    describe: state => `Collect a useful nearby dropped item. Nearest drop is ${state.drops[0]?.name ?? 'item'} at ${state.drops[0]?.distance?.toFixed?.(1) ?? '?'} blocks.`,
    run: async (_state, ctx) => {
      const drops = Object.values(ctx.bot.entities).filter(e => e.name === 'item' && e.position.distanceTo(ctx.bot.entity.position) < 10);
      const target = nearest(drops, ctx.bot.entity.position); if (!target) throw new Error('no nearby drop');
      await ctx.goNear(target.position, 0.7, 7000); return 'collected nearby drop';
    }
  });

  registry.register({
    id: 'mine_nearby_ore', tags: ['mining','work'],
    when: state => state.nearbyBlocks?.some(b => ORE.test(b.name)),
    describe: state => {
      const ore = state.nearbyBlocks.find(b => ORE.test(b.name));
      return `Mine one observed ore block (${ore?.name ?? 'ore'}) and collect its drop if safely reachable.`;
    },
    run: async (_state, ctx) => {
      const block = ctx.bot.findBlock({ matching: b => ORE.test(b.name), maxDistance: 24 });
      if (!block) throw new Error('ore no longer observed');
      await ctx.digBlock(block); return `mined ${block.name}`;
    }
  });

  registry.register({
    id: 'give_useful_item_to_master', tags: ['social','inventory'],
    when: state => Boolean(state.master?.visible && state.master.distance < 5 && state.inventory?.length),
    describe: () => 'Give the master a useful carried item only when sharing it advances the shared activity; do not dump random inventory.',
    run: async (_state, ctx) => {
      const preferred = ['diamond','iron_ingot','gold_ingot','bread','cooked_beef','torch'];
      const stack = preferred.map(n => ctx.bot.inventory.items().find(i => i.name === n)).find(Boolean);
      if (!stack) throw new Error('no preferred shareable item');
      await ctx.bot.tossStack(stack); return `gave ${stack.name}`;
    }
  });

  registry.register({
    id: 'mine_plan_target', tags: ['mining','work','generic'], priority: 3,
    when: state => Object.entries(state.plan?.targets ?? {}).some(([name, target]) => {
      const have = state.inventoryCounts?.[name] ?? 0;
      return Number.isFinite(Number(target)) && have < Number(target) && state.nearbyBlocks?.some(b => b.name === name);
    }),
    describe: state => {
      const target = Object.entries(state.plan?.targets ?? {}).find(([name, target]) => (state.inventoryCounts?.[name] ?? 0) < Number(target) && state.nearbyBlocks?.some(b => b.name === name));
      return target ? `Mine one observed target block ${target[0]} because the shared plan still needs it.` : null;
    },
    run: async (state, ctx) => {
      const target = Object.entries(state.plan?.targets ?? {}).find(([name, count]) => (state.inventoryCounts?.[name] ?? 0) < Number(count) && ctx.bot.findBlock({matching:b=>b.name===name,maxDistance:24}));
      if (!target) throw new Error('no plan target block available');
      const block = ctx.bot.findBlock({matching:b=>b.name===target[0],maxDistance:24});
      if (!block) throw new Error('target block disappeared');
      await ctx.digBlock(block); return `mined plan target ${block.name}`;
    }
  });

  registry.register({
    id: 'harvest_and_replant_crop', tags: ['farming','work'], priority: 3,
    when: state => state.nearbyBlocks?.some(b => ['wheat','carrots','potatoes','beetroots'].includes(b.name) && b.mature),
    describe: state => {
      const crop = state.nearbyBlocks.find(b => ['wheat','carrots','potatoes','beetroots'].includes(b.name) && b.mature);
      return crop ? `Harvest one mature ${crop.name} crop and immediately replant it when the required seed/item is available.` : null;
    },
    run: async (_state, ctx) => {
      const cropNames = new Set(['wheat','carrots','potatoes','beetroots']);
      const positions = ctx.bot.findBlocks({matching:b=>cropNames.has(b.name) && ctx.isMatureCrop(b),maxDistance:24,count:16});
      if (!positions.length) throw new Error('no mature crop available');
      const pos = positions.sort((a,b)=>a.distanceTo(ctx.bot.entity.position)-b.distanceTo(ctx.bot.entity.position))[0];
      const crop = ctx.bot.blockAt(pos);
      const seedName = {wheat:'wheat_seeds',carrots:'carrot',potatoes:'potato',beetroots:'beetroot_seeds'}[crop.name];
      await ctx.goNear(crop.position, 3, 7000);
      const farmland = ctx.bot.blockAt(crop.position.offset(0,-1,0));
      await ctx.bot.dig(crop, true);
      await ctx.bot.waitForTicks(5);
      const seed = ctx.bot.inventory.items().find(i=>i.name===seedName);
      if (seed && farmland?.name === 'farmland') {
        await ctx.bot.equip(seed,'hand');
        await ctx.bot.placeBlock(farmland, {x:0,y:1,z:0});
        return `harvested and replanted ${crop.name}`;
      }
      return `harvested ${crop.name}; no replant item available`;
    }
  });
}
