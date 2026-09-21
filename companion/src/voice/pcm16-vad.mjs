function rmsPcm16(frame) {
  if (!Buffer.isBuffer(frame) || frame.length < 2) return 0;
  let sum = 0, samples = 0;
  for (let i=0; i+1<frame.length; i+=2) {
    const sample = frame.readInt16LE(i) / 32768;
    sum += sample * sample;
    samples++;
  }
  return samples ? Math.sqrt(sum / samples) : 0;
}

export class Pcm16VadSegmenter {
  constructor({
    sampleRate=16000,
    frameMs=20,
    minStartRms=0.018,
    minEndRms=0.010,
    startNoiseRatio=3.0,
    endNoiseRatio=1.8,
    startFrames=3,
    endFrames=18,
    prerollFrames=5,
    minSpeechMs=180,
    maxSegmentMs=15_000,
    initialNoiseRms=0.003
  }={}) {
    this.sampleRate=sampleRate;
    this.frameMs=frameMs;
    this.frameBytes=Math.max(2,Math.round(sampleRate*frameMs/1000)*2);
    this.minStartRms=minStartRms;
    this.minEndRms=minEndRms;
    this.startNoiseRatio=startNoiseRatio;
    this.endNoiseRatio=endNoiseRatio;
    this.startFrames=startFrames;
    this.endFrames=endFrames;
    this.prerollFrames=prerollFrames;
    this.minSpeechFrames=Math.max(1,Math.ceil(minSpeechMs/frameMs));
    this.maxSpeechFrames=Math.max(this.minSpeechFrames,Math.ceil(maxSegmentMs/frameMs));
    this.noiseRms=initialNoiseRms;
    this.remainder=Buffer.alloc(0);
    this.preroll=[];
    this.active=false;
    this.hotFrames=0;
    this.silentFrames=0;
    this.segment=[];
    this.segmentSpeechFrames=0;
  }

  #thresholds() {
    return {
      start:Math.max(this.minStartRms,this.noiseRms*this.startNoiseRatio),
      end:Math.max(this.minEndRms,this.noiseRms*this.endNoiseRatio)
    };
  }

  #updateNoise(rms) {
    const capped=Math.min(rms,Math.max(this.minStartRms,this.noiseRms*2.5));
    this.noiseRms=this.noiseRms*0.97+capped*0.03;
  }

  #finalize(events, reason='silence') {
    if (!this.active) return;
    const audio=Buffer.concat(this.segment);
    const speechFrames=this.segmentSpeechFrames;
    this.active=false;
    this.hotFrames=0;
    this.silentFrames=0;
    this.segment=[];
    this.segmentSpeechFrames=0;
    this.preroll=[];
    if (speechFrames>=this.minSpeechFrames && audio.length) {
      events.push({type:'segment',audio,durationMs:audio.length/2/this.sampleRate*1000,reason});
    }
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk)) chunk=Buffer.from(chunk);
    const data=this.remainder.length ? Buffer.concat([this.remainder,chunk]) : chunk;
    const events=[];
    let offset=0;
    while(offset+this.frameBytes<=data.length){
      const frame=data.subarray(offset,offset+this.frameBytes);
      offset+=this.frameBytes;
      const rms=rmsPcm16(frame);
      const {start,end}=this.#thresholds();

      if(!this.active){
        this.#updateNoise(rms);
        this.preroll.push(frame);
        if(this.preroll.length>this.prerollFrames) this.preroll.shift();
        if(rms>=start) this.hotFrames++; else this.hotFrames=0;
        if(this.hotFrames>=this.startFrames){
          this.active=true;
          this.segment=[...this.preroll];
          this.segmentSpeechFrames=this.hotFrames;
          this.silentFrames=0;
          events.push({type:'speech-start',rms,noiseRms:this.noiseRms});
        }
        continue;
      }

      this.segment.push(frame);
      if(rms>=end){
        this.segmentSpeechFrames++;
        this.silentFrames=0;
      } else {
        this.silentFrames++;
      }
      if(this.segment.length>=this.maxSpeechFrames) this.#finalize(events,'max-duration');
      else if(this.silentFrames>=this.endFrames) this.#finalize(events,'silence');
    }
    this.remainder=data.subarray(offset);
    return events;
  }

  flush() {
    const events=[];
    this.#finalize(events,'flush');
    this.remainder=Buffer.alloc(0);
    this.preroll=[];
    this.hotFrames=0;
    return events;
  }
}

export { rmsPcm16 };
