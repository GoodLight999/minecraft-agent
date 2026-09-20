import { SentenceChunker } from './sentence-chunker.mjs';

export class DialogueRuntime {
  constructor({ director, speech, getState, getRecentDialogue = () => [] }) {
    Object.assign(this, { director, speech, getState, getRecentDialogue });
    this.activeTurn = 0;
    this.controller = null;
  }

  interrupt() {
    this.activeTurn++;
    this.controller?.abort();
    this.controller = null;
    this.speech.interrupt();
  }

  async respond(userMessage) {
    const turn = ++this.activeTurn;
    this.controller?.abort();
    this.speech.interrupt();
    const controller = new AbortController();
    this.controller = controller;
    const chunker = new SentenceChunker();
    let full = '';
    try {
      for await (const delta of this.director.streamDialogue({
        state: this.getState(),
        userMessage,
        recentDialogue: this.getRecentDialogue(),
        signal: controller.signal
      })) {
        if (turn !== this.activeTurn) return null;
        full += delta;
        for (const sentence of chunker.push(delta)) this.speech.enqueue(sentence);
      }
      if (turn !== this.activeTurn) return null;
      for (const tail of chunker.flush()) this.speech.enqueue(tail);
      return full;
    } catch (error) {
      if (controller.signal.aborted || turn !== this.activeTurn) return null;
      throw error;
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
}
