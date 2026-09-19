'use strict';
// Optional DOM behavior checks. Install jsdom separately; no browser is launched.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require(process.env.SAFEROUTE_JSDOM_MODULE||'jsdom');
const html=fs.readFileSync(path.join(__dirname,'../dist/SafeRoute_Evacuation_Simulator.html'),'utf8');
async function setup(){
  const errors=[],downloads=[],blobs=new Map();let counter=0;
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,
    beforeParse(window){
      window.Blob=Blob;window.matchMedia=()=>({matches:true});
      window.URL.createObjectURL=blob=>{const key='blob:test-'+counter++;blobs.set(key,blob);return key;};
      window.URL.revokeObjectURL=key=>blobs.delete(key);
      window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)});};
      if(!window.HTMLDialogElement.prototype.showModal)window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
      if(!window.HTMLDialogElement.prototype.close)window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
      window.HTMLElement.prototype.scrollIntoView=function(){};
    }});
  const w=dom.window,$=id=>w.document.getElementById(id);
  const event=(id,type)=>$(id).dispatchEvent(new w.Event(type,{bubbles:true,cancelable:true}));
  const input=(id,value,type='change')=>{$(id).value=value;event(id,type);};
  async function ready(){for(let i=0;i<100;i++){if(!$('run-button').disabled&&$('metric-evacuated').textContent!=='—')return;await new Promise(r=>setTimeout(r,10));}throw new Error('Calculation timed out: '+$('message').textContent+' '+errors.join('; '));}
  await ready();return {dom,w,$,event,input,ready,errors,downloads};
}

test('standalone app initializes with the verified campus result and zero runtime errors',async()=>{
  const a=await setup();try{
    assert.equal(a.$('metric-evacuated').textContent,'176');assert.equal(a.$('metric-completion').textContent,'13 min');
    assert.equal(a.w.document.querySelectorAll('#network-map [data-kind="node"]').length,8);
    assert.equal(a.w.document.querySelectorAll('#network-map [data-kind="road"]').length,10);
    assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
test('closing a road invalidates stale results, then recalculates and resets',async()=>{
  const a=await setup();try{
    a.$('road-blocked').checked=true;a.event('road-blocked','change');
    assert.equal(a.$('metric-evacuated').textContent,'—');assert.equal(a.$('play-button').disabled,true);
    a.$('run-button').click();await a.ready();assert.ok(Number(a.$('metric-evacuated').textContent)<176);
    a.$('reset-button').click();await a.ready();assert.equal(a.$('metric-evacuated').textContent,'176');assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
test('scenario switching, timeline scrubbing, and CSV/JSON exports use current data',async()=>{
  const a=await setup();try{
    a.input('scenario-select','3');await a.ready();assert.equal(a.$('metric-evacuated').textContent,'6');assert.equal(a.$('metric-completion').textContent,'5 min');
    a.input('timeline','3','input');assert.equal(a.$('safe-caption').textContent,'6 people at shelters');
    a.$('download-results').click();assert.equal(a.downloads[0].name,'saferoute-evacuation-schedule.csv');
    const csv=await a.downloads[0].blob.text();assert.match(csv,/"3","Residential block","Safe assembly area","2"/);
    a.$('export-button').click();const json=JSON.parse(await a.downloads[1].blob.text());assert.equal(json.nodes[0].population,10);
    a.input('scenario-select','2');await a.ready();assert.equal(a.$('metric-evacuated').textContent,'120');assert.equal(a.$('metric-completion').textContent,'Not feasible');
    assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
test('adding/editing/deleting a location updates the graph without stale plans',async()=>{
  const a=await setup();try{
    a.$('tab-editor').click();assert.equal(a.$('panel-editor').hidden,false);
    a.$('add-node').click();a.$('edit-name').value='Extra shelter';a.input('edit-type','shelter');a.$('edit-capacity').value='20';a.event('edit-form','submit');
    assert.match(a.$('network-chip').textContent,/9 locations/);assert.equal(a.$('metric-evacuated').textContent,'—');
    const remove=a.w.document.querySelector('[data-delete-node="N1"]');assert.ok(remove);remove.click();assert.match(a.$('network-chip').textContent,/8 locations/);
    a.$('run-button').click();await a.ready();assert.equal(a.$('metric-evacuated').textContent,'176');assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
test('road editor rejects self-loops and accepts a new valid road',async()=>{
  const a=await setup();try{
    a.$('tab-editor').click();a.$('add-road').click();a.$('edit-to').value=a.$('edit-from').value;a.event('edit-form','submit');
    assert.match(a.$('dialog-error').textContent,/two different/);a.$('edit-to').value='S1';a.event('edit-form','submit');
    assert.match(a.$('network-chip').textContent,/11 roads/);assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
test('invalid road input is rejected without corrupting the scenario',async()=>{
  const a=await setup();try{
    a.input('road-time','-1');assert.match(a.$('message').textContent,/integer/);assert.equal(a.$('road-time').value,'2');
    assert.equal(a.$('metric-evacuated').textContent,'176');assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
test('JSON import validates input, and an imported scenario can be selected again',async()=>{
  const a=await setup();try{
    const file={size:30,text:async()=>JSON.stringify({nodes:[],roads:[]})};
    Object.defineProperty(a.$('import-file'),'files',{value:[file],configurable:true});a.event('import-file','change');await new Promise(r=>setTimeout(r,20));
    assert.match(a.$('message').textContent,/Import failed/);assert.equal(a.$('metric-population').textContent,'180');
    const scenario=require('../src/scenarios.js')[3];const valid={size:900,text:async()=>JSON.stringify(scenario)};
    Object.defineProperty(a.$('import-file'),'files',{value:[valid],configurable:true});a.event('import-file','change');await new Promise(r=>setTimeout(r,30));await a.ready();
    assert.equal(a.$('metric-population').textContent,'10');a.input('scenario-select','0');await a.ready();a.input('scenario-select','custom');await a.ready();
    assert.equal(a.$('metric-population').textContent,'10');assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
test('deadline edits cancel the displayed plan and playback remains consistent',async()=>{
  const a=await setup();try{
    a.input('deadline','1','input');assert.equal(a.$('metric-evacuated').textContent,'—');
    a.$('run-button').click();await a.ready();assert.equal(a.$('metric-evacuated').textContent,'0');
    a.$('play-button').click();assert.equal(a.$('play-button').getAttribute('aria-label'),'Pause evacuation');a.$('play-button').click();assert.equal(a.$('play-button').getAttribute('aria-label'),'Play evacuation');
    assert.deepEqual(a.errors,[]);
  }finally{a.dom.window.close();}
});
