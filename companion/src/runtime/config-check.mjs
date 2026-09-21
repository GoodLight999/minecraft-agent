const bool = value => value === '1';

function urlCheck(value, fallback, name, checks) {
  const raw = value || fallback;
  try {
    const url = new URL(raw);
    if (!['http:','https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    checks.push({level:'ok',code:name,message:`${name}=${url.origin}`});
  } catch {
    checks.push({level:'error',code:name,message:`${name} must be an http(s) URL`});
  }
}

function parseMicArgs(value) {
  if (!value) return null;
  try {
    const parsed=JSON.parse(value);
    return Array.isArray(parsed) && parsed.length && parsed.every(v=>typeof v==='string') ? parsed : null;
  } catch { return null; }
}

export function validateCompanionConfig(env = {}) {
  const checks=[];
  const port=Number(env.MC_PORT || 25565);
  if(Number.isInteger(port)&&port>0&&port<=65535) checks.push({level:'ok',code:'mc-port',message:`MC_PORT=${port}`});
  else checks.push({level:'error',code:'mc-port',message:'MC_PORT must be an integer from 1 to 65535'});

  if(env.EXPERIENTIAL_API_KEY||env.EXPLABS_API_KEY||env.TYPESAFE_API_KEY) checks.push({level:'ok',code:'decision-key',message:'at least one decision backend key is configured'});
  else checks.push({level:'error',code:'decision-key',message:'configure EXPERIENTIAL_API_KEY/EXPLABS_API_KEY or TYPESAFE_API_KEY'});

  if(env.DEEPSEEK_API_KEY) checks.push({level:'ok',code:'deepseek',message:'DeepSeek director/dialogue enabled'});
  else checks.push({level:'warn',code:'deepseek',message:'DEEPSEEK_API_KEY is unset; high-level planning/dialogue will be disabled'});

  if(bool(env.IRODORI_ENABLED)) {
    urlCheck(env.IRODORI_BASE_URL,'http://127.0.0.1:8088','IRODORI_BASE_URL',checks);
    if(!env.DEEPSEEK_API_KEY) checks.push({level:'warn',code:'irodori-without-dialogue',message:'Irodori is enabled but no dialogue model is configured'});
  }

  if(bool(env.MIC_ENABLED)) {
    const rate=Number(env.MIC_SAMPLE_RATE||16000);
    if(Number.isInteger(rate)&&rate>=8000&&rate<=48000) checks.push({level:'ok',code:'mic-rate',message:`MIC_SAMPLE_RATE=${rate}`});
    else checks.push({level:'error',code:'mic-rate',message:'MIC_SAMPLE_RATE must be an integer from 8000 to 48000'});
    if(parseMicArgs(env.MIC_FFMPEG_ARGS_JSON)) checks.push({level:'ok',code:'mic-args',message:'MIC_FFMPEG_ARGS_JSON is a non-empty string array'});
    else checks.push({level:'error',code:'mic-args',message:'MIC_FFMPEG_ARGS_JSON must be a non-empty JSON array of ffmpeg argument strings when MIC_ENABLED=1'});
    urlCheck(env.STT_BASE_URL,'http://127.0.0.1:8000','STT_BASE_URL',checks);
    if(!String(env.STT_MODEL||'whisper-1').trim()) checks.push({level:'error',code:'stt-model',message:'STT_MODEL must not be empty'});
    if(!env.MASTER_NAME) checks.push({level:'warn',code:'mic-master',message:'MASTER_NAME is unset; microphone input cannot identify which in-world player should be followed/protected'});
  }

  return {ok:!checks.some(c=>c.level==='error'),checks};
}

export function trackedPathRisks(paths) {
  const risks=[];
  for(const path of paths){
    const lower=path.toLowerCase();
    const base=lower.split('/').at(-1);
    if((base==='.env'||base.startsWith('.env.'))&&base!=='.env.example') risks.push({path,kind:'environment file'});
    if(/\.(pem|p12|pfx|jks|keystore)$/.test(base)||base.endsWith('.key')) risks.push({path,kind:'private key/certificate'});
    if(/^id_(rsa|ed25519)/.test(base)) risks.push({path,kind:'private SSH key'});
    if(lower.includes('/secrets/')||lower.startsWith('secrets/')) risks.push({path,kind:'secrets directory'});
    if(lower.includes('/credentials/')||lower.startsWith('credentials/')) risks.push({path,kind:'credentials directory'});
    if(lower.startsWith('companion/private/')||lower.startsWith('companion/handoff/')||lower.startsWith('companion/local-notes/')) risks.push({path,kind:'private companion material'});
    if(base.endsWith('.private.md')||base.endsWith('.local.md')) risks.push({path,kind:'private/local note'});
  }
  return risks;
}

const CONTENT_PATTERNS = [
  {kind:'private key block',test:text=>text.includes('BEGIN '+'PRIVATE KEY')},
  {kind:'OpenAI-style secret prefix',test:text=>text.includes('sk'+'-')},
  {kind:'GitHub classic token prefix',test:text=>text.includes('ghp'+'_')},
  {kind:'GitHub fine-grained token prefix',test:text=>text.includes('github'+'_pat_')},
  {kind:'Notion page URL',test:text=>text.includes('app.'+'notion.com/p/')},
  {kind:'AWS access key shape',test:text=>/AKIA[A-Z0-9]{16}/.test(text)}
];

export function trackedContentRisks(entries) {
  const risks=[];
  for(const {path,text} of entries){
    for(const pattern of CONTENT_PATTERNS) if(pattern.test(text)) risks.push({path,kind:pattern.kind});
  }
  return risks;
}
