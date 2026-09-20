export class SkillRegistry {
  #skills = new Map();

  register(skill) {
    if (!skill || typeof skill.id !== 'string' || !skill.id) throw new TypeError('skill.id is required');
    if (this.#skills.has(skill.id)) throw new Error(`duplicate skill: ${skill.id}`);
    if (typeof skill.describe !== 'function') throw new TypeError(`${skill.id}.describe must be a function`);
    if (typeof skill.run !== 'function') throw new TypeError(`${skill.id}.run must be a function`);
    this.#skills.set(skill.id, skill);
    return this;
  }

  get(id) { return this.#skills.get(id); }
  list() { return [...this.#skills.values()]; }

  async candidates(state, ctx) {
    const out = [];
    for (const skill of this.#skills.values()) {
      const enabled = skill.when ? await skill.when(state, ctx) : true;
      if (!enabled) continue;
      const description = await skill.describe(state, ctx);
      if (!description) continue;
      out.push({
        id: skill.id,
        description,
        tags: skill.tags ?? [],
        priority: skill.priority ?? 0,
        run: () => skill.run(state, ctx)
      });
    }
    return out;
  }
}
