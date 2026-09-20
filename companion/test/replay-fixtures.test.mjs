import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateCandidateReport, validateReplayExpectations } from '../src/runtime/replay.mjs';

const fixtureNames=['farm-with-danger','storage-smelting-ranching','modded-plan-target'];

for(const name of fixtureNames){
  test(`offline replay fixture: ${name}`, async()=>{
    const fixture=JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`,import.meta.url),'utf8'));
    const report=await generateCandidateReport(fixture.state,fixture.meta);
    const failures=validateReplayExpectations(report,fixture.expect);
    assert.deepEqual(failures,[],failures.join('\n'));
  });
}
