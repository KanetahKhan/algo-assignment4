'use strict';
// Build the single-file HTML copies, refresh the C++ source shown in walkthrough.html,
// and export the built-in JSON scenarios. No dependencies.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const inlineScripts=(html,scripts)=>{
  for(const script of scripts){
    const content=read('src/'+script).replace(/<\/script/gi,'<\\/script');
    html=html.replace(`<script src="src/${script}"></script>`,()=>`<script>\n${content}\n</script>`);
  }
  return html;
};
fs.mkdirSync(path.join(root,'dist'),{recursive:true});

// 1. Simulator
let html=read('index.html');
html=html.replace('<link rel="stylesheet" href="src/styles.css">',()=>'<style>\n'+read('src/styles.css')+'\n</style>');
html=inlineScripts(html,['saferoute_wasm.js','engine.js','scenarios.js','app.js']).replace(/href="walkthrough\.html"/g,'href="SafeRoute_Code_Walkthrough.html"');
fs.writeFileSync(path.join(root,'dist','SafeRoute_Evacuation_Simulator.html'),html);

// 2. Code walkthrough: embed the current cpp/algorithms.cpp so the page always shows the real source.
const source=read('cpp/algorithms.cpp').replace(/\r/g,'');
if(/<\/script/i.test(source))throw new Error('cpp/algorithms.cpp must not contain "</script".');
let walk=read('walkthrough.html').replace(/(<script id="cpp-source" type="text\/plain">)[\s\S]*?(<\/script>)/,(_,open,close)=>`${open}\n${source}${close}`);
fs.writeFileSync(path.join(root,'walkthrough.html'),walk);
walk=inlineScripts(walk,['saferoute_wasm.js','engine.js','scenarios.js']).replace(/href="index\.html"/g,'href="SafeRoute_Evacuation_Simulator.html"');
fs.writeFileSync(path.join(root,'dist','SafeRoute_Code_Walkthrough.html'),walk);

// 3. Scenario files
fs.mkdirSync(path.join(root,'scenarios'),{recursive:true});
const names=['campus','damaged-roads','limited-shelters','teaching-example'];
require('../src/scenarios.js').forEach((scenario,i)=>fs.writeFileSync(path.join(root,'scenarios',names[i]+'.json'),JSON.stringify(scenario,null,2)+'\n'));
console.log('Built dist/SafeRoute_Evacuation_Simulator.html, dist/SafeRoute_Code_Walkthrough.html and four JSON scenarios.');
