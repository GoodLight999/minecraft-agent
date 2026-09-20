# Companion runtime

This directory generalizes the working control boundary already proven by this fork:

```text
structured game state
  -> dynamically available candidates
  -> JEV decision
  -> bounded Mineflayer action
  -> observed result
```

The existing speedrun runtime remains untouched. This subtree is an additive development area for turning the agent into a general Minecraft companion.

## Current public-safe runtime

Core:
- `SkillRegistry`: dynamic action candidates instead of a fixed classifier label set.
- `JevLoop`: preserves the rmalde-style state -> candidates -> JEV -> action loop.
- `ActionManager`: bounded execution, timeout and interrupt hook.
- decision freshness checks before an action is allowed to execute.

Companion observation:
- player/master position and distance.
- inventory counts.
- nearby dropped items and hostile threats.
- semantically useful nearby blocks rather than arbitrary nearest block noise.
- arbitrary block names requested by the current shared plan are also observed, leaving room for modded resources and machines.

Initial ordinary-play skills exposed as JEV candidates:
- wait and observe.
- look at / follow / catch up to the human player.
- protect the human from an observed hostile threat.
- collect nearby drops.
- mine observed ore.
- mine an explicit plan target.
- share selected useful inventory.
- harvest mature vanilla crops and replant when possible.

TypeSafe / JEV:
- direct current System One endpoint: `POST https://api.typesafe.ai/v1/systemone`.
- `jev-latest` by default.
- action is a validated Choice over the dynamically available skill IDs.
- the same request also asks optional Noul/Score questions for interruption, speech value and urgency.
- supplemental answers are advisory; an invalid supplemental answer does not become a body-control input.
- Choice labels, confidence and probability distribution are validated before execution.
- stale world decisions are rejected by the loop before action execution.

The action space is intentionally not reduced to a tiny classifier-like label set. JEV receives the actions that are actually available in the current world state and owns the choice.

Dialogue / voice:
- DeepSeek defaults to `deepseek-flash` in explicit non-thinking mode for low-latency director and dialogue work.
- high-level plans are JSON and deliberately avoid micromanaging JEV/Mineflayer movement.
- dialogue uses streaming SSE output; complete Japanese sentence chunks are handed to TTS before the full response finishes.
- starting a new human turn aborts the previous DeepSeek stream and interrupts queued/current speech.
- Irodori uses the OpenAI-compatible `/v1/audio/speech` endpoint.
- each short utterance disables Irodori server-side long-text chunking because chunking is already handled upstream.
- the speech queue prefetches at most two utterances: current plus next, hiding synthesis latency without unbounded GPU concurrency.
- playback currently uses ffplay through stdin and is cancellable.

## Development status

Unit tests require neither external API calls nor a running Minecraft server. The original speedrun implementation has not been modified by these companion commits.

Next:
1. connect this companion runtime to a Mineflayer entry point without replacing the existing speedrun entry point.
2. use Minecraft chat as a temporary human input surface and run director/dialogue alongside the JEV body loop.
3. add microphone STT/VAD and barge-in.
4. expand ordinary-play skills: storage, crafting/smelting, ranching, building and reusable automation.
5. add registry/recipe-driven mod abstractions and low-frequency visual fact extraction for GUI state when Mineflayer cannot observe it directly.
6. add working/episodic/semantic/world memory and reusable skill experience.

Private design notes, credentials, raw logs and cross-thread handoff notes deliberately live outside this public repository.

## Decision backend routing

The body loop depends on a small provider-neutral contract: `decide(state, candidates) -> { action, ...optional metadata }`. System One details are adapter capabilities, not a requirement for every future backend.

Current default order is `experiential,typesafe` when both keys are available. Experiential uses its native `/v1/systemone` Jev lane first; explicit free-tier/quota/auth/grant failures fall through to direct TypeSafe and put the exhausted lane on a cooldown. Ambiguous transport failures do not automatically resend through another provider.

Environment:
- `EXPERIENTIAL_API_KEY` or `EXPLABS_API_KEY`: Experiential hosted gateway key.
- `TYPESAFE_API_KEY`: direct TypeSafe key.
- `DECISION_PROVIDER_ORDER`: comma-separated current provider order, default `experiential,typesafe`.
- `EXPERIENTIAL_FALLBACK_COOLDOWN_MS`: how long to skip an explicitly exhausted/unavailable Experiential lane, default 300000.

`DecisionRouter` revalidates that every returned `action` is one of the live candidates even when an adapter is not System-One-based. Provider capability metadata records optional features such as typed choice, probability distributions, binary probabilities, ordinal scores, maximum choice count and native vision. A future Jev-like or superior decision model therefore needs an adapter, not a rewrite of the Minecraft body loop.


## Running the companion entry point

The original speedrun entry points remain unchanged. The additive companion runtime starts with:

```bash
npm run companion
```

Configuration is environment-variable based; copy names from `companion/.env.example` into your own local environment or secret manager. Do not commit real keys.

Minimum:
- Minecraft server reachable through `MC_HOST` / `MC_PORT`.
- one decision backend key: Experiential or TypeSafe.
- `MASTER_NAME` is recommended. Alternatively, `AUTO_CLAIM_MASTER=1` lets the first non-bot chat sender become the master for local testing.

Optional:
- `DEEPSEEK_API_KEY` enables asynchronous high-level planning and streamed Japanese dialogue.
- `IRODORI_ENABLED=1` enables Irodori audio. Merely setting an Irodori URL does not turn audio on.
- Minecraft chat remains the temporary human input surface and receives text replies unless `CHAT_REPLIES=0`.

The body loop uses a full semantic world observation before the decision, then only a lightweight position/dimension snapshot for stale-decision validation. Movement skills are short segments so control returns to the decision backend frequently instead of locking the bot into multi-second follow/path jobs.
