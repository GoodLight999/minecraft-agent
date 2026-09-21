const BLUEPRINTS = new Set(['platform','wall','pillar','frame']);
const FACINGS = new Set(['north','east','south','west']);
const AIRLIKE = new Set(['air','cave_air','void_air','water','lava','short_grass','tall_grass','snow']);

const clampInt = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};

const posId = p => `${p.x}_${p.y}_${p.z}`;

function rotate(x, z, facing) {
  if (facing === 'east') return { x:-z, z:x };
  if (facing === 'south') return { x:-x, z:-z };
  if (facing === 'west') return { x:z, z:-x };
  return { x, z };
}

function addCell(map, anchor, facing, x, y, z, material) {
  const r = rotate(x, z, facing);
  const position = { x:anchor.x + r.x, y:anchor.y + y, z:anchor.z + r.z };
  map.set(posId(position), { position, material });
}

export function normalizeBuildingPlan(state) {
  const raw = state?.plan?.building;
  if (!raw || typeof raw !== 'object') return null;
  const blueprint = String(raw.blueprint ?? '').toLowerCase();
  const material = String(raw.material ?? '').trim();
  const anchor = raw.anchor;
  if (!BLUEPRINTS.has(blueprint) || !material || !anchor) return null;
  const ax = Number(anchor.x), ay = Number(anchor.y), az = Number(anchor.z);
  if (![ax,ay,az].every(Number.isFinite)) return null;
  const facing = FACINGS.has(String(raw.facing).toLowerCase()) ? String(raw.facing).toLowerCase() : 'north';
  return {
    blueprint,
    material,
    anchor:{x:Math.round(ax),y:Math.round(ay),z:Math.round(az)},
    facing,
    width:clampInt(raw.width, 3, 1, 12),
    depth:clampInt(raw.depth, 3, 1, 12),
    height:clampInt(raw.height, 3, 1, 12)
  };
}

export function materializeBlueprint(build) {
  if (!build) return [];
  const cells = new Map();
  const add = (x,y,z) => addCell(cells, build.anchor, build.facing, x,y,z, build.material);

  if (build.blueprint === 'platform') {
    for (let x=0; x<build.width; x++) for (let z=0; z<build.depth; z++) add(x,0,z);
  } else if (build.blueprint === 'wall') {
    for (let x=0; x<build.width; x++) for (let y=0; y<build.height; y++) add(x,y,0);
  } else if (build.blueprint === 'pillar') {
    for (let y=0; y<build.height; y++) add(0,y,0);
  } else if (build.blueprint === 'frame') {
    const maxX = build.width - 1, maxZ = build.depth - 1, top = build.height - 1;
    for (let x=0; x<build.width; x++) {
      add(x,0,0); add(x,0,maxZ); add(x,top,0); add(x,top,maxZ);
    }
    for (let z=0; z<build.depth; z++) {
      add(0,0,z); add(maxX,0,z); add(0,top,z); add(maxX,top,z);
    }
    for (let y=0; y<build.height; y++) {
      add(0,y,0); add(maxX,y,0); add(0,y,maxZ); add(maxX,y,maxZ);
    }
  }
  return [...cells.values()];
}

function isReplaceable(block) {
  return !block || block.boundingBox === 'empty' || AIRLIKE.has(block.name);
}

function distanceFrom(position, statePosition) {
  if (!statePosition) return Infinity;
  const dx=position.x-statePosition.x, dy=position.y-statePosition.y, dz=position.z-statePosition.z;
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

function inspectCells(state, ctx, build) {
  const cells = materializeBlueprint(build);
  const blueprintPositions = new Set(cells.map(cell => posId(cell.position)));
  const status = new Map();
  let complete = 0, blocked = 0;

  for (const cell of cells) {
    const block = ctx.blockAt?.(cell.position) ?? null;
    if (block?.name === cell.material) { status.set(posId(cell.position), 'complete'); complete++; }
    else if (!isReplaceable(block)) { status.set(posId(cell.position), 'blocked'); blocked++; }
    else status.set(posId(cell.position), 'empty');
  }

  const available = [];
  for (const cell of cells) {
    if (status.get(posId(cell.position)) !== 'empty') continue;
    const below = {x:cell.position.x,y:cell.position.y-1,z:cell.position.z};
    const belowId = posId(below);
    if (blueprintPositions.has(belowId) && status.get(belowId) !== 'complete') continue;
    if (ctx.canPlaceBlockAt && !ctx.canPlaceBlockAt(cell.position)) continue;
    available.push(cell);
  }
  available.sort((a,b)=>distanceFrom(a.position,state.position)-distanceFrom(b.position,state.position));
  return { cells, complete, blocked, available };
}

export function registerBuildingSkills(registry) {
  registry.register({
    id:'place_blueprint_block',
    tags:['building','work','generic'],
    priority:3,
    when:(state,ctx) => {
      const build=normalizeBuildingPlan(state);
      return Boolean(build && (state.inventoryCounts?.[build.material] ?? 0) > 0 && inspectCells(state,ctx,build).available.length);
    },
    expand:(state,ctx) => {
      const build=normalizeBuildingPlan(state);
      if (!build) return [];
      const info=inspectCells(state,ctx,build);
      return info.available.slice(0,12).map(cell=>({
        id:`${build.blueprint}_${build.material}_${posId(cell.position)}`,
        params:{build,cell},
        description:`Place one ${build.material} block for reusable ${build.blueprint} blueprint at (${cell.position.x},${cell.position.y},${cell.position.z}). Blueprint progress is ${info.complete}/${info.cells.length} complete${info.blocked ? ` with ${info.blocked} occupied target cells` : ''}. Execute only this one placement or one short approach segment, then re-observe.`
      }));
    },
    describe:()=> 'Place one currently supported block from the active reusable building blueprint.',
    run:async(_state,ctx,variant)=>{
      const { build, cell }=variant.params;
      let current=ctx.blockAt(cell.position);
      if(current?.name===build.material) return `blueprint cell already contains ${build.material}`;
      if(!isReplaceable(current)) throw new Error(`blueprint cell is occupied by ${current?.name ?? 'unknown block'}`);
      const stack=ctx.bot.inventory.items().find(i=>i.name===build.material);
      if(!stack) throw new Error(`building material ${build.material} is no longer carried`);
      const target=ctx.toVec3(cell.position);
      if(ctx.bot.entity.position.distanceTo(target)>4.5){
        const reached=await ctx.moveNearSegment(target,3.5,20);
        if(!reached) return `moved toward blueprint cell ${posId(cell.position)}`;
        current=ctx.blockAt(cell.position);
        if(current?.name===build.material) return `blueprint cell was completed while approaching`;
        if(!isReplaceable(current)) throw new Error(`blueprint cell became occupied by ${current?.name ?? 'unknown block'}`);
      }
      if(ctx.canPlaceBlockAt && !ctx.canPlaceBlockAt(cell.position)) return 'blueprint cell is not supported yet; re-observe after adjacent construction';
      await ctx.placeBlockAt(cell.position,build.material);
      return `placed ${build.material} for ${build.blueprint} at ${posId(cell.position)}`;
    }
  });
}
