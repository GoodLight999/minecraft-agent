import { pcm16MonoToWav } from './wav.mjs';

export class VoiceInputRuntime {
  constructor({vad,stt,onSpeechStart=()=>{},onTranscript=()=>{},onError=()=>{},sampleRate=16000}){
    Object.assign(this,{vad,stt,onSpeechStart,onTranscript,onError,sampleRate});
    this.generation=0;
    this.activeController=null;
    this.chain=Promise.resolve();
  }

  pushPcm(chunk){
    for(const event of this.vad.push(chunk)) this.#handle(event);
  }

  flush(){
    for(const event of this.vad.flush()) this.#handle(event);
  }

  interrupt(){
    this.generation++;
    this.activeController?.abort();
    this.activeController=null;
  }

  async drain(){
    await this.chain;
  }

  #handle(event){
    if(event.type==='speech-start'){
      this.generation++;
      this.activeController?.abort();
      this.activeController=null;
      try{ this.onSpeechStart(event); }catch(error){ this.onError(error); }
      return;
    }
    if(event.type!=='segment'||!event.audio?.length) return;
    const generation=this.generation;
    this.chain=this.chain.then(async()=>{
      if(generation!==this.generation) return;
      const controller=new AbortController();
      this.activeController=controller;
      try{
        const wav=pcm16MonoToWav(event.audio,{sampleRate:this.sampleRate});
        const text=await this.stt.transcribe(wav,{signal:controller.signal});
        if(controller.signal.aborted||generation!==this.generation||!text) return;
        await this.onTranscript(text,event);
      }catch(error){
        if(error?.name!=='AbortError'&&!controller.signal.aborted) this.onError(error);
      }finally{
        if(this.activeController===controller) this.activeController=null;
      }
    });
  }
}
