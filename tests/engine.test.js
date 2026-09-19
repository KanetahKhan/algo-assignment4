'use strict';
// Checks the browser bridge: the C++ engine compiled to WebAssembly (src/saferoute_wasm.js)
// must give the same answers through src/engine.js as the native C++ tests expect.
// The algorithm tests themselves are in tests/engine_test.cpp.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const examples = require('../src/scenarios.js');
const clone = (v) => JSON.parse(JSON.stringify(v));
const small = () => E.validate(clone(examples[3]));

before(() => E.ready);

test('sample scenarios give the documented results', () => {
  const expected = [[12, 176, 'complete', 13], [12, 110, 'complete', 17], [12, 120, 'impossible', null], [3, 6, 'complete', 5]];
  examples.forEach((sample, i) => {
    const [deadline, evacuated, status, minutes] = expected[i], r = E.analyze(sample, deadline);
    assert.equal(r.evacuated, evacuated); assert.equal(r.completion.status, status); assert.equal(r.completion.minutes, minutes);
  });
});
test('road rate and transit time: arrivals 0,0,3,3,3,1', () => {
  const s = small();
  assert.equal(E.solveDeadline(s, 1).evacuated, 0);
  assert.equal(E.solveDeadline(s, 3, false), 6);
  assert.deepEqual(E.solveDeadline(s, 5).arrivals, [0, 0, 3, 3, 3, 1]);
});
test('BFS and Dijkstra results use location and road IDs', () => {
  const s = small();
  assert.deepEqual(E.bfs(s, 'A'), { order: ['A', 'S'], parent: { S: 'A' } });
  const d = E.dijkstra(s, 'A');
  assert.deepEqual(d.distances, { A: 0, S: 2 });
  assert.deepEqual(d.shelters, [{ id: 'S', time: 2, nodes: ['A', 'S'], roads: ['R1'] }]);
  s.roads[0].blocked = true;
  assert.equal(E.dijkstra(s, 'A').shelters[0].time, null);
});
test('schedules list every group with its steps', () => {
  const r = E.analyze(small(), 5);
  assert.equal(r.paths.reduce((a, p) => a + p.people, 0), 10);
  assert.deepEqual(r.paths[0].steps[0], { type: 'travel', road: 'R1', from: 'A', to: 'S', start: 0, end: 2 });
  assert.deepEqual(Object.keys(r.origins), ['A']);
});
test('validation normalizes input and reports errors from C++', () => {
  const v = E.validate({ nodes: [{ id: 'A', type: 'origin', population: 4 }], roads: [] });
  assert.deepEqual(v, { name: 'Custom scenario', description: '', nodes: [{ id: 'A', name: 'A', type: 'origin', population: 4, capacity: 0, x: 450, y: 250 }], roads: [] });
  const s = small(); s.roads[0].time = 1.5; assert.throws(() => E.validate(s), /integer/);
  const a = small(); a.nodes.push({ ...a.nodes[0] }); assert.throws(() => E.validate(a), /unique/);
  const b = small(); b.roads[0].blocked = 'false'; assert.throws(() => E.validate(b), /true or false/);
  assert.throws(() => E.validate(null), /nodes and roads/);
  assert.throws(() => E.solveDeadline(small(), 61), /Deadline/);
  assert.throws(() => E.bfs(small(), 'missing'), /start location/);
});
