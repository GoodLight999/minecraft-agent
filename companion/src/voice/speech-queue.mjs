import { spawn } from 'node:child_process';

function abortError() {
  const error = new Error('speech interrupted');
  error.name = 'AbortError';
  return error;
}

function ffplay(buffer, { command = process.env.FFPLAY || 'ffplay', signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const child = spawn(command, ['-nodisp', '-autoexit', '-loglevel', 'quiet', 'pipe:0'], { stdio: ['pipe', 'ignore', 'ignore'] });
    let settled = false;
    const finish = fn => value => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => {
      child.kill('SIGKILL');
      finish(reject)(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once:true });
    child.once('error', finish(reject));
    child.once('exit', code => {
      if (signal?.aborted) return finish(reject)(abortError());
      code === 0 ? finish(resolve)() : finish(reject)(new Error(`ffplay exited ${code}`));
    });
    child.stdin.on('error', error => {
      if (error?.code !== 'EPIPE') finish(reject)(error);
    });
    child.stdin.end(buffer);
  });
}

export class SpeechQueue {
  constructor({ tts, play = ffplay, prefetch = 2 }) {
    this.tts = tts;
    this.play = play;
    this.prefetch = Math.max(1, prefetch);
    this.queue = [];
    this.active = false;
    this.generation = 0;
    this.current = null;
  }

  enqueue(text) {
    const item = {
      text,
      generation:this.generation,
      controller:new AbortController(),
      state:'queued',
      ready:null
    };
    this.queue.push(item);
    this.#prime();
    void this.#drain();
  }

  interrupt() {
    this.generation++;
    this.current?.controller.abort();
    for (const item of this.queue) item.controller.abort();
    this.queue = [];
  }

  #prime() {
    const prepared = (this.current && this.current.state !== 'queued' ? 1 : 0) + this.queue.filter(item => item.state !== 'queued').length;
    let slots = Math.max(0, this.prefetch - prepared);
    for (const item of this.queue) {
      if (!slots || item.state !== 'queued') continue;
      slots--;
      item.state = 'synthesizing';
      item.ready = Promise.resolve()
        .then(() => this.tts.synthesize(item.text, { signal:item.controller.signal }))
        .then(audio => { item.state = 'ready'; return audio; })
        .catch(error => { item.state = 'failed'; throw error; });
    }
  }

  async #drain() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.queue.length) {
        this.#prime();
        const item = this.queue.shift();
        this.current = item;
        this.#prime();
        try {
          const audio = await item.ready;
          if (item.generation !== this.generation || item.controller.signal.aborted) continue;
          await this.play(audio, { signal:item.controller.signal });
        } catch (error) {
          if (error?.name !== 'AbortError') console.error('[speech]', error.message);
        } finally {
          if (this.current === item) this.current = null;
          this.#prime();
        }
      }
    } finally {
      this.current = null;
      this.active = false;
      if (this.queue.length) void this.#drain();
    }
  }
}
