function requestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export class DeepSeekDirector {
  constructor({
    apiKey = process.env.DEEPSEEK_API_KEY,
    baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model = process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    fetchImpl = fetch,
    timeoutMs = 30_000
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  #headers() {
    if (!this.apiKey) throw new Error('DEEPSEEK_API_KEY is missing');
    return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
  }

  async plan(state, { reason = 'periodic-review', userMessage = null, signal } = {}) {
    const schemaExample = {
      objective: 'Stay with the master and help with the current activity',
      activity: 'exploration',
      targets: {},
      building: null,
      constraints: ['Do not wander far from the master'],
      notes: 'Short operational notes only',
      social: { stayNearMaster: true, preferredDistance: 6, maxDistance: 14 }
    };
    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.#headers(),
      signal: requestSignal(signal, this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are the high-level director for a Minecraft companion. The real-time controller is JEV and the body is Mineflayer. Set a useful shared objective without micromanaging movement. Support ordinary Minecraft play: exploration, farming, ranching, mining, building, storage, automation and modded play. Preserve the human player's agency. For a shared building task, building may be null or an object with blueprint platform|wall|pillar|frame, integer anchor {x,y,z}, carried structural material name, facing north|east|south|west, and modest width/depth/height. Do not emit per-block coordinates; the reusable blueprint renderer owns those short steps. Return JSON only in this shape: ${JSON.stringify(schemaExample)}`
          },
          { role: 'user', content: JSON.stringify({ reason, userMessage, state }) }
        ],
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        max_tokens: 900
      })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || `DeepSeek HTTP ${response.status}`);
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('Director returned empty content');
    const plan = JSON.parse(content);
    if (typeof plan.objective !== 'string' || !plan.objective.trim()) throw new Error('Director returned invalid objective');
    return { plan, model: data.model, usage: data.usage };
  }

  async *streamDialogue({ state, userMessage, recentDialogue = [], signal }) {
    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.#headers(),
      signal: requestSignal(signal, this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        thinking: { type: 'disabled' },
        stream: true,
        messages: [
          {
            role: 'system',
            content: 'You are the player\'s Minecraft companion. Speak naturally and briefly in Japanese. You may be quiet. Never narrate every action. Treat shared gameplay and remembered experiences as the center of the conversation.'
          },
          ...recentDialogue,
          { role: 'user', content: JSON.stringify({ message: userMessage, game: state }) }
        ],
        max_tokens: 300
      })
    });
    if (!response.ok) throw new Error(`DeepSeek stream HTTP ${response.status}: ${await response.text()}`);
    if (!response.body) throw new Error('DeepSeek stream has no response body');

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      while (true) {
        const idx = buffer.indexOf('\n\n');
        if (idx < 0) break;
        const packet = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
        for (const line of packet.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          const data = JSON.parse(payload);
          const text = data.choices?.[0]?.delta?.content;
          if (text) yield text;
        }
      }
    }
  }
}
