import { isDecisionFresh } from './freshness.mjs';

export class JevLoop {
  constructor({ getState, registry, context, jev, actions, intervalMs = 350, onDecision = () => {}, onResult = () => {} }) {
    Object.assign(this, { getState, registry, context, jev, actions, intervalMs, onDecision, onResult });
    this.running = false;
    this.iteration = 0;
  }

  async step() {
    const before = await this.getState();
    const candidates = await this.registry.candidates(before, this.context);
    if (!candidates.length) return { skipped: 'no-candidates' };

    const decision = await this.jev.decide(before, candidates);
    const selected = candidates.find(c => c.id === decision.action);
    if (!selected) throw new Error(`JEV selected unknown action: ${decision.action}`);

    const afterDecision = await this.getState();
    if (!isDecisionFresh(before, afterDecision)) {
      return { skipped: 'stale-decision', decision };
    }

    this.onDecision({ state: before, candidates, decision });
    const result = await this.actions.run(selected);
    this.onResult({ state: afterDecision, decision, result });
    return { decision, result };
  }

  async start({ signal } = {}) {
    if (this.running) return;
    this.running = true;
    try {
      while (!signal?.aborted) {
        const started = Date.now();
        try { await this.step(); }
        catch (error) { this.onResult({ error }); }
        const delay = Math.max(0, this.intervalMs - (Date.now() - started));
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
    } finally {
      this.running = false;
    }
  }
}
