# Companion runtime nucleus

This directory generalizes the working control boundary already proven by this fork:

```text
structured game state
  -> dynamically available candidates
  -> JEV decision
  -> bounded Mineflayer action
  -> observed result
```

The existing speedrun runtime remains untouched. This subtree is an additive development area for turning the agent into a general Minecraft companion.

Current public-safe nucleus:
- `SkillRegistry`: dynamic action candidates instead of a fixed classifier label set.
- `JevLoop`: preserves the rmalde-style state -> candidates -> JEV -> action loop.
- `ActionManager`: bounded execution, timeout and interrupt hook.
- decision freshness checks before an action is allowed to execute.
- unit tests that require no external API key or Minecraft server.

Next steps are to add rich companion state and ordinary-play skills (follow, wait, protect, mining, farming, inventory sharing), then connect the current TypeSafe System One API, a fast director/dialogue LLM and Irodori-TTS.

Private design notes, credentials, raw logs and cross-thread handoff notes deliberately live outside this public repository.
