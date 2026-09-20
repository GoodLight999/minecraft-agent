export class SkillRegistry {
  #skills = new Map();

  register(skill) {
    if (!skill || typeof skill.id !== 'string' || !skill.id) throw new TypeError('skill.id is required');
    if (this.#skills.has(skill.id)) throw new Error(`duplicate skill: ${skill.id}`);
    if (typeof skill.describe !== 'function') throw new TypeError(`${skill.id}.describe must be a function`);
    if (typeof skill.run !== 'function') throw new TypeError(`${skill.id}.run must be a function`);
    if (skill.expand && typeof skill.expand !== 'function') throw new TypeError(`${skill.id}.expand must be a function`);
    this.#skills.set(skill.id, skill);
    return this;
  }

  get(id) { return this.#skills.get(id); }
  list() { return [...this.#skills.values()]; }

  async candidates(state, ctx) {
    const out = [];
    const ids = new Set();

    for (const skill of this.#skills.values()) {
      const enabled = skill.when ? await skill.when(state, ctx) : true;
      if (!enabled) continue;

      const variants = skill.expand ? await skill.expand(state, ctx) : [null];
      if (!Array.isArray(variants)) throw new TypeError(`${skill.id}.expand must return an array`);

      for (const variant of variants) {
        if (variant === false || variant == null && skill.expand) continue;
        const suffix = variant?.id == null ? null : String(variant.id).replace(/[^a-zA-Z0-9_-]/g, '_');
        const id = suffix ? `${skill.id}__${suffix}` : skill.id;
        if (ids.has(id)) throw new Error(`duplicate candidate id: ${id}`);

        const description = variant?.description ?? await skill.describe(state, ctx, variant);
        if (!description) continue;

        ids.add(id);
        out.push({
          id,
          skillId: skill.id,
          description,
          tags: variant?.tags ?? skill.tags ?? [],
          priority: variant?.priority ?? skill.priority ?? 0,
          params: variant?.params ?? variant ?? null,
          run: () => skill.run(state, ctx, variant)
        });
      }
    }
    return out;
  }
}
