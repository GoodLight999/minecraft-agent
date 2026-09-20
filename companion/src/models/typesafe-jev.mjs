const sleep = ms => new Promise(r => setTimeout(r, ms));
const retryableStatus = status => status === 408 || status === 429 || (status >= 500 && status <= 599);
const validProbability = value => Number.isFinite(value) && value >= 0 && value <= 1;

function validateChoice(answer, candidates) {
  const allowed = new Set(candidates.map(c => c.id));
  if (answer?.type !== 'choice' || typeof answer.choice !== 'string' || !allowed.has(answer.choice)) {
    throw new Error('Invalid JEV Choice response');
  }
  if (!validProbability(answer.confidence)) throw new Error('Invalid JEV Choice confidence');
  const probabilities = answer.probabilities;
  if (!probabilities || Object.keys(probabilities).length !== allowed.size) throw new Error('Invalid JEV Choice probabilities');
  for (const id of allowed) if (!validProbability(probabilities[id])) throw new Error(`Invalid probability for ${id}`);
  const total = Object.values(probabilities).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 0.03) throw new Error('JEV Choice probabilities do not sum to one');
  return answer;
}

function optionalNoul(answer) {
  if (answer == null) return null;
  return answer.type === 'noul' && validProbability(answer.noul) ? answer.noul : null;
}

function optionalScore(answer) {
  if (answer == null) return null;
  return answer.type === 'score' && Number.isFinite(answer.score) ? answer.score : null;
}

export class TypeSafeJevClient {
  constructor({
    apiKey = process.env.TYPESAFE_API_KEY,
    endpoint = process.env.JEV_ENDPOINT || 'https://api.typesafe.ai/v1/systemone',
    model = process.env.JEV_MODEL || 'jev-latest',
    fetchImpl = fetch,
    timeoutMs = 5000,
    retries = 2
  } = {}) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = model;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
  }

  requestFor(state, candidates) {
    const criteria = Object.fromEntries(candidates.map(c => [c.id, c.description]));
    return {
      state,
      model: this.model,
      questions: {
        action: {
          type: 'choice',
          instructions: [
            'Control one Minecraft companion. Choose the single best immediate action from the offered actions.',
            'Respect the current shared objective, current world state, recent failures, survival, and the human player named master.',
            'Do not invent actions. Prefer useful progress over pointless waiting, but staying near or helping the master may be more important than efficiency.'
          ],
          criteria
        },
        interrupt_now: {
          type: 'noul',
          instructions: 'Should the current non-emergency activity be interrupted immediately because the player, companion, or shared work is in danger or requires urgent attention?',
          criteria: {
            true: 'An immediate interruption is warranted.',
            false: 'The current activity can safely continue.'
          }
        },
        speech_value: {
          type: 'noul',
          instructions: 'Would a brief natural spoken remark to the master add social or practical value right now? Ordinary quiet companionship should often be silent.',
          criteria: {
            true: 'Speaking now would be useful, socially meaningful, or naturally funny.',
            false: 'Silence is preferable right now.'
          }
        },
        urgency: {
          type: 'score',
          instructions: 'Rate immediate action urgency for the companion.',
          criteria: ['No urgency', 'Routine action', 'Important', 'Immediate danger']
        }
      }
    };
  }

  async decide(state, candidates) {
    if (!this.apiKey) throw new Error('TYPESAFE_API_KEY is missing');
    if (!candidates.length) throw new Error('JEV requires at least one candidate');
    if (candidates.length > 255) throw new Error(`JEV Choice supports at most 255 candidates; got ${candidates.length}`);
    const body = this.requestFor(state, candidates);
    const startedAt = Date.now();
    let lastError;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetch(this.endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; }
        catch { throw new Error(`TypeSafe returned non-JSON HTTP ${response.status}`); }
        if (!response.ok) {
          const error = new Error(`TypeSafe HTTP ${response.status}: ${data?.detail || data?.error || text}`);
          error.status = response.status;
          throw error;
        }
        const answer = validateChoice(data.answers?.action, candidates);
        return {
          action: answer.choice,
          probabilities: answer.probabilities,
          confidence: answer.confidence,
          interruptProbability: optionalNoul(data.answers?.interrupt_now),
          speechProbability: optionalNoul(data.answers?.speech_value),
          urgency: optionalScore(data.answers?.urgency),
          model: data.model,
          usage: data.usage,
          latencyMs: Date.now() - startedAt,
          raw: data
        };
      } catch (error) {
        lastError = error;
        const retryable = error.name === 'AbortError' || error instanceof TypeError || retryableStatus(error.status);
        if (!retryable || attempt === this.retries) break;
        await sleep(150 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }
}
