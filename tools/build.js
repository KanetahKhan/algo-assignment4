'use strict';
// Build a single HTML file and export the built-in JSON scenarios. No dependencies.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="src/styles.css">',()=>'<style>\n'+fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+'\n</style>');
for(const script of ['engine.js','scenarios.js','app.js']){
  const content=fs.readFileSync(path.join(root,'src',script),'utf8').replace(/<\/script/gi,'<\\/script');
  html=html.replace(`<script src="src/${script}"></script>`,()=>`<script>\n${content}\n</script>`);
}
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','SafeRoute_Evacuation_Simulator.html'),html);
fs.mkdirSync(path.join(root,'scenarios'),{recursive:true});
const names=['campus','damaged-roads','limited-shelters','teaching-example'];
require('../src/scenarios.js').forEach((scenario,i)=>fs.writeFileSync(path.join(root,'scenarios',names[i]+'.json'),JSON.stringify(scenario,null,2)+'\n'));
console.log('Built dist/SafeRoute_Evacuation_Simulator.html and four JSON scenarios.');
