import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { FfmpegMicSource } from '../src/voice/ffmpeg-mic-source.mjs';

function fakeChild(){
  const child=new EventEmitter();
  child.stdout=new EventEmitter();
  child.killed=false;
  child.kill=()=>{ child.killed=true; child.emit('exit',137); };
  return child;
}

test('intentional microphone stop does not report ffmpeg exit as an error', () => {
  const child=fakeChild();
  const errors=[];
  const source=new FfmpegMicSource({
    inputArgs:['-f','fake','-i','device'],
    spawnImpl:()=>child,
    onError:error=>errors.push(error)
  });
  source.start();
  source.stop();
  assert.equal(child.killed,true);
  assert.deepEqual(errors,[]);
});
