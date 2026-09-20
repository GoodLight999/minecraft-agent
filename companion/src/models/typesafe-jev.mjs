import { SystemOneDecisionClient } from './system-one-client.mjs';

export class TypeSafeJevClient extends SystemOneDecisionClient {
  constructor(options = {}) {
    super({
      providerName: 'typesafe',
      apiKey: options.apiKey ?? process.env.TYPESAFE_API_KEY,
      apiKeyName: 'TYPESAFE_API_KEY',
      endpoint: options.endpoint ?? process.env.TYPESAFE_JEV_ENDPOINT ?? process.env.JEV_ENDPOINT ?? 'https://api.typesafe.ai/v1/systemone',
      model: options.model ?? process.env.TYPESAFE_JEV_MODEL ?? process.env.JEV_MODEL ?? 'jev-latest',
      fetchImpl: options.fetchImpl ?? fetch,
      timeoutMs: options.timeoutMs ?? 5000,
      retries: options.retries ?? 2,
      retryableStatus: options.retryableStatus
    });
  }
}
