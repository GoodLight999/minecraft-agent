import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { SkillRegistry } from './src/core/skill-registry.mjs';
import { ActionManager } from './src/core/action-manager.mjs';
import { JevLoop } from './src/core/jev-loop.mjs';
import { snapshot, freshnessSnapshot } from './src/runtime/state.mjs';
import { createMineflayerContext } from './src/runtime/mineflayer-context.mjs';
import { AsyncDirector } from './src/runtime/async-director.mjs';
import { registerCompanionSkills } from './src/skills/companion-skills.mjs';
import { registerWorkSkills } from './src/skills/work-skills.mjs';
import { createDecisionRouterFromEnv } from './src/models/create-decision-router.mjs';
import { DeepSeekDirector } from './src/models/deepseek-director.mjs';
import { DialogueRuntime } from './src/voice/dialogue-runtime.mjs';
import { IrodoriClient } from './src/voice/irodori-client.mjs';
import { SpeechQueue } from './src/voice/speech-queue.mjs';

const { pathfinder, Movements, goals } = pathfinderPkg;

const numberEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const botOptions = {
  host: process.env.MC_HOST || '127.0.0.1',
  port: numberEnv('MC_PORT', 25565),
  username: process.env.BOT_NAME || 'MinecraftCompanion'
};
if (process.env.MC_VERSION) botOptions.version = process.env.MC_VERSION;
if (process.env.MC_AUTH) botOptions.auth = process.env.MC_AUTH;

const decisionRouter = createDecisionRouterFromEnv({
  onRoute:event => {
    const suffix = event.error ? `: ${event.error.message}` : '';
    console.log(`[decision-router] ${event.type} ${event.provider ?? ''}${suffix}`);
  }
});

const bot = mineflayer.createBot(botOptions);
bot.loadPlugin(pathfinder);

let masterName = process.env.MASTER_NAME || null;
let stopped = false;
let loopAbort = null;
let periodicTimer = null;
let recent = [];
let dialogueHistory = [];

const defaultPlan = {
  objective: 'Stay available to the master and share ordinary Minecraft play without inventing busywork.',
  activity: 'companionship',
  targets: {},
  constraints: ['Do not wander far from the master without a shared reason.'],
  notes: 'Quiet companionship is allowed.',
  social: { stayNearMaster:true, preferredDistance:6, maxDistance:14 }
};

const directorModel = process.env.DEEPSEEK_API_KEY ? new DeepSeekDirector() : null;
let directorRuntime;

const getState = () => snapshot(bot, {
  masterName,
  plan:directorRuntime?.plan ?? defaultPlan,
  recent,
  activity:directorRuntime?.plan?.activity ?? defaultPlan.activity
});

const context = createMineflayerContext(bot, {
  goals,
  getMasterName:() => masterName
});

const registry = new SkillRegistry();
registerCompanionSkills(registry);
registerWorkSkills(registry);

const actions = new ActionManager({
  stop:async reason => {
    context.stopMovement();
    console.log(`[action] interrupted: ${reason}`);
  },
  defaultTimeoutMs:numberEnv('ACTION_TIMEOUT_MS', 7000)
});

const voiceEnabled = process.env.IRODORI_ENABLED === '1';
const audioSpeech = voiceEnabled
  ? new SpeechQueue({
      tts:new IrodoriClient(),
      prefetch:numberEnv('IRODORI_PREFETCH', 2)
    })
  : null;

const safeChat = text => {
  if (process.env.CHAT_REPLIES === '0' || !text) return;
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact) bot.chat(compact.slice(0, 220));
};

const speech = {
  enqueue(text) {
    safeChat(text);
    audioSpeech?.enqueue(text);
  },
  interrupt() {
    audioSpeech?.interrupt();
  }
};

const dialogue = directorModel
  ? new DialogueRuntime({
      director:directorModel,
      speech,
      getState,
      getRecentDialogue:() => dialogueHistory
    })
  : null;

directorRuntime = new AsyncDirector({
  director:directorModel,
  getState,
  initialPlan:defaultPlan,
  onPlan:({reason,plan}) => console.log(`[director] ${reason}: ${plan.objective}`),
  onError:({reason,error}) => console.error(`[director] ${reason} failed:`, error.message)
});

