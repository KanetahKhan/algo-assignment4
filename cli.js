#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const E=require('./src/engine.js');
const examples=require('./src/scenarios.js');
function main(){
  const args=process.argv.slice(2),options={};
  if(args.includes('--help')){
    console.log('SafeRoute command-line solver\n\nnode cli.js [--scenario scenarios/campus.json] [--deadline 12] [--output result.json]\n\nDefaults to the campus scenario and a 12-minute deadline.');return;
  }
  for(let i=0;i<args.length;i+=2){
    if(!['--scenario','--deadline','--output'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Invalid arguments. Run node cli.js --help.');
    options[args[i].slice(2)]=args[i+1];
  }
  const input=options.scenario?JSON.parse(fs.readFileSync(options.scenario,'utf8').replace(/^\uFEFF/,'')):examples[0];
  const deadline=options.deadline===undefined?12:Number(options.deadline);
  const scenario=E.validate(input),result=E.analyze(scenario,deadline);
  console.log(`${scenario.name}\nDeadline: ${deadline} minutes\nPeople: ${result.total}\nArrived by deadline: ${result.evacuated}\nStill needing evacuation: ${result.remaining}\nIsolated from shelters: ${result.isolatedPopulation}`);
  console.log('Earliest full evacuation: '+(result.completion.status==='complete'?`${result.completion.minutes} minutes`:result.completion.status==='impossible'?'not feasible on this network':'> 60 minutes'));
  console.table(scenario.nodes.filter(n=>n.type==='shelter').map(n=>({shelter:n.name,arrivals:result.shelters[n.id].used,spaces:n.capacity})));
  if(options.output){fs.writeFileSync(options.output,JSON.stringify({scenario,result},null,2)+'\n');console.log(`Wrote ${options.output}`);}
}
try{main();}catch(error){console.error('Error: '+error.message);process.exitCode=1;}
