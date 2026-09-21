import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompanionConfig, trackedPathRisks, trackedContentRisks } from '../src/runtime/config-check.mjs';

test('minimal decision configuration passes hard checks',()=>{
  const result=validateCompanionConfig({MC_PORT:'25565',EXPERIENTIAL_API_KEY:'example'});
  assert.equal(result.ok,true);
  assert.ok(result.checks.some(c=>c.code==='deepseek'&&c.level==='warn'));
});

test('microphone configuration validates local capture arguments',()=>{
  const result=validateCompanionConfig({
    MC_PORT:'25565',TYPESAFE_API_KEY:'example',MIC_ENABLED:'1',MIC_SAMPLE_RATE:'16000',
    MIC_FFMPEG_ARGS_JSON:'["-f","fake","-i","device"]',STT_BASE_URL:'http://127.0.0.1:8000',MASTER_NAME:'Player'
  });
  assert.equal(result.ok,true);
  assert.ok(result.checks.some(c=>c.code==='mic-args'&&c.level==='ok'));
});

test('public-safety helpers flag tracked private material without printing secrets',()=>{
  const pathRisks=trackedPathRisks(['companion/.env.example','.env.local','companion/private/handoff.md']);
  assert.equal(pathRisks.length,2);
  const token='sk'+'-'+'example-secret';
  const contentRisks=trackedContentRisks([{path:'oops.txt',text:`value=${token}`}]);
  assert.deepEqual(contentRisks,[{path:'oops.txt',kind:'OpenAI-style secret prefix'}]);
});
