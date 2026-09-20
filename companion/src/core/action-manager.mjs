function timeoutPromise(ms, onTimeout) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(async () => {
      try { await onTimeout?.(); } finally { reject(new Error(`action timed out after ${ms}ms`)); }
    }, ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export class ActionManager {
  constructor({ stop = async () => {}, defaultTimeoutMs = 20_000 } = {}) {
    this.stopHook = stop;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.current = null;
    this.sequence = 0;
  }

  get busy() { return this.current !== null; }

  async interrupt(reason = 'interrupted') {
    if (!this.current) return;
    this.current.interrupted = reason;
    await this.stopHook(reason);
  }

  async run(candidate, { timeoutMs = this.defaultTimeoutMs } = {}) {
    if (!candidate?.id || typeof candidate.run !== 'function') throw new TypeError('invalid candidate');
    if (this.current) await this.interrupt(`superseded by ${candidate.id}`);

    const record = {
      id: candidate.id,
      startedAt: Date.now(),
      interrupted: null,
      sequence: ++this.sequence
    };
    this.current = record;
    const timeout = timeoutPromise(timeoutMs, () => this.stopHook(`timeout: ${candidate.id}`));
    try {
      const value = await Promise.race([Promise.resolve().then(candidate.run), timeout.promise]);
      return {
        ok: true,
        action: candidate.id,
        value,
        interrupted: record.interrupted,
        durationMs: Date.now() - record.startedAt
      };
    } catch (error) {
      return {
        ok: false,
        action: candidate.id,
        error: error instanceof Error ? error.message : String(error),
        interrupted: record.interrupted,
        durationMs: Date.now() - record.startedAt
      };
    } finally {
      timeout.cancel();
      if (this.current === record) this.current = null;
    }
  }
}
