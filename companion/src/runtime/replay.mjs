import { SkillRegistry } from '../core/skill-registry.mjs';
import { registerCompanionSkills } from '../skills/companion-skills.mjs';
import { registerWorkSkills } from '../skills/work-skills.mjs';

export function createReplayContext(meta = {}) {
  const craftable = new Set(meta.craftable ?? []);
  const cooldowns = new Set(meta.cooldowns ?? []);
  return {
    findCraftRecipe:name => craftable.has(name)
      ? { item:{name}, recipe:{result:{count:1}}, table:meta.craftingTable ? {position:{x:0,y:64,z:0}} : null }
      : null,
    onCooldown:key => cooldowns.has(key)
  };
}

export async function generateCandidateReport(state, meta = {}) {
  const registry = new SkillRegistry();
  registerCompanionSkills(registry);
  registerWorkSkills(registry);
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
