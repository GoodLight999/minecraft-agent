import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateCompanionConfig, trackedPathRisks, trackedContentRisks } from './src/runtime/config-check.mjs';

const require=createRequire(import.meta.url);
const publicOnly=process.argv.includes('--public-only');
const checks=[];
const add=(level,code,message)=>checks.push({level,code,message});

if(!publicOnly){
  for(const [name,value] of [
    ['fetch',globalThis.fetch],['FormData',globalThis.FormData],['Blob',globalThis.Blob],
    ['AbortController',globalThis.AbortController],['AbortSignal.any',AbortSignal.any],['AbortSignal.timeout',AbortSignal.timeout]
  ]) add(typeof value==='function'?'ok':'error',`node-${name}`,typeof value==='function'?`${name} available`:`${name} unavailable; use a current Node.js runtime`);

  for(const dep of ['mineflayer','mineflayer-pathfinder','vec3']){
    try{ require.resolve(dep); add('ok',`dep-${dep}`,`${dep} resolved`); }
    catch{ add('error',`dep-${dep}`,`${dep} is not installed; run npm install`); }
  }

  for(const item of validateCompanionConfig(process.env).checks) checks.push(item);

  const commandCheck=(command,label)=>{
    const result=spawnSync(command,['-version'],{stdio:'ignore'});
    if(result.error) add('error',`cmd-${label}`,`${command} is unavailable`);
    else add('ok',`cmd-${label}`,`${command} is available`);
  };
  if(process.env.MIC_ENABLED==='1') commandCheck(process.env.FFMPEG||'ffmpeg','ffmpeg');
  if(process.env.IRODORI_ENABLED==='1') commandCheck(process.env.FFPLAY||'ffplay','ffplay');
}

try{
  const raw=execFileSync('git',['ls-files','-z'],{encoding:'utf8'});
  const paths=raw.split('\0').filter(Boolean);
  for(const risk of trackedPathRisks(paths)) add('error','public-path',`${risk.path}: ${risk.kind}`);
  const entries=[];
  for(const path of paths){
    try{
      const stat=statSync(path);
      if(!stat.isFile()||stat.size>1_000_000) continue;
      const buffer=readFileSync(path);
      if(buffer.includes(0)) continue;
      entries.push({path,text:buffer.toString('utf8')});
    }catch{}
  }
  for(const risk of trackedContentRisks(entries)) add('error','public-content',`${risk.path}: ${risk.kind}`);
  if(!checks.some(c=>c.code==='public-path'||c.code==='public-content')) add('ok','public-safety','tracked text files passed the lightweight public-safety scan');
}catch(error){
  add('warn','git-scan',`tracked-file safety scan skipped: ${error.message}`);
}

for(const item of checks){
  const prefix=item.level==='ok'?'OK':item.level==='warn'?'WARN':'ERROR';
  console.log(`[${prefix}] ${item.message}`);
}
const errors=checks.filter(c=>c.level==='error').length;
const warnings=checks.filter(c=>c.level==='warn').length;
console.log(`\n${publicOnly?'public safety check':'companion doctor'}: ${errors} error(s), ${warnings} warning(s)`);
if(errors) process.exitCode=1;
