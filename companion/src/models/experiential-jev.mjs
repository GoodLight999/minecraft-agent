import { SystemOneDecisionClient } from './system-one-client.mjs';

export class ExperientialJevClient extends SystemOneDecisionClient {
  constructor(options = {}) {
    super({
      providerName: 'experiential',
      apiKey: options.apiKey ?? process.env.EXPERIENTIAL_API_KEY ?? process.env.EXPLABS_API_KEY,
      apiKeyName: 'EXPERIENTIAL_API_KEY or EXPLABS_API_KEY',
      endpoint: options.endpoint ?? process.env.EXPERIENTIAL_JEV_ENDPOINT ?? 'https://api.experientiallabs.ai/v1/systemone',
      model: options.model ?? process.env.EXPERIENTIAL_JEV_MODEL ?? 'jev-latest',
      fetchImpl: options.fetchImpl ?? fetch,
      timeoutMs: options.timeoutMs ?? 5000,
      retries: options.retries ?? 0,
      retryableStatus: () => false
    });
  }
}
