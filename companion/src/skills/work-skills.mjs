const CONTAINERS = new Set(['chest','barrel']);
const FURNACES = new Set(['furnace','blast_furnace','smoker']);
const ESSENTIALS = new Set([
  'torch','bread','cooked_beef','cooked_porkchop','cooked_chicken','golden_carrot',
  'water_bucket','bucket','shield','bow','crossbow','elytra','totem_of_undying'
]);
const TOOL_OR_ARMOR = /(_pickaxe$|_axe$|_sword$|_shovel$|_hoe$|_helmet$|_chestplate$|_leggings$|_boots$)/;

const RANCH_FOOD = {
  cow:['wheat'],
  sheep:['wheat'],
  pig:['carrot','potato','beetroot'],
  chicken:['wheat_seeds','beetroot_seeds','melon_seeds','pumpkin_seeds']
};

const SMELT_OUTPUTS = {
  iron_ingot:['raw_iron','iron_ore','deepslate_iron_ore'],
  gold_ingot:['raw_gold','gold_ore','deepslate_gold_ore','nether_gold_ore'],
  copper_ingot:['raw_copper','copper_ore','deepslate_copper_ore'],
  glass:['sand','red_sand'],
  stone:['cobblestone'],
  smooth_stone:['stone'],
  cooked_beef:['beef'],
  cooked_porkchop:['porkchop'],
  cooked_chicken:['chicken'],
  baked_potato:['potato']
};

const posId = p => `${p.x}_${p.y}_${p.z}`;
const byDistance = (a,b) => (a.distance ?? Infinity) - (b.distance ?? Infinity);

function intentText(state) {
  return [state.activity,state.plan?.activity,state.plan?.objective,state.plan?.notes].filter(Boolean).join(' ').toLowerCase();
}

function storageIntent(state) {
  return /storage|organize|chest|warehouse|倉庫|収納|整理/.test(intentText(state));
}

function ranchingIntent(state) {
  return /ranch|breed|animal|livestock|牧場|牧畜|繁殖|牛|羊|豚|鶏/.test(intentText(state));
}

function smeltingIntent(state) {
  return /smelt|furnace|cook|精錬|製錬|かまど|焼/.test(intentText(state));
}

function furnaceCanSmelt(furnaceName, output) {
  if (furnaceName === 'furnace') return true;
  const food = new Set(['cooked_beef','cooked_porkchop','cooked_chicken','baked_potato']);
  if (furnaceName === 'smoker') return food.has(output);
  if (furnaceName === 'blast_furnace') return !food.has(output) && ['iron_ingot','gold_ingot','copper_ingot'].includes(output);
  return false;
}

function exactBlock(ctx, observed) {
  const block=ctx.blockAt(observed.position);
  return block?.name === observed.name ? block : null;
}

function keepItem(state, item) {
  if (ESSENTIALS.has(item.name) || TOOL_OR_ARMOR.test(item.name)) return true;
  if (/seed/.test(item.name) && /farm|農/.test(intentText(state))) return true;
  const target=Number(state.plan?.targets?.[item.name]);
  if (Number.isFinite(target) && (state.inventoryCounts?.[item.name] ?? 0) <= target) return true;
  for (const [output,targetRaw] of Object.entries(state.plan?.targets ?? {})) {
    const outputTarget=Number(targetRaw);
    if (!Number.isFinite(outputTarget) || (state.inventoryCounts?.[output] ?? 0) >= outputTarget) continue;
    if ((SMELT_OUTPUTS[output] ?? []).includes(item.name)) return true;
    if (['coal','charcoal','coal_block'].includes(item.name) && SMELT_OUTPUTS[output]) return true;
  }
  return false;
}

function fuelStack(bot) {
  const preferred=['coal','charcoal','coal_block'];
  return preferred.map(name=>bot.inventory.items().find(i=>i.name===name)).find(Boolean) ?? null;
}

function ranchFood(state, animalName) {
  return (RANCH_FOOD[animalName] ?? []).find(name => (state.inventoryCounts?.[name] ?? 0) > 0) ?? null;
}

