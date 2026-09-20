export class AsyncDirector {
  constructor({ director, getState, initialPlan, onPlan = () => {}, onError = () => {}, now = Date.now }) {
    Object.assign(this, { director, getState, onPlan, onError, now });
    this.plan = initialPlan;
    this.active = null;
    this.sequence = 0;
    this.lastRequestedAt = 0;
  }

  get planning() { return this.active !== null; }

  request(reason, { userMessage = null, force = false } = {}) {
    if (!this.director) return Promise.resolve(null);
    if (this.active && !force) return this.active.promise;
    if (force) this.active?.controller.abort();

    const controller = new AbortController();
    const record = { id:++this.sequence, controller, promise:null };
    this.lastRequestedAt = this.now();

    record.promise = Promise.resolve()
      .then(() => this.director.plan(this.getState(), { reason, userMessage, signal:controller.signal }))
      .then(result => {
        if (controller.signal.aborted || this.active !== record) return null;
        this.plan = result.plan;
        this.onPlan({ reason, userMessage, ...result });
        return result;
      })
      .catch(error => {
        if (controller.signal.aborted || error?.name === 'AbortError') return null;
        this.onError({ reason, userMessage, error });
        return null;
      })
      .finally(() => {
        if (this.active === record) this.active = null;
      });

    this.active = record;
    return record.promise;
  }

  periodicDue(intervalMs) {
    return !this.active && this.now() - this.lastRequestedAt >= intervalMs;
  }

  stop() {
    this.active?.controller.abort();
    this.active = null;
  }
}