const pushRecent = entry => {
  recent.push({ at:new Date().toISOString(), ...entry });
  recent = recent.slice(-12);
};

const loop = new JevLoop({
  getState,
  getFreshState:() => freshnessSnapshot(bot),
  registry,
  context,
  jev:decisionRouter,
  actions,
  intervalMs:numberEnv('JEV_INTERVAL_MS', 350),
  onDecision:({iteration,decision,candidates}) => {
    console.log(
      `[JEV ${iteration}] ${decision.provider ?? 'backend'} -> ${decision.action}` +
      ` (${candidates.length} candidates${Number.isFinite(decision.confidence) ? `, confidence ${decision.confidence.toFixed(2)}` : ''})`
    );
  },
  onResult:payload => {
    if (payload.error) {
      console.error('[JEV loop]', payload.error.message);
      pushRecent({ type:'loop-error', error:payload.error.message });
      return;
    }
    const { decision, result } = payload;
    pushRecent({
      type:'action',
      action:decision.action,
      provider:decision.provider,
      ok:result.ok,
      result:result.value ?? result.error,
      durationMs:result.durationMs
    });
  }
});

function acceptMaster(username) {
  if (username === bot.username) return false;
  if (masterName) return username === masterName;
  if (process.env.AUTO_CLAIM_MASTER === '1') {
    masterName = username;
    console.log(`[social] claimed ${username} as master from first chat message`);
    return true;
  }
  console.log(`[social] ignored chat from ${username}; set MASTER_NAME or AUTO_CLAIM_MASTER=1`);
  return false;
}

async function handleMasterMessage(username, message) {
  if (!acceptMaster(username)) return;
  console.log(`[master ${username}] ${message}`);

  void actions.interrupt('master spoke');
  void directorRuntime.request('master-message', { userMessage:message, force:true });

  if (!dialogue) return;
  const reply = await dialogue.respond(message);
  if (!reply) return;

  dialogueHistory.push(
    { role:'user', content:message },
    { role:'assistant', content:reply }
  );
  dialogueHistory = dialogueHistory.slice(-10);
}

bot.on('chat', (username, message) => {
  void handleMasterMessage(username, message).catch(error => console.error('[chat]', error.message));
});

bot.on('whisper', (username, message) => {
  void handleMasterMessage(username, message).catch(error => console.error('[whisper]', error.message));
});

bot.on('death', () => {
  context.stopMovement();
  dialogue?.interrupt();
  pushRecent({ type:'death' });
});

bot.on('kicked', reason => console.error('[minecraft] kicked:', reason));
bot.on('error', error => console.error('[minecraft]', error.message));

function stopRuntime({ quit = true } = {}) {
  if (stopped) return;
  stopped = true;
  if (periodicTimer) clearInterval(periodicTimer);
  loopAbort?.abort();
  directorRuntime.stop();
  dialogue?.interrupt();
  context.stopMovement();
  if (quit) {
    try { bot.quit(); } catch {}
  }
}

bot.once('spawn', async () => {
  try {
    await bot.waitForChunksToLoad();

    const movements = new Movements(bot);
    movements.canDig = true;
    movements.allowParkour = false;
    movements.maxDropDown = 3;
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.thinkTimeout = numberEnv('PATHFINDER_THINK_TIMEOUT_MS', 3000);

    console.log(
      `[companion] spawned as ${bot.username} on ${bot.version}; master=${masterName ?? '(unset)'}; ` +
      `voice=${voiceEnabled ? 'irodori' : 'chat-only'}`
    );

    if (directorModel) void directorRuntime.request('spawn', { force:true });

    const directorIntervalMs = numberEnv('DIRECTOR_INTERVAL_MS', 30_000);
    periodicTimer = setInterval(() => {
      if (directorModel && directorRuntime.periodicDue(directorIntervalMs)) {
        void directorRuntime.request('periodic-review');
      }
    }, 1000);

    loopAbort = new AbortController();
    await loop.start({ signal:loopAbort.signal });
  } catch (error) {
    console.error('[companion] fatal:', error);
    stopRuntime();
    process.exitCode = 1;
  }
});

bot.on('end', () => stopRuntime({ quit:false }));
process.once('SIGINT', () => stopRuntime());
process.once('SIGTERM', () => stopRuntime());