export function registerWorkSkills(registry) {
  registry.register({
    id:'deposit_bulk_item',
    tags:['storage','inventory','work'],
    when:state => state.nearbyBlocks?.some(b=>CONTAINERS.has(b.name)) &&
      state.inventory?.some(item=>!keepItem(state,item)) &&
      (storageIntent(state) || (state.inventorySlotsFree ?? 36) <= 6),
    expand:state => {
      const containers=state.nearbyBlocks.filter(b=>CONTAINERS.has(b.name)).sort(byDistance).slice(0,2);
      const items=state.inventory.filter(item=>!keepItem(state,item)).sort((a,b)=>b.count-a.count).slice(0,6);
      return containers.flatMap(container=>items.map(item=>({
        id:`${container.name}_${posId(container.position)}_${item.name}`,
        params:{container,itemName:item.name},
        description:`Deposit carried ${item.name} stack into observed ${container.name} at (${container.position.x},${container.position.y},${container.position.z}). Keep tools, armor and current-plan essentials in inventory.`
      })));
    },
    describe:()=> 'Deposit one nonessential stack into observed storage.',
    run:async(_state,ctx,variant)=>{
      let block=exactBlock(ctx,variant.params.container);
      if(!block) throw new Error('observed storage changed or disappeared');
      if(block.position.distanceTo(ctx.bot.entity.position)>4.5){
        const reached=await ctx.moveNearSegment(block.position,3,24);
        if(!reached) return 'moved toward storage';
        block=exactBlock(ctx,variant.params.container);
        if(!block) throw new Error('storage changed after approach');
      }
      const stack=ctx.bot.inventory.items().find(i=>i.name===variant.params.itemName);
      if(!stack) throw new Error('selected deposit item is no longer carried');
      const container=await ctx.bot.openContainer(block);
      try{
        await container.deposit(stack.type,stack.metadata,stack.count);
        return `deposited ${stack.count} ${stack.name}`;
      }finally{
        await container.close();
      }
    }
  });

  registry.register({
    id:'withdraw_plan_targets',
    tags:['storage','inventory','work'],
    when:state => state.nearbyBlocks?.some(b=>CONTAINERS.has(b.name)) &&
      Object.entries(state.plan?.targets ?? {}).some(([name,count]) => Number(count) > (state.inventoryCounts?.[name] ?? 0)),
    expand:state => state.nearbyBlocks.filter(b=>CONTAINERS.has(b.name)).sort(byDistance).slice(0,4).map(container=>({
      id:`${container.name}_${posId(container.position)}`,
      params:{container},
      description:`Open observed ${container.name} at (${container.position.x},${container.position.y},${container.position.z}) and withdraw any unmet current-plan target found inside. Do not take unrelated items.`
    })),
    describe:()=> 'Withdraw only currently needed plan targets from observed storage.',
    run:async(state,ctx,variant)=>{
      let block=exactBlock(ctx,variant.params.container);
      if(!block) throw new Error('observed storage changed or disappeared');
      if(block.position.distanceTo(ctx.bot.entity.position)>4.5){
        const reached=await ctx.moveNearSegment(block.position,3,24);
        if(!reached) return 'moved toward storage to search plan targets';
        block=exactBlock(ctx,variant.params.container);
        if(!block) throw new Error('storage changed after approach');
      }
      const container=await ctx.bot.openContainer(block);
      const taken=[];
      try{
        for(const [name,targetRaw] of Object.entries(state.plan?.targets ?? {})){
          const target=Number(targetRaw);
          const have=state.inventoryCounts?.[name] ?? 0;
          if(!Number.isFinite(target) || have>=target) continue;
          const matching=container.containerItems().filter(i=>i.name===name);
          let remaining=target-have;
          for(const item of matching){
            if(remaining<=0) break;
            const count=Math.min(remaining,item.count);
            await container.withdraw(item.type,item.metadata,count);
            taken.push(`${count} ${name}`);
            remaining-=count;
          }
        }
      }finally{
        await container.close();
      }
      return taken.length ? `withdrew ${taken.join(', ')}` : 'storage contained no unmet plan targets';
    }
  });

  registry.register({
    id:'craft_plan_target',
    tags:['crafting','work','generic'],
    when:async(state,ctx)=>Object.entries(state.plan?.targets ?? {}).some(([name,target]) =>
      Number(target)>(state.inventoryCounts?.[name] ?? 0) && Boolean(ctx.findCraftRecipe(name))),
    expand:async(state,ctx)=>{
      const out=[];
      for(const [name,targetRaw] of Object.entries(state.plan?.targets ?? {})){
        const target=Number(targetRaw), have=state.inventoryCounts?.[name] ?? 0;
        if(!Number.isFinite(target) || have>=target) continue;
        const found=ctx.findCraftRecipe(name);
        if(!found) continue;
        out.push({
          id:name,
          params:{name},
          description:`Craft one recipe operation for current plan target ${name}. Inventory has ${have}, plan target is ${target}; recipe is currently craftable${found.table?' at the nearby crafting table':''}.`
        });
        if(out.length>=8) break;
      }
      return out;
    },
    describe:()=> 'Craft one currently craftable plan target.',
    run:async(_state,ctx,variant)=>{
      let found=ctx.findCraftRecipe(variant.params.name);
      if(!found) throw new Error('selected recipe is no longer craftable');
      if(found.table && found.table.position.distanceTo(ctx.bot.entity.position)>4.5){
        const reached=await ctx.moveNearSegment(found.table.position,3,24);
        if(!reached) return `moved toward crafting table for ${variant.params.name}`;
        found=ctx.findCraftRecipe(variant.params.name);
        if(!found) throw new Error('recipe became unavailable after approach');
      }
      await ctx.bot.craft(found.recipe,1,found.table);
      return `crafted one recipe operation for ${variant.params.name}`;
    }
  });

  registry.register({
    id:'load_furnace_for_plan',
    tags:['smelting','work'],
    when:state => state.nearbyBlocks?.some(b=>FURNACES.has(b.name)) &&
      Object.entries(state.plan?.targets ?? {}).some(([output,target]) =>
        Number(target)>(state.inventoryCounts?.[output] ?? 0) &&
        (SMELT_OUTPUTS[output] ?? []).some(input=>(state.inventoryCounts?.[input] ?? 0)>0)) &&
      Boolean(fuelStack({inventory:{items:()=>state.inventory.map(i=>i)}})),
    expand:state=>{
      const furnaces=state.nearbyBlocks.filter(b=>FURNACES.has(b.name)).sort(byDistance).slice(0,3);
      const jobs=[];
      for(const [output,targetRaw] of Object.entries(state.plan?.targets ?? {})){
        const target=Number(targetRaw), have=state.inventoryCounts?.[output] ?? 0;
        if(!Number.isFinite(target)||have>=target) continue;
        const input=(SMELT_OUTPUTS[output] ?? []).find(name=>(state.inventoryCounts?.[name] ?? 0)>0);
        if(!input) continue;
        for(const furnace of furnaces.filter(f=>furnaceCanSmelt(f.name,output))) jobs.push({
          id:`${output}_${input}_${posId(furnace.position)}`,
          params:{furnace,output,input,need:target-have},
          description:`Load observed ${furnace.name} at (${furnace.position.x},${furnace.position.y},${furnace.position.z}) with ${input} and fuel to work toward plan target ${output}. Start the smelt and return control immediately; do not wait for completion.`
        });
      }
      return jobs.slice(0,8);
    },
    describe:()=> 'Load a furnace for one current-plan smelting job.',
    run:async(_state,ctx,variant)=>{
      let block=exactBlock(ctx,variant.params.furnace);
      if(!block) throw new Error('observed furnace changed or disappeared');
      if(block.position.distanceTo(ctx.bot.entity.position)>4.5){
        const reached=await ctx.moveNearSegment(block.position,3,24);
        if(!reached) return 'moved toward furnace';
        block=exactBlock(ctx,variant.params.furnace);
        if(!block) throw new Error('furnace changed after approach');
      }
      const input=ctx.bot.inventory.items().find(i=>i.name===variant.params.input);
      const fuel=fuelStack(ctx.bot);
      if(!input||!fuel) throw new Error('smelting input or fuel is no longer available');
      const furnace=await ctx.bot.openFurnace(block);
      try{
        const existing=furnace.inputItem();
        if(existing && existing.name!==input.name) return `furnace is busy with ${existing.name}`;
        if(!furnace.fuelItem()) await furnace.putFuel(fuel.type,fuel.metadata,1);
        const amount=Math.max(1,Math.min(input.count,variant.params.need,8));
        await furnace.putInput(input.type,input.metadata,amount);
        return `loaded ${amount} ${input.name} into furnace for ${variant.params.output}`;
      }finally{
        furnace.close();
      }
    }
  });

  registry.register({
    id:'collect_furnace_output',
    tags:['smelting','work'],
    when:(state,ctx) => (smeltingIntent(state) || Object.keys(state.plan?.targets ?? {}).some(name=>SMELT_OUTPUTS[name])) &&
      state.nearbyBlocks?.some(b=>FURNACES.has(b.name) && !ctx.onCooldown(`furnace:${posId(b.position)}`)),
    expand:(state,ctx)=>state.nearbyBlocks
      .filter(b=>FURNACES.has(b.name) && !ctx.onCooldown(`furnace:${posId(b.position)}`))
      .sort(byDistance).slice(0,3).map(furnace=>({
        id:`${furnace.name}_${posId(furnace.position)}`,
        params:{furnace},
        description:`Check observed ${furnace.name} at (${furnace.position.x},${furnace.position.y},${furnace.position.z}) for finished output and collect it if present. This is a short check, not a wait-until-done action.`
      })),
    describe:()=> 'Collect finished output from an observed furnace.',
    run:async(_state,ctx,variant)=>{
      let block=exactBlock(ctx,variant.params.furnace);
      if(!block) throw new Error('observed furnace changed or disappeared');
      if(block.position.distanceTo(ctx.bot.entity.position)>4.5){
        const reached=await ctx.moveNearSegment(block.position,3,24);
        if(!reached) return 'moved toward furnace to check output';
        block=exactBlock(ctx,variant.params.furnace);
        if(!block) throw new Error('furnace changed after approach');
      }
      const furnace=await ctx.bot.openFurnace(block);
      try{
        const output=furnace.outputItem();
        if(!output){
          ctx.markCooldown(`furnace:${posId(variant.params.furnace.position)}`,3000);
          return 'furnace output is not ready yet';
        }
        const item=await furnace.takeOutput();
        ctx.markCooldown(`furnace:${posId(variant.params.furnace.position)}`,1000);
        return `collected ${item?.count ?? output.count} ${item?.name ?? output.name} from furnace`;
      }finally{
        furnace.close();
      }
    }
  });

  registry.register({
    id:'feed_ranch_animal',
    tags:['ranching','social','work'],
    when:state => ranchingIntent(state) && state.animals?.some(a=>a.distance<12 && ranchFood(state,a.name)),
    expand:(state,ctx)=>state.animals
      .filter(a=>a.distance<12 && ranchFood(state,a.name) && !ctx.onCooldown(`animal:${a.entityId}`))
      .sort(byDistance).slice(0,8).map(animal=>{
        const food=ranchFood(state,animal.name);
        return {
          id:`${animal.name}_${animal.entityId}_${food}`,
          params:{animal,food},
          description:`Feed observed ${animal.name} (entity ${animal.entityId}) with ${food} as one ranching/breeding interaction. Do not spam the same animal; it will enter a cooldown afterward.`
        };
      }),
    describe:()=> 'Feed one observed ranch animal.',
    run:async(_state,ctx,variant)=>{
      const target=ctx.bot.entities[variant.params.animal.entityId];
      const food=ctx.bot.inventory.items().find(i=>i.name===variant.params.food);
      if(!target?.position||!food) throw new Error('animal or feed item is no longer available');
      if(target.position.distanceTo(ctx.bot.entity.position)>4){
        const reached=await ctx.moveNearSegment(target.position,3,20);
        if(!reached) return `moved toward ${target.name} for feeding`;
      }
      await ctx.bot.equip(food,'hand');
      await ctx.bot.lookAt(target.position.offset(0,1,0),true);
      await ctx.bot.activateEntity(target);
      await ctx.bot.waitForTicks(4);
      ctx.markCooldown(`animal:${target.id}`,30_000);
      return `fed ${target.name} with ${food.name}`;
    }
  });
}
