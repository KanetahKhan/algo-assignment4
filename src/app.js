(function () {
  'use strict';
  const E = window.Evacuation, $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const state = { scenario: E.validate(clone(window.EVACUATION_SCENARIOS[0])), base: null,
    selection: { kind: 'road', id: 'R6' }, origin: 'A', deadline: 12, result: null, baseline: null,
    time: 0, playing: false, lastFrame: 0, animation: 0, worker: null, workerURL: null, version: 0, pending: false, editing: null, imported: null };
  state.base = clone(state.scenario);
  const name = (id) => state.scenario.nodes.find((n) => n.id === id)?.name || id;
  const total = () => state.scenario.nodes.reduce((s, n) => s + n.population, 0);

  function message(text, error = false) {
    $('message').textContent = text; $('message').hidden = !text; $('message').className = error ? 'error' : '';
  }
  function stopWorker() {
    if (state.worker) state.worker.terminate();
    if (state.workerURL) URL.revokeObjectURL(state.workerURL);
    state.worker = null; state.workerURL = null;
  }
  function pause() {
    state.playing = false; cancelAnimationFrame(state.animation);
    $('play-button').textContent = '▶'; $('play-button').setAttribute('aria-label', 'Play evacuation');
  }
  function invalidate(text = 'Network updated. Calculate evacuation to generate a new plan.') {
    state.version++; stopWorker(); pause(); state.result = null; state.baseline = null; state.pending = false; state.time = 0;
    $('run-button').disabled = false; $('run-button').textContent = '↗ Calculate evacuation';
    render(); if (text) message(text);
  }
  function setScenario(scenario, base = scenario) {
    state.scenario = E.validate(clone(scenario)); state.base = E.validate(clone(base));
    state.origin = state.scenario.nodes.find((n) => n.type === 'origin')?.id || null;
    state.selection = state.scenario.roads.length ? {kind:'road',id:state.scenario.roads[Math.min(5,state.scenario.roads.length-1)].id} : {kind:'node',id:state.scenario.nodes[0].id};
    invalidate(''); run();
  }
  function completionText(c) {
    return c.status === 'complete' ? `${c.minutes} min` : c.status === 'impossible' ? 'Not feasible' : '> 60 min';
  }
  function renderMetrics() {
    const people = total(), origins = state.scenario.nodes.filter((n) => n.type === 'origin').length, r = state.result;
    $('metric-population').textContent = fmt(people);
    $('population-caption').textContent = `Across ${origins} residential ${origins === 1 ? 'area' : 'areas'}`;
    $('metric-evacuated').textContent = r ? fmt(r.evacuated) : '—';
    $('evacuated-caption').textContent = r ? `${people ? Math.round(100*r.evacuated/people) : 100}% of people · within ${state.deadline} minutes` : 'Calculate to see the new plan';
    $('metric-remaining').textContent = r ? fmt(r.remaining) : '—';
    $('remaining-caption').textContent = r ? `${fmt(r.isolatedPopulation)} people have no route to an open shelter` : 'Includes waiting and isolated people';
    $('metric-completion').textContent = r ? completionText(r.completion) : '—';
    $('metric-completion').style.fontSize = r?.completion.status === 'impossible' ? '25px' : '';
    $('completion-caption').textContent = r?.completion.status === 'impossible' ? `At most ${fmt(r.eventual)} can be sheltered on this network` :
      r?.completion.status === 'beyond_limit' ? 'Possible eventually; exceeds the 60-minute search' : 'Minimum feasible time under this model';
    $('play-button').disabled = !r; $('timeline').disabled = !r; $('download-results').disabled = !r;
  }

  function roadGeometry(road) {
    const a = state.scenario.nodes.find((n) => n.id === road.from), b = state.scenario.nodes.find((n) => n.id === road.to);
    const siblings = state.scenario.roads.filter((r) => [r.from,r.to].sort().join('|') === [road.from,road.to].sort().join('|'));
    const index = siblings.findIndex((r) => r.id === road.id), offset = (index-(siblings.length-1)/2)*54;
    // Keep the offset orientation canonical, even if a parallel edge is reversed.
    const sign = road.from < road.to ? 1 : -1, dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
    return {a,b,c:{x:(a.x+b.x)/2-dy/length*offset*sign,y:(a.y+b.y)/2+dx/length*offset*sign}};
  }
  function point(g,t) { return {x:(1-t)*(1-t)*g.a.x+2*(1-t)*t*g.c.x+t*t*g.b.x,y:(1-t)*(1-t)*g.a.y+2*(1-t)*t*g.c.y+t*t*g.b.y}; }
  function selectedRoutes() { return state.origin ? E.dijkstra(state.scenario,state.origin) : null; }
  function renderMap() {
    const routes=selectedRoutes(), nearest=routes?.shelters.find((s)=>s.time!==null), routeRoads=new Set(nearest?.roads||[]);
    let svg = '<defs><pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#d9e0cf"/></pattern></defs><rect width="900" height="500" fill="url(#grid)"/>';
    svg += '<g fill="#f0f3e9" stroke="#e9eee0"><rect x="160" y="175" width="87" height="93" rx="14"/><rect x="444" y="73" width="88" height="67" rx="13"/><rect x="505" y="335" width="112" height="95" rx="16"/><rect x="715" y="181" width="92" height="92" rx="22"/></g><g fill="#e6eddd"><circle cx="735" cy="215" r="11"/><circle cx="782" cy="235" r="16"/><circle cx="755" cy="253" r="10"/></g>';
    svg += '<text x="74" y="456" fill="#b4beac" font-size="9" letter-spacing="2">RESIDENTIAL DISTRICT</text><text x="680" y="458" fill="#b4beac" font-size="9" letter-spacing="2">ASSEMBLY AREAS</text>';
    for (const r of state.scenario.roads) {
      const g=roadGeometry(r),mid=point(g,.5),selected=state.selection?.kind==='road'&&state.selection.id===r.id;
      const color=r.blocked?'#c86a60':selected?'#d1874d':routeRoads.has(r.id)?'#548c70':'#bcc8b1';
      const path=`M ${g.a.x} ${g.a.y} Q ${g.c.x} ${g.c.y} ${g.b.x} ${g.b.y}`;
      svg+=`<g data-kind="road" data-id="${escape(r.id)}" tabindex="0" role="button" aria-label="Road ${escape(r.id)}, ${escape(name(r.from))} to ${escape(name(r.to))}, ${r.blocked?'closed':`${r.time} minutes, ${r.capacity} people per minute`}"><path d="${path}" fill="none" stroke="#f9faf6" stroke-width="11"/><path d="${path}" fill="none" stroke="${color}" stroke-width="${selected?4:3}" ${r.blocked?'stroke-dasharray="7 7"':''}/><path class="road-hit" d="${path}" fill="none" stroke="transparent" stroke-width="23"/>`;
      if(!r.bidirectional){const p=point(g,.72),q=point(g,.73),angle=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI;svg+=`<path d="M -5 -4 L 4 0 L -5 4" fill="none" stroke="${color}" stroke-width="2" transform="translate(${p.x},${p.y}) rotate(${angle})" pointer-events="none"/>`;}
      svg+=`<rect x="${mid.x-34}" y="${mid.y-11}" width="68" height="21" rx="5" fill="${selected?'#fff1df':'#ffffff'}" stroke="${selected?'#edd1af':'#e9ede2'}" pointer-events="none"/><text x="${mid.x}" y="${mid.y+3}" text-anchor="middle" class="road-label">${r.blocked?'CLOSED':`${r.time}m · ${r.capacity}/min`}</text></g>`;
    }
    for(const n of state.scenario.nodes){
      const selected=state.selection?.kind==='node'&&state.selection.id===n.id,origin=n.type==='origin',shelter=n.type==='shelter';
      svg+=`<g class="node" data-kind="node" data-id="${escape(n.id)}" tabindex="0" role="button" aria-label="${escape(n.name)}, ${n.type}" transform="translate(${n.x},${n.y})">`;
      if(selected)svg+='<circle r="31" fill="none" stroke="#87a68b" stroke-dasharray="3 3"/>';
      if(shelter)svg+='<rect x="-24" y="-24" width="48" height="48" rx="14" fill="#e3eee2" stroke="#fff" stroke-width="4"/><rect x="-17" y="-17" width="34" height="34" rx="9" fill="#376c52"/>';
      else svg+=`<circle r="${origin?24:14}" fill="${origin?'#f9e9d9':'#edf1e8'}" stroke="#fff" stroke-width="4"/><circle r="${origin?17:8}" fill="${origin?'#df8750':'#a9bba2'}"/>`;
      svg+=`<text text-anchor="middle" y="4" fill="${origin||shelter?'#fff':'#fff'}" font-size="${origin||shelter?11:7}" font-weight="600">${escape(n.id)}</text><text class="node-label" y="${origin||shelter?41:29}" text-anchor="middle">${escape(n.name)}</text>`;
      if(origin||shelter)svg+=`<text class="node-count" y="55" text-anchor="middle">${fmt(origin?n.population:n.capacity)} ${origin?'people':'spaces'}</text>`;
      svg+='</g>';
    }
    svg+='<g id="people-layer" pointer-events="none"></g>';
    $('network-map').innerHTML=svg;
    $('network-chip').textContent=`${state.scenario.nodes.length} locations · ${state.scenario.roads.length} roads`;
    $('map-note').textContent=state.result?'Play the plan to see scheduled movement':'Select a road or a location';
    if(nearest){$('route-summary').innerHTML=`<span class="route-dot"></span><div><strong>Fastest route from ${escape(name(state.origin))}:</strong> ${nearest.nodes.map((id)=>escape(name(id))).join(' → ')} · <strong>${nearest.time} min</strong><small>Dijkstra route · travel time only; queues and shelter allocation are handled in the evacuation plan.</small></div>`;}
    else $('route-summary').innerHTML=`<span class="route-dot"></span><div>${state.origin?'No route from this origin to a shelter with space.':'Add a residential location to explore shortest routes.'}<small>Open roads are checked with BFS; road direction is respected.</small></div>`;
    renderPlayback();
  }

  function renderInspector(){
    const s=state.selection;
    if(!s){$('inspector').innerHTML='<p class="hint">Select a location or road on the map.</p>';return;}
    if(s.kind==='road'){
      const r=state.scenario.roads.find((r)=>r.id===s.id);if(!r){state.selection=null;return renderInspector();}
      $('inspector').innerHTML=`<div class="inspector-kicker">ROAD ${escape(r.id)}</div><div class="inspector-name">${escape(name(r.from))} ${r.bidirectional?'↔':'→'} ${escape(name(r.to))}</div><div class="status-toggle"><label for="road-blocked">Road closed / damaged</label><input id="road-blocked" type="checkbox" ${r.blocked?'checked':''}></div><div class="field-pair"><div><label for="road-time">Travel time (min)</label><input id="road-time" type="number" min="1" max="60" value="${r.time}"></div><div><label for="road-capacity">People / min / dir.</label><input id="road-capacity" type="number" min="1" max="3000" value="${r.capacity}"></div></div><button class="button secondary small full" data-edit-road="${escape(r.id)}">Edit road details</button>`;
      $('road-blocked').addEventListener('change',(event)=>updateRoad(r.id,{blocked:event.target.checked}));
      $('road-time').addEventListener('change',(event)=>updateRoad(r.id,{time:Number(event.target.value)}));
      $('road-capacity').addEventListener('change',(event)=>updateRoad(r.id,{capacity:Number(event.target.value)}));
    }else{
      const n=state.scenario.nodes.find((n)=>n.id===s.id);if(!n){state.selection=null;return renderInspector();}
      $('inspector').innerHTML=`<div class="inspector-kicker">${escape(n.type.toUpperCase())} · ${escape(n.id)}</div><div class="inspector-name">${escape(n.name)}</div><p class="hint">${n.type==='origin'?`${fmt(n.population)} people start here.`:n.type==='shelter'?`${fmt(n.capacity)} total shelter spaces.`:'An intersection where people can wait or change roads.'}</p><button class="button secondary small full" data-edit-node="${escape(n.id)}">Edit this location</button>`;
    }
  }
  function updateRoad(id,changes){
    const next=clone(state.scenario);Object.assign(next.roads.find((r)=>r.id===id),changes);
    try{state.scenario=E.validate(next);invalidate();}catch(error){message(error.message,true);renderInspector();}
  }

  function renderSummary(){
    const r=state.result;
    if(!r){$('panel-summary').innerHTML=`<div class="empty-state"><strong>${state.pending?'Calculating a feasible plan…':'Your next evacuation plan starts here.'}</strong>${state.pending?'Checking travel delays, road capacities and shelter space.':'Choose a deadline, edit the network, then calculate evacuation.'}</div>`;return;}
    const max=Math.max(1,r.evacuated),baseline=state.baseline,difference=baseline===null?0:r.evacuated-baseline;
    const bars=r.cumulative.map((v,t)=>`<div class="bar-column" title="Minute ${t}: ${fmt(v)} people sheltered"><div class="bar" style="height:${v/max*100}%"></div></div>`).join('');
    const shelters=state.scenario.nodes.filter((n)=>n.type==='shelter').map((s)=>`<div class="shelter-row"><div class="shelter-label"><strong>${escape(s.name)}</strong><span>${fmt(r.shelters[s.id].used)} / ${fmt(s.capacity)} spaces</span></div><div class="progress-track" aria-label="${escape(s.name)} occupancy"><div class="progress-fill" style="width:${s.capacity?r.shelters[s.id].used/s.capacity*100:0}%"></div></div></div>`).join('')||'<p class="hint">No shelters are configured.</p>';
    const comparison=difference===0?`Same deadline result as the original scenario: ${fmt(baseline??r.evacuated)} arrivals.`:`${fmt(Math.abs(difference))} ${difference>0?'more':'fewer'} people arrive than in the original scenario (${fmt(baseline)}), at the same ${state.deadline}-minute deadline.`;
    const paths=r.paths.slice(0,12).map((p,i)=>`<tr><td class="mono">${String(i+1).padStart(2,'0')}</td><td><strong>${p.people}</strong></td><td>${escape(name(p.origin))}</td><td>${p.steps.filter((s)=>s.type==='travel').map((s)=>escape(s.road)).join(' → ')||'—'}</td><td>${escape(name(p.shelter))}</td><td>${p.arrival} min</td></tr>`).join('');
    $('panel-summary').innerHTML=`<div class="summary-grid"><div><span class="mini-label">ARRIVALS OVER TIME</span><h3>${fmt(r.evacuated)} people reach shelter by minute ${r.horizon}.</h3><p class="result-subtitle">Cumulative arrivals for this feasible schedule. The solver maximizes the final count.</p><div class="bar-chart" role="img" aria-label="Cumulative shelter arrivals from minute zero to minute ${r.horizon}: ${r.cumulative.join(', ')}">${bars}</div><div class="chart-axis"><span>Minute 0</span><span>Minute ${r.horizon}</span></div></div><div><span class="mini-label">SHELTER ALLOCATION</span><h3>Space, shared across every arrival.</h3>${shelters}</div></div><div class="comparison ${difference<0?'warning':''}">${comparison}${r.isolatedPopulation?` ${fmt(r.isolatedPopulation)} people are isolated from all shelters with space.`:''}</div><div class="table-heading"><div><h3>Scheduled evacuation groups</h3><p class="result-subtitle">${r.paths.length?`Showing ${Math.min(12,r.paths.length)} of ${r.paths.length} groups. Export the schedule for every departure and waiting step.`:'No complete journey is feasible by this deadline.'}</p></div><span class="chip">${r.stats.augmentations} augmenting paths</span></div><div class="table-wrap"><table><thead><tr><th>Group</th><th>People</th><th>Origin</th><th>Road sequence</th><th>Shelter</th><th>Arrival</th></tr></thead><tbody>${paths||'<tr><td colspan="6">No arrivals. Try a later deadline, reopening roads, or adding shelter space.</td></tr>'}</tbody></table></div>`;
  }
  function renderAlgorithms(){
    const traversal=state.origin?E.bfs(state.scenario,state.origin):null,routes=selectedRoutes(),r=state.result;
    const routeTrace=routes?routes.shelters.map((s)=>`${escape(s.id)}: ${s.time===null?'unreachable':`${s.time} min (${s.nodes.map(escape).join(' → ')})`}`).join('<br>'):'Add an origin and a shelter.';
    $('panel-algorithms').innerHTML=`<div class="algorithm-grid"><article class="algorithm-block"><span class="mini-label">01 / REACHABILITY</span><h3>Breadth-first search</h3><p>Starting from ${escape(state.origin?name(state.origin):'an origin')}, visit each reachable location through open roads.</p><div class="trace">${traversal?traversal.order.map(escape).join(' → '):'No origin selected.'}</div><p>Queue + adjacency lists. Closed roads are excluded; one-way roads keep their direction.</p><span class="formula">O(V + E) time · O(V + E) space</span></article><article class="algorithm-block"><span class="mini-label">02 / FASTEST ROUTES</span><h3>Dijkstra’s algorithm</h3><p>A binary min-heap explores the next smallest travel time. These paths do not account for queues.</p><div class="trace">${routeTrace||'No shelter with positive capacity.'}</div><p>All road travel times are positive integers. Stale heap entries are skipped.</p><span class="formula">O((V + E) log(V + E)) time</span></article><article class="algorithm-block"><span class="mini-label">03 / CAPACITY OVER TIME</span><h3>Edmonds–Karp max-flow</h3><p>Duplicate each location at each minute. Add travel edges, waiting edges, origin supply and shared shelter gates.</p><div class="trace">${r?`${r.stats.vertices} expanded vertices<br>${r.stats.edges} forward edges<br>${r.stats.augmentations} augmentations<br>Maximum arrivals: ${r.evacuated}`:'Calculate a plan to see the flow trace.'}</div><p>Binary search repeats max-flow to find the earliest deadline that accommodates everyone, up to 60 minutes.</p><span class="formula">O(V′ E′²) per flow solve<br>O(log H) solves for minimum time</span></article></div><p class="hint" style="margin-top:18px">A fastest individual route can have too little capacity for the whole population. The flow model may split groups across longer routes or wait before departing. It does not claim to minimize aggregate travel time or equalize service across origins.</p>`;
  }
  function renderEditor(){
    const locations=state.scenario.nodes.map((n)=>`<tr><td class="mono">${escape(n.id)}</td><td>${escape(n.name)}</td><td>${escape(n.type)}</td><td>${n.type==='origin'?n.population:n.type==='shelter'?n.capacity:'—'}</td><td><button class="button secondary" data-edit-node="${escape(n.id)}">Edit</button></td><td><button class="button quiet danger" data-delete-node="${escape(n.id)}" aria-label="Delete ${escape(n.name)}">Remove</button></td></tr>`).join('');
    const roads=state.scenario.roads.map((r)=>`<tr><td class="mono">${escape(r.id)}</td><td>${escape(r.from)} ${r.bidirectional?'↔':'→'} ${escape(r.to)}</td><td>${r.time} min</td><td>${r.capacity} / min / direction</td><td><span class="tag ${r.blocked?'closed':''}">${r.blocked?'Closed':'Open'}</span></td><td><button class="button secondary" data-edit-road="${escape(r.id)}">Edit</button></td><td><button class="button quiet danger" data-delete-road="${escape(r.id)}" aria-label="Delete road ${escape(r.id)}">Remove</button></td></tr>`).join('');
    $('panel-editor').innerHTML=`<div class="editor-top"><div><h3>Make the network your own.</h3><p class="result-subtitle">Add locations and roads, or edit population, shelter space and map positions. Save your network as JSON.</p></div><div class="editor-buttons"><button class="button secondary small" id="add-node">+ Location</button><button class="button primary small" id="add-road">+ Road</button></div></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Location</th><th>Type</th><th>People / spaces</th><th></th><th></th></tr></thead><tbody>${locations}</tbody></table></div><div class="table-heading"><h3>Roads</h3><span class="hint">Two-way capacities are independent in each direction.</span></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Connection</th><th>Travel time</th><th>Capacity</th><th>Status</th><th></th><th></th></tr></thead><tbody>${roads||'<tr><td colspan="7">Add a road to connect your locations.</td></tr>'}</tbody></table></div>`;
  }
  function render(){
    $('scenario-description').textContent=state.scenario.description;
    $('deadline').value=state.deadline;$('deadline-output').textContent=`${state.deadline} min`;
    $('timeline').max=state.deadline;
    const origins=state.scenario.nodes.filter((n)=>n.type==='origin');
    if(!origins.some((n)=>n.id===state.origin))state.origin=origins[0]?.id||null;
    $('origin-select').innerHTML=origins.map((n)=>`<option value="${escape(n.id)}">${escape(n.name)}</option>`).join('')||'<option>No origin</option>';
    if(state.origin)$('origin-select').value=state.origin;
    renderMetrics();renderInspector();renderMap();renderSummary();renderAlgorithms();renderEditor();
  }

  function run(){
    state.version++;const version=state.version;stopWorker();pause();state.time=0;state.result=null;state.pending=true;
    $('run-button').disabled=true;$('run-button').textContent='Calculating…';message('');render();
    const payload={scenario:clone(state.scenario),base:clone(state.base),deadline:state.deadline};
    const finish=(data)=>{
      if(version!==state.version)return;stopWorker();state.pending=false;$('run-button').disabled=false;$('run-button').textContent='↗ Calculate evacuation';
      if(!data.ok){message(data.error||'The plan could not be calculated.',true);render();return;}
      state.result=data.result;state.baseline=data.baseline;state.time=0;render();
      message(`Plan ready: ${fmt(data.result.evacuated)} of ${fmt(data.result.total)} people arrive within ${state.deadline} minutes.`);
    };
    const fallback=()=>setTimeout(()=>{try{finish({ok:true,result:E.analyze(payload.scenario,payload.deadline),baseline:E.solveDeadline(payload.base,payload.deadline,false)});}catch(error){finish({ok:false,error:error.message});}},20);
    try{
      if(!window.Worker){fallback();return;}
      const code=`const E=(${window.createEvacuationEngine.toString()})();onmessage=({data})=>{try{postMessage({ok:true,result:E.analyze(data.scenario,data.deadline),baseline:E.solveDeadline(data.base,data.deadline,false)});}catch(error){postMessage({ok:false,error:error.message});}};`;
      state.workerURL=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));state.worker=new Worker(state.workerURL);
      state.worker.onmessage=(event)=>finish(event.data);
      state.worker.onerror=(event)=>{event.preventDefault();stopWorker();fallback();};state.worker.postMessage(payload);
    }catch{stopWorker();fallback();}
  }

  function renderPlayback(){
    const r=state.result,time=Math.min(state.time,state.deadline),whole=Math.min(Math.floor(time+1e-8),state.deadline);
    $('timeline').value=time;$('time-caption').textContent=`Minute ${time.toFixed(time%1?1:0)} / ${state.deadline}`;
    $('safe-caption').textContent=`${fmt(r?r.cumulative[whole]:0)} people at shelters`;
    const layer=$('people-layer');if(!layer)return;
    if(!r){layer.innerHTML='';return;}
    let markers='';const waiting=Object.create(null);
    for(const p of r.paths){
      if(time>=p.arrival)continue;
      const step=p.steps.find((s)=>s.start<=time&&time<s.end);if(!step)continue;
      if(step.type==='wait'){waiting[step.at]=(waiting[step.at]||0)+p.people;continue;}
      const road=state.scenario.roads.find((road)=>road.id===step.road),g=roadGeometry(road);
      let fraction=(time-step.start)/(step.end-step.start);if(road.from!==step.from)fraction=1-fraction;
      const pos=point(g,fraction),radius=Math.min(8,3+Math.sqrt(p.people)*.6);
      markers+=`<circle cx="${pos.x}" cy="${pos.y}" r="${radius}" fill="#d99041" stroke="#fff" stroke-width="2"><title>${p.people} people · ${escape(step.road)} · ${escape(name(p.shelter))}</title></circle>`;
    }
    for(const [id,count]of Object.entries(waiting)){
      const n=state.scenario.nodes.find((n)=>n.id===id);
      markers+=`<g transform="translate(${n.x+20},${n.y-23})"><rect x="-12" y="-9" width="30" height="18" rx="8" fill="#fff3d7" stroke="#e3c98f"/><text x="3" y="3" text-anchor="middle" font-size="9" fill="#987035">${count}</text></g>`;
    }
    layer.innerHTML=markers;
  }
  function tick(now){
    if(!state.playing)return;const delta=state.lastFrame?(now-state.lastFrame)/1000:0;state.lastFrame=now;
    state.time=Math.min(state.deadline,state.time+delta*Number($('playback-speed').value));renderPlayback();
    if(state.time>=state.deadline){pause();return;}state.animation=requestAnimationFrame(tick);
  }
  function selectTab(tab,focus=false){
    document.querySelectorAll('.tab').forEach((button)=>{const selected=button.dataset.tab===tab;button.classList.toggle('active',selected);button.setAttribute('aria-selected',selected);button.tabIndex=selected?0:-1;if(selected&&focus)button.focus();});
    document.querySelectorAll('.tab-panel').forEach((panel)=>panel.hidden=panel.id!==`panel-${tab}`);
  }
  function nextId(prefix,items){let n=1;while(items.some((item)=>item.id===prefix+n))n++;return prefix+n;}
  function openEditor(kind,id=null){
    state.editing={kind,id};$('dialog-error').textContent='';
    if(kind==='node'){
      const n=id?state.scenario.nodes.find((n)=>n.id===id):{id:nextId('N',state.scenario.nodes),name:'New location',type:'junction',population:0,capacity:0,x:450,y:250};
      $('dialog-title').textContent=id?'Edit location':'Add location';
      $('dialog-fields').innerHTML=`<label for="edit-name">Location name</label><input id="edit-name" name="name" type="text" maxlength="60" required value="${escape(n.name)}"><label for="edit-type">Location type</label><select id="edit-type" name="type"><option value="origin" ${n.type==='origin'?'selected':''}>Residential area</option><option value="junction" ${n.type==='junction'?'selected':''}>Junction</option><option value="shelter" ${n.type==='shelter'?'selected':''}>Shelter</option></select><div class="field-pair"><div><label for="edit-population">Initial population</label><input id="edit-population" name="population" type="number" min="0" max="3000" required value="${n.population}"></div><div><label for="edit-capacity">Shelter spaces</label><input id="edit-capacity" name="capacity" type="number" min="0" max="3000" required value="${n.capacity}"></div></div><div class="field-pair"><div><label for="edit-x">Map X (45–855)</label><input id="edit-x" name="x" type="number" min="45" max="855" step="any" required value="${n.x}"></div><div><label for="edit-y">Map Y (50–450)</label><input id="edit-y" name="y" type="number" min="50" max="450" step="any" required value="${n.y}"></div></div><p class="hint tiny">Location ID: ${escape(n.id)}. Map coordinates only affect the drawing.</p>`;
      const sync=()=>{$('edit-population').disabled=$('edit-type').value!=='origin';$('edit-capacity').disabled=$('edit-type').value!=='shelter';};$('edit-type').addEventListener('change',sync);sync();
    }else{
      if(state.scenario.nodes.length<2){message('Add at least two locations before adding a road.',true);return;}
      const r=id?state.scenario.roads.find((r)=>r.id===id):{id:nextId('R',state.scenario.roads),from:state.scenario.nodes[0].id,to:state.scenario.nodes[1].id,time:2,capacity:10,blocked:false,bidirectional:true};
      const options=(selected)=>state.scenario.nodes.map((n)=>`<option value="${escape(n.id)}" ${n.id===selected?'selected':''}>${escape(n.name)} (${escape(n.id)})</option>`).join('');
      $('dialog-title').textContent=id?'Edit road':'Add road';
      $('dialog-fields').innerHTML=`<label for="edit-from">From</label><select id="edit-from" name="from">${options(r.from)}</select><label for="edit-to">To</label><select id="edit-to" name="to">${options(r.to)}</select><div class="field-pair"><div><label for="edit-time">Travel time (min)</label><input id="edit-time" name="time" type="number" min="1" max="60" value="${r.time}" required></div><div><label for="edit-capacity">People / min / dir.</label><input id="edit-capacity" name="capacity" type="number" min="1" max="3000" value="${r.capacity}" required></div></div><div class="status-toggle"><label for="edit-two-way">Two-way road</label><input id="edit-two-way" name="bidirectional" type="checkbox" ${r.bidirectional?'checked':''}></div><div class="status-toggle"><label for="edit-blocked">Closed / damaged</label><input id="edit-blocked" name="blocked" type="checkbox" ${r.blocked?'checked':''}></div><p class="hint tiny">Road ID: ${escape(r.id)}. Two-way capacity is independent in each direction.</p>`;
    }
    $('edit-dialog').showModal();
  }
  function saveEditor(event){
    event.preventDefault();const {kind,id}=state.editing,next=clone(state.scenario),data=new FormData($('edit-form'));let selection;
    try{
      if(kind==='node'){
        const type=data.get('type');const n={id:id||nextId('N',next.nodes),name:data.get('name').trim(),type,population:type==='origin'?Number(data.get('population')):0,capacity:type==='shelter'?Number(data.get('capacity')):0,x:Number(data.get('x')),y:Number(data.get('y'))};
        if(!n.name)throw new Error('Enter a location name.');if(id)next.nodes[next.nodes.findIndex((n)=>n.id===id)]=n;else next.nodes.push(n);selection={kind:'node',id:n.id};
      }else{
        const r={id:id||nextId('R',next.roads),from:data.get('from'),to:data.get('to'),time:Number(data.get('time')),capacity:Number(data.get('capacity')),bidirectional:data.has('bidirectional'),blocked:data.has('blocked')};
        if(id)next.roads[next.roads.findIndex((r)=>r.id===id)]=r;else next.roads.push(r);selection={kind:'road',id:r.id};
      }
      state.scenario=E.validate(next);state.selection=selection;$('edit-dialog').close();invalidate();
    }catch(error){$('dialog-error').textContent=error.message;}
  }
  function removeItem(kind,id){
    const next=clone(state.scenario);
    if(kind==='node'){next.nodes=next.nodes.filter((n)=>n.id!==id);next.roads=next.roads.filter((r)=>r.from!==id&&r.to!==id);}else next.roads=next.roads.filter((r)=>r.id!==id);
    try{state.scenario=E.validate(next);if(state.selection?.id===id&&state.selection.kind===kind)state.selection=null;invalidate(kind==='node'?'Location and connected roads removed. Calculate a new plan.':undefined);}catch(error){message(error.message,true);}
  }
  function download(filename,content,type){
    const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function exportSchedule(){
    if(!state.result)return;
    const cell=(value)=>'"'+String(value).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const rows=[['group','people','origin','shelter','arrival_minute','steps']];
    state.result.paths.forEach((p,i)=>rows.push([i+1,p.people,name(p.origin),name(p.shelter),p.arrival,p.steps.map((s)=>s.type==='wait'?`wait at ${s.at} [${s.start},${s.end}]`:`${s.road}: ${s.from} -> ${s.to} [${s.start},${s.end}]`).join('; ')]));
    download('saferoute-evacuation-schedule.csv','\uFEFF'+rows.map((row)=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }

  $('scenario-select').innerHTML=window.EVACUATION_SCENARIOS.map((s,i)=>`<option value="${i}">${escape(s.name)}</option>`).join('');
  $('scenario-select').addEventListener('change',()=>{
    if($('scenario-select').value==='custom'){if(state.imported)setScenario(state.imported);return;}
    const index=Number($('scenario-select').value);if(Number.isNaN(index))return;
    if(index===3)state.deadline=3;else state.deadline=12;
    setScenario(window.EVACUATION_SCENARIOS[index]);
  });
  $('deadline').addEventListener('input',()=>{state.deadline=Number($('deadline').value);invalidate('Deadline changed. Calculate a new evacuation plan.');});
  $('run-button').addEventListener('click',run);
  $('reset-button').addEventListener('click',()=>setScenario(state.base));
  $('origin-select').addEventListener('change',()=>{state.origin=$('origin-select').value;renderMap();renderAlgorithms();});
  const selectMapItem=(target)=>{const item=target.closest('[data-kind]');if(!item)return;state.selection={kind:item.dataset.kind,id:item.dataset.id};if(item.dataset.kind==='node'&&state.scenario.nodes.find((n)=>n.id===item.dataset.id)?.type==='origin'){state.origin=item.dataset.id;$('origin-select').value=state.origin;renderAlgorithms();}renderInspector();renderMap();};
  $('network-map').addEventListener('click',(event)=>selectMapItem(event.target));
  $('network-map').addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectMapItem(event.target);}});
  $('play-button').addEventListener('click',()=>{if(state.playing){pause();return;}if(!state.result)return;if(state.time>=state.deadline)state.time=0;state.playing=true;state.lastFrame=0;$('play-button').textContent='Ⅱ';$('play-button').setAttribute('aria-label','Pause evacuation');state.animation=requestAnimationFrame(tick);});
  $('timeline').addEventListener('input',()=>{pause();state.time=Number($('timeline').value);renderPlayback();});
  document.querySelectorAll('.tab').forEach((button)=>{
    button.addEventListener('click',()=>selectTab(button.dataset.tab));
    button.addEventListener('keydown',(event)=>{const tabs=[...document.querySelectorAll('.tab')],i=tabs.indexOf(button);if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();selectTab(tabs[(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length].dataset.tab,true);}});
  });
  $('help-button').addEventListener('click',()=>{selectTab('guide');$('panel-guide').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
  document.addEventListener('click',(event)=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.editNode)openEditor('node',button.dataset.editNode);
    if(button.dataset.editRoad)openEditor('road',button.dataset.editRoad);
    if(button.dataset.deleteNode)removeItem('node',button.dataset.deleteNode);
    if(button.dataset.deleteRoad)removeItem('road',button.dataset.deleteRoad);
    if(button.id==='add-node')openEditor('node');if(button.id==='add-road')openEditor('road');
  });
  $('edit-form').addEventListener('submit',saveEditor);
  $('close-dialog').addEventListener('click',()=>$('edit-dialog').close());$('cancel-dialog').addEventListener('click',()=>$('edit-dialog').close());
  $('export-button').addEventListener('click',()=>download('saferoute-network.json',JSON.stringify(state.scenario,null,2),'application/json'));
  $('download-results').addEventListener('click',exportSchedule);
  $('import-button').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async(event)=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>200000)throw new Error('Use a JSON file smaller than 200 KB.');const scenario=E.validate(JSON.parse(await file.text()));
      state.imported=clone(scenario);let option=$('scenario-select').querySelector('[value="custom"]');if(!option){option=document.createElement('option');option.value='custom';$('scenario-select').append(option);}option.textContent='Imported: '+scenario.name;$('scenario-select').value='custom';setScenario(scenario);
    }catch(error){message('Import failed: '+error.message,true);}finally{event.target.value='';}
  });
  window.addEventListener('beforeunload',stopWorker);
  render();run();
})();
