'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const examples = require('../src/scenarios.js');
const clone = (v) => JSON.parse(JSON.stringify(v));
const small = () => E.validate(clone(examples[3]));

test('known max-flow network has flow 23 (including residual rerouting)', () => {
  const f = new E.FlowNetwork(6);
  [[0,1,16],[0,2,13],[1,2,10],[2,1,4],[1,3,12],[3,2,9],[2,4,14],[4,3,7],[3,5,20],[4,5,4]]
    .forEach((e) => f.addEdge(...e));
  assert.equal(f.maxFlow(0,5).value, 23);
});
test('residual reverse edges undo an initially tempting matching', () => {
  const f = new E.FlowNetwork(6);
  [[0,1,1],[0,2,1],[1,3,1],[1,4,1],[2,3,1],[3,5,1],[4,5,1]].forEach((e) => f.addEdge(...e));
  assert.equal(f.maxFlow(0,5).value, 2);
});
test('road rate and transit time: arrivals 0,0,3,3,3,1', () => {
  const s = small();
  assert.equal(E.solveDeadline(s,1).evacuated,0);
  assert.equal(E.solveDeadline(s,3).evacuated,6);
  assert.deepEqual(E.solveDeadline(s,5).arrivals,[0,0,3,3,3,1]);
  assert.equal(E.analyze(s,3).completion.minutes,5);
});
test('shelter space is a total, never refreshed each minute', () => {
  const s=small(); s.nodes[1].capacity=5;
  const r=E.analyze(s,10);
  assert.equal(r.evacuated,5); assert.equal(r.eventual,5); assert.equal(r.completion.status,'impossible');
});
test('blocking a road removes it from reachability, routes and flow', () => {
  const s=small(); s.roads[0].blocked=true; const r=E.analyze(s,10);
  assert.deepEqual(r.origins.A.bfs.order,['A']); assert.equal(r.origins.A.routes.shelters[0].time,null);
  assert.equal(r.evacuated,0); assert.equal(r.isolatedPopulation,10);
});
test('one-way roads cannot be traversed backwards', () => {
  const s=small(); [s.roads[0].from,s.roads[0].to]=[s.roads[0].to,s.roads[0].from];
  assert.equal(E.analyze(s,10).evacuated,0);
  s.roads[0].bidirectional=true; assert.equal(E.analyze(s,10).evacuated,10);
});
test('Dijkstra weights travel time, not hop count', () => {
  const s=small(); s.nodes.push({id:'J',name:'J',type:'junction',population:0,capacity:0,x:450,y:250});
  s.roads[0].time=9;
  s.roads.push({id:'r2',from:'A',to:'J',time:2,capacity:2,bidirectional:false,blocked:false},
    {id:'r3',from:'J',to:'S',time:3,capacity:2,bidirectional:false,blocked:false});
  assert.equal(E.dijkstra(s,'A').shelters[0].time,5);
  assert.deepEqual(E.dijkstra(s,'A').shelters[0].nodes,['A','J','S']);
});
test('parallel roads retain separate capacities', () => {
  const s=small(); s.roads.push({...s.roads[0],id:'R2'});
  assert.equal(E.solveDeadline(s,2).evacuated,6);
});
test('multiple origins share the same finite shelter capacity', () => {
  const s=small(); s.nodes.push({...s.nodes[0],id:'B'});
  s.roads.push({...s.roads[0],id:'R2',from:'B'});
  const r=E.analyze(s,10); assert.equal(r.total,20); assert.equal(r.evacuated,10);
  assert.equal(r.paths.reduce((sum,p)=>sum+p.people,0),10);
});
test('no population completes at minute zero', () => {
  const s=small(); s.nodes[0].population=0;
  assert.equal(E.analyze(s,0).completion.minutes,0);
});
test('long travel time is beyond the search horizon, not impossible', () => {
  const s=small(); s.nodes.push({id:'J',name:'J',type:'junction',population:0,capacity:0,x:450,y:250});
  s.roads[0].to='J'; s.roads[0].time=40;
  s.roads.push({...s.roads[0],id:'R2',from:'J',to:'S'});
  const r=E.analyze(s,10); assert.equal(r.eventual,10); assert.equal(r.completion.status,'beyond_limit');
});
test('unreachable spare shelter space cannot serve another component', () => {
  const s=small(); s.nodes[1].capacity=5; s.nodes.push({...s.nodes[1],id:'S2',capacity:100});
  const r=E.analyze(s,10); assert.equal(r.eventual,5); assert.equal(r.completion.status,'impossible');
});
test('all sample schedules conserve people and respect every departure capacity', () => {
  for(const sample of examples){
    const s=E.validate(sample), r=E.analyze(s,12), sources={}, loads={};
    assert.equal(r.paths.reduce((a,p)=>a+p.people,0),r.evacuated);
    assert.equal(r.arrivals.reduce((a,b)=>a+b,0),r.evacuated);
    for(const p of r.paths){
      sources[p.origin]=(sources[p.origin]||0)+p.people;
      let at=p.origin,time=0;
      for(const step of p.steps){
        assert.equal(step.start,time);
        if(step.type==='wait') assert.equal(step.at,at);
        else {
          assert.equal(step.from,at); const road=s.roads.find(e=>e.id===step.road);
          assert.equal(road.blocked,false); assert.equal(step.end-step.start,road.time);
          assert.ok((road.from===step.from&&road.to===step.to)||(road.bidirectional&&road.to===step.from&&road.from===step.to));
          const key=[step.road,step.from,step.start].join(':');loads[key]=(loads[key]||0)+p.people;
          assert.ok(loads[key]<=road.capacity); at=step.to;
        }
        time=step.end;
      }
      assert.equal(at,p.shelter);assert.equal(time,p.arrival);assert.ok(time<=r.horizon);
    }
    for(const n of s.nodes){assert.ok((sources[n.id]||0)<=n.population);if(n.type==='shelter')assert.ok(r.shelters[n.id].used<=n.capacity);}
    for(let h=1;h<=12;h++)assert.ok(E.solveDeadline(s,h,false)>=E.solveDeadline(s,h-1,false));
  }
});
test('validation rejects malformed, fractional and overlarge inputs', () => {
  const s=small();s.roads[0].time=1.5;assert.throws(()=>E.validate(s),/integer/);
  const a=small();a.nodes.push({...a.nodes[0]});assert.throws(()=>E.validate(a),/unique/);
  const b=small();b.roads[0].blocked='false';assert.throws(()=>E.validate(b),/true or false/);
  const c=small();c.nodes[0].population=3001;assert.throws(()=>E.validate(c),/integer/);
  assert.throws(()=>E.solveDeadline(small(),61),/Deadline/);
});
