import { spawn } from 'node:child_process';

function parseArgs(value){
  if(!value) return null;
  const parsed=JSON.parse(value);
  if(!Array.isArray(parsed)||parsed.some(v=>typeof v!=='string')) throw new TypeError('MIC_FFMPEG_ARGS_JSON must be a JSON array of strings');
  return parsed;
}

export class FfmpegMicSource {
  constructor({
    command=process.env.FFMPEG || 'ffmpeg',
    inputArgs=parseArgs(process.env.MIC_FFMPEG_ARGS_JSON),
    sampleRate=16000,
    onData=()=>{},
    onError=()=>{},
    spawnImpl=spawn
  }={}){
    Object.assign(this,{command,inputArgs,sampleRate,onData,onError,spawnImpl});
    this.child=null;
  }

  start(){
    if(this.child) return;
    if(!this.inputArgs?.length) throw new Error('MIC_FFMPEG_ARGS_JSON is required when MIC_ENABLED=1');
    const args=[...this.inputArgs,'-vn','-ac','1','-ar',String(this.sampleRate),'-f','s16le','pipe:1'];
    const child=this.spawnImpl(this.command,args,{stdio:['ignore','pipe','ignore']});
    this.child=child;
    child.stdout.on('data',chunk=>this.onData(chunk));
    child.once('error',error=>{
      const wasActive=this.child===child;
      if(wasActive) this.child=null;
      if(wasActive) this.onError(error);
    });
    child.once('exit',code=>{
      const wasActive=this.child===child;
      if(wasActive) this.child=null;
      if(wasActive&&code!==0&&code!==null) this.onError(new Error(`ffmpeg microphone exited ${code}`));
    });
  }

  stop(){
    const child=this.child;
    this.child=null;
    if(child&&!child.killed) child.kill('SIGKILL');
  }
}
