import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateCandidateReport, validateReplayExpectations } from './src/runtime/replay.mjs';
import { createDecisionRouterFromEnv } from './src/models/create-decision-router.mjs';

const args=process.argv.slice(2);
const live=args.includes('--live');
const fileArg=args.find(arg=>!arg.startsWith('--'));
if(!fileArg){
  console.error('Usage: npm run companion:replay -- companion/fixtures/<fixture>.json [--live]');
  process.exit(2);
}

const fixture=JSON.parse(readFileSync(resolve(fileArg),'utf8'));
const report=await generateCandidateReport(fixture.state,fixture.meta);
const failures=validateReplayExpectations(report,fixture.expect);

console.log(JSON.stringify({
  fixture:fixture.name ?? fileArg,
  count:report.count,
  bySkill:report.bySkill,
  candidates:report.candidates.map(c=>({id:c.id,description:c.description}))
},null,2));

if(failures.length){
  console.error('Replay expectation failures:');
  for(const failure of failures) console.error('-',failure);
  process.exitCode=1;
}

if(live && !failures.length){
  const router=createDecisionRouterFromEnv({
    onRoute:event=>console.error('[route]',event.type,event.provider ?? '',event.error?.message ?? '')
  });
  const decision=await router.decide(fixture.state,report.rawCandidates);
  console.log('\nLIVE DECISION');
  console.log(JSON.stringify({
    action:decision.action,
    provider:decision.provider,
    confidence:decision.confidence,
    urgency:decision.urgency,
    interruptProbability:decision.interruptProbability,
    speechProbability:decision.speechProbability,
    probabilities:decision.probabilities
  },null,2));
}
