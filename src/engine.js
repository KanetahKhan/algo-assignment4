/* SafeRoute browser bridge.
 * All algorithms (validation, BFS, Dijkstra, Edmonds–Karp, binary search) are the C++
 * code in cpp/, compiled to WebAssembly in src/saferoute_wasm.js by tools/build_wasm.bat.
 * This file only converts JavaScript objects to JSON for the C++ entry point and back. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ nodes: 20, roads: 60, horizon: 60, population: 3000 });
  const isNode = typeof module === 'object' && module.exports;
  const createModule = isNode ? require('./saferoute_wasm.js') : root.createSafeRouteModule;
  let call = null;

  // Resolves once the WebAssembly module is compiled and ready to use.
  const ready = createModule().then((wasm) => {
    call = wasm.cwrap('saferoute_call', 'string', ['string', 'string', 'string']);
  });

  function invoke(command, scenario, options) {
    if (!call) throw new Error('The C++ engine is still loading.');
    const reply = JSON.parse(call(command, JSON.stringify(scenario ?? null), JSON.stringify(options)));
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }

  const engine = {
    LIMITS, ready,
    validate: (scenario) => invoke('validate', scenario, {}),
    bfs: (scenario, start) => invoke('bfs', scenario, { start }),
    dijkstra: (scenario, start) => invoke('dijkstra', scenario, { start }),
    solveDeadline: (scenario, horizon, details = true) => invoke('solveDeadline', scenario, { horizon, details }),
    analyze: (scenario, horizon) => invoke('analyze', scenario, { horizon })
  };
  if (isNode) module.exports = engine;
  else root.Evacuation = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
