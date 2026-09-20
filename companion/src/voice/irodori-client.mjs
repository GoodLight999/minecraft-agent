export class IrodoriClient {
  constructor({
    baseUrl = process.env.IRODORI_BASE_URL || 'http://127.0.0.1:8088',
    apiKey = process.env.IRODORI_API_KEY,
    model = process.env.IRODORI_MODEL || 'irodori-tts',
    voice = process.env.IRODORI_VOICE,
    caption = process.env.IRODORI_CAPTION,
    format = process.env.IRODORI_FORMAT || 'wav',
    speed = Number(process.env.IRODORI_SPEED || 1),
    fetchImpl = fetch
  } = {}) {
    Object.assign(this, { apiKey, model, voice, caption, format, speed, fetch: fetchImpl });
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async synthesize(text, { signal } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const body = {
      model: this.model,
      input: text,
      response_format: this.format,
      speed: this.speed,
      irodori: { chunking_enabled: false }
    };
    if (this.voice) body.voice = this.voice;
    if (this.caption) body.irodori.caption = this.caption;
    const response = await this.fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: 'POST', headers, body: JSON.stringify(body), signal
    });
    if (!response.ok) throw new Error(`Irodori HTTP ${response.status}: ${await response.text()}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
