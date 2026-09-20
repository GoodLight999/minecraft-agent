import { DecisionRouter, SYSTEM_ONE_CAPABILITIES, experientialFreeTierFallback } from './decision-router.mjs';
import { ExperientialJevClient } from './experiential-jev.mjs';
import { TypeSafeJevClient } from './typesafe-jev.mjs';

export function createDecisionRouterFromEnv({ fetchImpl = fetch, onRoute = () => {} } = {}) {
  const order = (process.env.DECISION_PROVIDER_ORDER || 'experiential,typesafe')
    .split(',').map(x => x.trim()).filter(Boolean);
  const providers = [];

  for (const id of order) {
    if (id === 'experiential') {
      const apiKey = process.env.EXPERIENTIAL_API_KEY ?? process.env.EXPLABS_API_KEY;
      if (!apiKey) continue;
      providers.push({
        id,
        client:new ExperientialJevClient({apiKey,fetchImpl}),
        capabilities:SYSTEM_ONE_CAPABILITIES,
        fallbackOn:experientialFreeTierFallback,
        cooldownMs:Number(process.env.EXPERIENTIAL_FALLBACK_COOLDOWN_MS || 300_000)
      });
      continue;
    }
    if (id === 'typesafe') {
      const apiKey = process.env.TYPESAFE_API_KEY;
      if (!apiKey) continue;
      providers.push({
        id,
        client:new TypeSafeJevClient({apiKey,fetchImpl}),
        capabilities:SYSTEM_ONE_CAPABILITIES
      });
      continue;
    }
    throw new Error(`Unknown decision provider in DECISION_PROVIDER_ORDER: ${id}`);
  }

  if (!providers.length) throw new Error('No decision provider configured. Set EXPERIENTIAL_API_KEY/EXPLABS_API_KEY or TYPESAFE_API_KEY.');
  return new DecisionRouter({providers,onRoute});
}
