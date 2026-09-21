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
- optional microphone input uses ffmpeg only as a PCM capture boundary; OS/device-specific arguments remain local configuration.
- a lightweight adaptive PCM16 VAD produces speech-start immediately and complete bounded utterance segments after silence.
- speech-start performs barge-in immediately by aborting the active DeepSeek dialogue stream and current/queued TTS before transcription finishes.
- completed utterances are WAV-wrapped and sent through a provider-neutral OpenAI-compatible `/v1/audio/transcriptions` client; local Whisper-compatible servers can use the same boundary.
- a newer detected human utterance invalidates and aborts older queued/in-flight transcription work.

## Development status

Unit tests require neither external API calls nor a running Minecraft server. The original speedrun implementation has not been modified by these companion commits.

Next:
1. live-test the companion entry point in Minecraft, including reusable building blueprints and microphone barge-in, without replacing the existing speedrun entry point.
2. run regression checks against the original speedrun entry point.
3. tune microphone/VAD thresholds and select the preferred OpenAI-compatible STT backend on the target machine.
4. extend reusable building from the initial platform/wall/pillar/frame primitives toward richer saved structures and automation.
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
- `MIC_ENABLED=1` enables local microphone capture. `MIC_FFMPEG_ARGS_JSON` contains the platform/device-specific ffmpeg input arguments and must stay in local environment configuration.
- `STT_BASE_URL` points at any compatible `/v1/audio/transcriptions` service. `STT_API_KEY` is optional for local endpoints and must never be committed when used.
- Minecraft chat remains available as a parallel human input surface and receives text replies unless `CHAT_REPLIES=0`.

The body loop uses a full semantic world observation before the decision, then only a lightweight position/dimension snapshot for stale-decision validation. Movement skills are short segments so control returns to the decision backend frequently instead of locking the bot into multi-second follow/path jobs.


## Microphone STT and barge-in

When microphone input is enabled, ffmpeg emits mono PCM16 into the companion process. The VAD is intentionally local and cheap: it adapts to an idle noise floor, confirms speech over a few frames, emits a speech-start event immediately, then closes the utterance after sustained silence or a maximum duration.

Speech-start is the interruption boundary. It cancels outgoing dialogue generation and audio immediately, so the human does not need to wait for recognition before interrupting the companion. The completed segment is then wrapped as WAV and sent to the configured STT adapter. Only a non-empty recognized transcript enters the same master-message path used by Minecraft chat; body actions are interrupted after a transcript exists rather than for arbitrary microphone noise.

The STT contract is deliberately provider-neutral: `transcribe(wav, { signal }) -> text`. The initial adapter speaks the common OpenAI-compatible transcription protocol, while microphone capture is isolated behind `FfmpegMicSource`. Switching to another STT model or capture mechanism therefore does not require rewriting dialogue, JEV, or Mineflayer control.


## Ordinary-work expansion

The companion now treats ordinary Minecraft work as short, composable decision steps rather than long scripted jobs.

- **Storage:** deposit one conservative nonessential stack into an observed chest/barrel, or inspect an observed container and withdraw only unmet plan targets.
- **Crafting:** use Mineflayer's live registry/recipe system to expose one currently craftable plan target at a time. This is intentionally registry-driven so modded recipe/item names have a path into the same abstraction when Mineflayer can see them.
- **Smelting:** loading fuel/input and collecting output are separate actions. The companion does not wait at a furnace until cooking completes. Normal furnaces, blast furnaces and smokers are filtered by compatible output class.
- **Ranching:** observed cows, sheep, pigs and chickens become individual feed/breeding candidates when the high-level activity calls for ranching. Per-entity cooldowns avoid repeatedly feeding the same mob.
- **Building:** the director selects a reusable named blueprint (`platform`, `wall`, `pillar`, or `frame`) plus anchor, facing, dimensions and material. Only currently supported unfinished cells become JEV candidates, one placement at a time; completed cells are skipped and occupied blueprint cells are never auto-destroyed.

Candidate generation removes clearly impossible or self-defeating options (for example, iron smelting in a smoker, or depositing raw iron/fuel while an unmet iron-ingot target depends on them) while leaving meaningful alternatives to the decision backend.


## Reusable building blueprints

Building deliberately stays split across planning and body control. The high-level plan chooses a small named blueprint and parameters; local code materializes relative cells and JEV chooses among currently executable placements. A selected action performs at most one placement or one short approach segment before the world is observed again.

Blueprints are deterministic and reusable:
- `platform`: width × depth single-layer surface.
- `wall`: width × height plane with facing rotation.
- `pillar`: vertical column.
- `frame`: floor/roof perimeter plus corner posts.

The renderer will not silently excavate a mismatched block. Cells occupied by a different block are reported as blocked and omitted from executable placement candidates. Higher cells whose blueprint cell directly below is unfinished stay locked until that dependency is complete.


## Offline replay harness

Candidate generation can be regression-tested without launching Minecraft:

```bash
npm run companion:replay -- companion/fixtures/farm-with-danger.json
npm run companion:replay -- companion/fixtures/storage-smelting-ranching.json
npm run companion:replay -- companion/fixtures/modded-plan-target.json
```

Each fixture stores a structured world state plus candidate expectations such as required/forbidden action prefixes and a maximum candidate count. This catches missing capabilities and accidental candidate explosions before live-game testing.

Appending `--live` sends the fixture's generated candidates to the currently configured decision router:

```bash
npm run companion:replay -- companion/fixtures/farm-with-danger.json --live
```

Live replay uses real provider quota/credits according to the configured Experiential/TypeSafe routing. Plain replay is fully offline and needs no API key.

The modded fixture intentionally uses `create:zinc_ore`: explicit plan targets remain visible and become concrete mining candidates even when their registry names were never hardcoded into the companion.
