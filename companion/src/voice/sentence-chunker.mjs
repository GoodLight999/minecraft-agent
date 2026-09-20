export class SentenceChunker {
  constructor({ maxChars = 42 } = {}) {
    this.buffer = '';
    this.maxChars = maxChars;
  }

  push(delta) {
    this.buffer += delta;
    const chunks = [];
    while (this.buffer) {
      const terminal = this.buffer.search(/[。！？!?\n]/u);
      if (terminal >= 0) {
        const piece = this.buffer.slice(0, terminal + 1).trim();
        this.buffer = this.buffer.slice(terminal + 1);
        if (piece) chunks.push(piece);
        continue;
      }
      if (this.buffer.length >= this.maxChars) {
        const window = this.buffer.slice(0, this.maxChars + 1);
        const cut = Math.max(window.lastIndexOf('、'), window.lastIndexOf(','), window.lastIndexOf(' '));
        if (cut >= Math.floor(this.maxChars * 0.55)) {
          const piece = this.buffer.slice(0, cut + 1).trim();
          this.buffer = this.buffer.slice(cut + 1);
          if (piece) chunks.push(piece);
          continue;
        }
      }
      break;
    }
    return chunks;
  }

  flush() {
    const text = this.buffer.trim();
    this.buffer = '';
    return text ? [text] : [];
  }
}
