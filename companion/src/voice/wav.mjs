export function pcm16MonoToWav(pcm,{sampleRate=16000}={}){
  const data=Buffer.isBuffer(pcm)?pcm:Buffer.from(pcm);
  const out=Buffer.alloc(44+data.length);
  out.write('RIFF',0);
  out.writeUInt32LE(36+data.length,4);
  out.write('WAVE',8);
  out.write('fmt ',12);
  out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);
  out.writeUInt32LE(sampleRate,24);
  out.writeUInt32LE(sampleRate*2,28);
  out.writeUInt16LE(2,32);
  out.writeUInt16LE(16,34);
  out.write('data',36);
  out.writeUInt32LE(data.length,40);
  data.copy(out,44);
  return out;
}
