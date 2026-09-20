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
- arbitrary block names requested by the current shared plan are also observed, which leaves room for modded resources and machines.

Initial ordinary-play skills exposed as JEV candidates:
- wait and observe.
- look at / follow / catch up to the human player.
- protect the human from an observed hostile threat.
- collect nearby drops.
- mine observed ore.
- mine an explicit plan target.
- share selected useful inventory.
- harvest mature vanilla crops and replant when possible.

The action space is intentionally not reduced to a tiny classifier-like label set. JEV receives the actions that are actually available in the current world state and owns the choice.

## Development status

Unit tests require neither an external API key nor a running Minecraft server. The original speedrun implementation has not been modified by these companion commits.

Next:
1. connect the current TypeSafe `/v1/systemone` adapter and richer parallel decisions.
2. connect the companion runtime to a Mineflayer bot without replacing the existing speedrun entry point.
3. add a fast director/dialogue LLM.
4. add Irodori-TTS sentence pipelining and speech interruption.
5. expand ordinary-play skills: storage, crafting/smelting, ranching, building and reusable automation.
6. add registry/recipe-driven mod abstractions and low-frequency visual fact extraction for GUI state when Mineflayer cannot observe it directly.

Private design notes, credentials, raw logs and cross-thread handoff notes deliberately live outside this public repository.
