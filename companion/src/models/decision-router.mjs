function normalizeMessage(error) {
  return `${error?.providerMessage ?? error?.message ?? ''}`.toLowerCase();
}

export function experientialFreeTierFallback(error) {
  const code = `${error?.code ?? ''}`.toLowerCase();
  const message = normalizeMessage(error);
  if (['invalid_key','insufficient_quota','model_not_granted','verification_required'].includes(code)) return true;
  return [
    'free_limit_reached',
    'free_tier_requires_payment',
    'model_requires_payment',
    'model_requires_purchase',
    'promo_byok_only',
    'key_daily_cap',
    'insufficient_credits'
  ].some(prefix => message.includes(prefix));
}

function validateNormalizedDecision(result, candidates, providerId) {
  const allowed = new Set(candidates.map(c => c.id));
  if (!result || typeof result.action !== 'string' || !allowed.has(result.action)) {
    throw new Error(`Decision provider ${providerId} returned an unknown action`);
  }
  return result;
}

export class DecisionRouter {
  constructor({ providers, fallbackCooldownMs = 300_000, now = Date.now, onRoute = () => {} }) {
    if (!Array.isArray(providers) || !providers.length) throw new TypeError('providers are required');
    this.providers = providers.map(provider => ({ fallbackOn:() => false, capabilities:{}, ...provider }));
    this.fallbackCooldownMs = fallbackCooldownMs;
    this.now = now;
    this.onRoute = onRoute;
    this.blockedUntil = new Map();
  }

  get status() {
    const at = this.now();
    return this.providers.map(p => ({ id:p.id, blockedUntil:this.blockedUntil.get(p.id) ?? 0, available:(this.blockedUntil.get(p.id) ?? 0) <= at, capabilities:p.capabilities }));
  }

  async decide(state, candidates) {
    const at = this.now();
    const failures = [];
    for (const provider of this.providers) {
      const blockedUntil = this.blockedUntil.get(provider.id) ?? 0;
      if (blockedUntil > at) {
        this.onRoute({ type:'skip', provider:provider.id, reason:'cooldown', blockedUntil });
        continue;
      }
      try {
        const result = validateNormalizedDecision(await provider.client.decide(state, candidates), candidates, provider.id);
        this.onRoute({ type:'success', provider:provider.id, result });
        return { ...result, provider:result.provider ?? provider.id, routedBy:'decision-router' };
      } catch (error) {
        failures.push({ provider:provider.id, error });
        if (!provider.fallbackOn(error)) {
          this.onRoute({ type:'error', provider:provider.id, error, fallback:false });
          throw error;
        }
        const cooldownMs = provider.cooldownMs ?? this.fallbackCooldownMs;
        this.blockedUntil.set(provider.id, this.now() + cooldownMs);
        this.onRoute({ type:'error', provider:provider.id, error, fallback:true, cooldownMs });
      }
    }
    const error = new AggregateError(failures.map(x => x.error), 'No decision provider is currently available');
    error.failures = failures;
    throw error;
  }
}

export const SYSTEM_ONE_CAPABILITIES = Object.freeze({
  typedChoice:true,
  probabilityDistribution:true,
  binaryProbability:true,
  ordinalScore:true,
  maxChoices:255,
  vision:false
});
