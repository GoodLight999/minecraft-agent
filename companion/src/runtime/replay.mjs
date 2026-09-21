import { SkillRegistry } from '../core/skill-registry.mjs';
import { registerCompanionSkills } from '../skills/companion-skills.mjs';
import { registerWorkSkills } from '../skills/work-skills.mjs';
import { registerBuildingSkills } from '../skills/building-skills.mjs';

export function createReplayContext(meta = {}) {
  const craftable = new Set(meta.craftable ?? []);
  const cooldowns = new Set(meta.cooldowns ?? []);
  const blockMap = new Map((meta.blocks ?? []).map(block => [
    `${block.position.x}_${block.position.y}_${block.position.z}`,
    { ...block, boundingBox:block.boundingBox ?? 'block' }
  ]));
  const blockAt = position => {
    const key = `${position.x}_${position.y}_${position.z}`;
    const exact = blockMap.get(key);
    if (exact) return exact;
    if (Number.isFinite(meta.defaultGroundY) && position.y <= meta.defaultGroundY) return { name:'stone', boundingBox:'block', position };
    return { name:'air', boundingBox:'empty', position };
  };
  const replaceable = block => block.boundingBox === 'empty' || ['air','cave_air','void_air','water','lava','short_grass','tall_grass','snow'].includes(block.name);
  const canPlaceBlockAt = position => {
    if (!replaceable(blockAt(position))) return false;
    const neighbors = [
      {x:position.x,y:position.y-1,z:position.z},{x:position.x,y:position.y+1,z:position.z},
      {x:position.x-1,y:position.y,z:position.z},{x:position.x+1,y:position.y,z:position.z},
      {x:position.x,y:position.y,z:position.z-1},{x:position.x,y:position.y,z:position.z+1}
    ];
    return neighbors.some(p => !replaceable(blockAt(p)));
  };
  return {
    findCraftRecipe:name => craftable.has(name)
      ? { item:{name}, recipe:{result:{count:1}}, table:meta.craftingTable ? {position:{x:0,y:64,z:0}} : null }
      : null,
    onCooldown:key => cooldowns.has(key),
    blockAt,
    canPlaceBlockAt
  };
}

export async function generateCandidateReport(state, meta = {}) {
  const registry = new SkillRegistry();
  registerCompanionSkills(registry);
  registerWorkSkills(registry);
  registerBuildingSkills(registry);
  const candidates = await registry.candidates(state, createReplayContext(meta));
  const bySkill = {};
  for (const candidate of candidates) bySkill[candidate.skillId] = (bySkill[candidate.skillId] ?? 0) + 1;
  return {
    count:candidates.length,
    bySkill,
    candidates:candidates.map(({id,skillId,description,tags,priority,params}) => ({
      id,skillId,description,tags,priority,params
    })),
    rawCandidates:candidates
  };
}

export function validateReplayExpectations(report, expect = {}) {
  const ids = new Set(report.candidates.map(c=>c.id));
  const failures = [];
  for (const id of expect.mustInclude ?? []) if (![...ids].some(actual=>actual.startsWith(id))) failures.push(`missing candidate prefix: ${id}`);
  for (const id of expect.mustExclude ?? []) if ([...ids].some(actual=>actual.startsWith(id))) failures.push(`unexpected candidate prefix: ${id}`);
  if (Number.isFinite(expect.maxCandidates) && report.count > expect.maxCandidates) failures.push(`candidate count ${report.count} exceeds ${expect.maxCandidates}`);
  if (Number.isFinite(expect.minCandidates) && report.count < expect.minCandidates) failures.push(`candidate count ${report.count} below ${expect.minCandidates}`);
  return failures;
}
