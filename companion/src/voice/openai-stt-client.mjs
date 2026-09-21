export class OpenAICompatibleSttClient {
  constructor({
    baseUrl=process.env.STT_BASE_URL || 'http://127.0.0.1:8000',
    apiKey=process.env.STT_API_KEY,
    model=process.env.STT_MODEL || 'whisper-1',
    language=process.env.STT_LANGUAGE || 'ja',
    fetchImpl=fetch,
    timeoutMs=Number(process.env.STT_TIMEOUT_MS || 30_000)
  }={}){
    Object.assign(this,{apiKey,model,language,fetch:fetchImpl,timeoutMs});
    this.baseUrl=baseUrl.replace(/\/$/,'');
  }

  async transcribe(wav,{signal}={}){
    const form=new FormData();
    form.set('file',new Blob([wav],{type:'audio/wav'}),'speech.wav');
    form.set('model',this.model);
    if(this.language) form.set('language',this.language);
    const headers={};
    if(this.apiKey) headers.authorization=`Bearer ${this.apiKey}`;
    const timeout=AbortSignal.timeout(this.timeoutMs);
    const combined=signal?AbortSignal.any([signal,timeout]):timeout;
    const response=await this.fetch(`${this.baseUrl}/v1/audio/transcriptions`,{method:'POST',headers,body:form,signal:combined});
    if(!response.ok) throw new Error(`STT HTTP ${response.status}: ${await response.text()}`);
    const data=await response.json();
    const text=typeof data.text==='string'?data.text.trim():'';
    if(!text) return '';
    return text;
  }
}
