/* SafeRoute: dependency-free graph algorithms. Node.js + ordinary browsers. */
(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else { root.Evacuation = engine; root.createEvacuationEngine = factory; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ nodes: 20, roads: 60, horizon: 60, population: 3000 });

  function validate(input) {
    const fail = (message) => { throw new Error(message); };
    if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.roads))
      fail('A scenario must contain nodes and roads arrays.');
    if (!input.nodes.length || input.nodes.length > LIMITS.nodes)
      fail(`Use between 1 and ${LIMITS.nodes} locations.`);
    if (input.roads.length > LIMITS.roads) fail(`Use at most ${LIMITS.roads} roads.`);
    const ids = new Set(), roadIds = new Set();
    const integer = (v, lo, hi, label) => {
      if (!Number.isSafeInteger(v) || v < lo || v > hi) fail(`${label} must be an integer from ${lo} to ${hi}.`);
      return v;
    };
    const nodes = input.nodes.map((n) => {
      if (!n || typeof n.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(n.id) || ids.has(n.id))
        fail('Location IDs must be unique, using 1–24 letters, numbers, underscores or hyphens.');
      ids.add(n.id);
      if (!['origin', 'junction', 'shelter'].includes(n.type)) fail(`Unknown location type for ${n.id}.`);
      const population = integer(n.population ?? 0, 0, LIMITS.population, 'Population');
      const capacity = integer(n.capacity ?? 0, 0, LIMITS.population, 'Shelter capacity');
      if (n.type !== 'origin' && population) fail('Only origin locations can contain an initial population.');
      if (n.type !== 'shelter' && capacity) fail('Only shelters can have a shelter capacity.');
      const x = n.x ?? 450, y = n.y ?? 250;
      if (!Number.isFinite(x) || x < 45 || x > 855 || !Number.isFinite(y) || y < 50 || y > 450)
        fail('Location coordinates must be inside the map (x: 45–855, y: 50–450).');
      return { id: n.id, name: String(n.name || n.id).slice(0, 60), type: n.type, population, capacity, x, y };
    });
    if (nodes.reduce((s, n) => s + n.population, 0) > LIMITS.population)
      fail(`Use at most ${LIMITS.population} people in a scenario.`);
    const roads = input.roads.map((r) => {
      if (!r || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(r.id) || roadIds.has(r.id))
        fail('Road IDs must be unique, using 1–24 letters, numbers, underscores or hyphens.');
      roadIds.add(r.id);
      if (!ids.has(r.from) || !ids.has(r.to) || r.from === r.to) fail(`Road ${r.id} needs two different existing locations.`);
      if (r.blocked !== undefined && typeof r.blocked !== 'boolean') fail('Road blocked must be true or false.');
      if (r.bidirectional !== undefined && typeof r.bidirectional !== 'boolean') fail('Road bidirectional must be true or false.');
      return { id: r.id, from: r.from, to: r.to,
        time: integer(r.time, 1, 60, 'Road travel time'),
        capacity: integer(r.capacity, 1, LIMITS.population, 'Road capacity'),
        blocked: r.blocked ?? false, bidirectional: r.bidirectional ?? true };
    });
    return { name: String(input.name || 'Custom scenario').slice(0, 80),
      description: String(input.description || '').slice(0, 600), nodes, roads };
  }

  function adjacency(scenario) {
    const graph = new Map(scenario.nodes.map((n) => [n.id, []]));
    for (const road of scenario.roads) {
      if (road.blocked) continue;
      graph.get(road.from).push({ to: road.to, road: road.id, time: road.time });
      if (road.bidirectional) graph.get(road.to).push({ to: road.from, road: road.id, time: road.time });
    }
    return graph;
  }

  function bfs(scenario, start) {
    const graph = adjacency(scenario);
    if (!graph.has(start)) throw new Error('Select an existing start location.');
    const order = [start], seen = new Set(order), parent = Object.create(null);
    for (let head = 0; head < order.length; head++) {
      for (const edge of graph.get(order[head])) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to); parent[edge.to] = order[head]; order.push(edge.to);
      }
    }
    return { order, parent };
  }

  class MinHeap {
    constructor() { this.items = []; }
    push(item) {
      const a = this.items; let i = a.length; a.push(item);
      while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= item[0]) break; a[i] = a[p]; i = p; }
      a[i] = item;
    }
    pop() {
      const a = this.items, first = a[0], last = a.pop();
      if (a.length) {
        let i = 0;
        while (2 * i + 1 < a.length) {
          let child = 2 * i + 1;
          if (child + 1 < a.length && a[child + 1][0] < a[child][0]) child++;
          if (a[child][0] >= last[0]) break;
          a[i] = a[child]; i = child;
        }
        a[i] = last;
      }
      return first;
    }
    get size() { return this.items.length; }
  }

  function dijkstra(scenario, start) {
    const graph = adjacency(scenario);
    if (!graph.has(start)) throw new Error('Select an existing start location.');
    const distances = Object.fromEntries(scenario.nodes.map((n) => [n.id, Infinity]));
    const previous = Object.create(null), heap = new MinHeap(), order = [];
    distances[start] = 0; heap.push([0, start]);
    while (heap.size) {
      const [distance, u] = heap.pop();
      if (distance !== distances[u]) continue;
      order.push(u);
      for (const edge of graph.get(u)) {
        const next = distance + edge.time;
        if (next < distances[edge.to]) {
          distances[edge.to] = next; previous[edge.to] = { from: u, road: edge.road };
          heap.push([next, edge.to]);
        }
      }
    }
    const shelters = scenario.nodes.filter((n) => n.type === 'shelter' && n.capacity > 0).map((n) => {
      const nodes = [], roads = [];
      if (Number.isFinite(distances[n.id])) {
        let u = n.id; nodes.push(u);
        while (u !== start) { roads.push(previous[u].road); u = previous[u].from; nodes.push(u); }
        nodes.reverse(); roads.reverse();
      }
      return { id: n.id, time: Number.isFinite(distances[n.id]) ? distances[n.id] : null, nodes, roads };
    }).sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
    return { distances: Object.fromEntries(Object.entries(distances).map(([k, v]) => [k, Number.isFinite(v) ? v : null])),
      order, shelters };
  }

  // Each original edge has its own reverse residual edge, even for parallel roads.
  class FlowNetwork {
    constructor(size) { this.graph = Array.from({ length: size }, () => []); this.edges = []; }
    addEdge(from, to, capacity, meta = null) {
      const forward = { from, to, capacity, residual: capacity, reverse: this.graph[to].length, meta };
      const reverse = { from: to, to: from, capacity: 0, residual: 0, reverse: this.graph[from].length, meta: null };
      this.graph[from].push(forward); this.graph[to].push(reverse); this.edges.push(forward);
      return forward;
    }
    maxFlow(source, sink) {
      if (source === sink) throw new Error('Flow source and sink must differ.');
      let value = 0, augmentations = 0;
      const n = this.graph.length, parents = new Int32Array(n), edgeIndices = new Int32Array(n), queue = new Int32Array(n);
      while (true) {
        parents.fill(-1); parents[source] = source; queue[0] = source;
        let head = 0, tail = 1;
        while (head < tail && parents[sink] === -1) {
          const u = queue[head++], list = this.graph[u];
          for (let j = 0; j < list.length; j++) {
            const edge = list[j];
            if (edge.residual <= 0 || parents[edge.to] !== -1) continue;
            parents[edge.to] = u; edgeIndices[edge.to] = j; queue[tail++] = edge.to;
            if (edge.to === sink) break;
          }
        }
        if (parents[sink] === -1) break;
        let amount = Infinity;
        for (let v = sink; v !== source; v = parents[v]) amount = Math.min(amount, this.graph[parents[v]][edgeIndices[v]].residual);
        for (let v = sink; v !== source; v = parents[v]) {
          const edge = this.graph[parents[v]][edgeIndices[v]];
          edge.residual -= amount; this.graph[v][edge.reverse].residual += amount;
        }
        value += amount; augmentations++;
      }
      return { value, augmentations };
    }
  }

  function makeTimeNetwork(scenario, horizon) {
    const count = scenario.nodes.length, shelters = scenario.nodes.filter((n) => n.type === 'shelter');
    const nodeIndex = new Map(scenario.nodes.map((n, i) => [n.id, i]));
    const gateOffset = count * (horizon + 1), source = gateOffset + shelters.length, sink = source + 1;
    const network = new FlowNetwork(sink + 1), total = scenario.nodes.reduce((s, n) => s + n.population, 0);
    const at = (id, t) => t * count + nodeIndex.get(id);
    for (const n of scenario.nodes) {
      if (n.type === 'origin' && n.population) network.addEdge(source, at(n.id, 0), n.population, { type: 'source', origin: n.id });
      for (let t = 0; t < horizon; t++) network.addEdge(at(n.id, t), at(n.id, t + 1), total,
        { type: 'wait', at: n.id, start: t, end: t + 1 });
    }
    for (const r of scenario.roads) {
      if (r.blocked) continue;
      for (let t = 0; t + r.time <= horizon; t++) {
        network.addEdge(at(r.from, t), at(r.to, t + r.time), r.capacity,
          { type: 'travel', road: r.id, from: r.from, to: r.to, start: t, end: t + r.time });
        if (r.bidirectional) network.addEdge(at(r.to, t), at(r.from, t + r.time), r.capacity,
          { type: 'travel', road: r.id, from: r.to, to: r.from, start: t, end: t + r.time });
      }
    }
    shelters.forEach((s, i) => {
      const gate = gateOffset + i;
      for (let t = 0; t <= horizon; t++) network.addEdge(at(s.id, t), gate, total, { type: 'arrive', shelter: s.id, time: t });
      // One shared gate enforces TOTAL shelter occupancy across every minute.
      network.addEdge(gate, sink, s.capacity, { type: 'shelter', shelter: s.id });
    });
    return { network, source, sink, total };
  }

  function decompose(network, source, sink) {
    const remaining = new Map(network.edges.map((e) => [e, e.capacity - e.residual]));
    const paths = [];
    while (true) {
      const parent = new Map([[source, null]]), queue = [source];
      for (let head = 0; head < queue.length && !parent.has(sink); head++) {
        for (const e of network.graph[queue[head]]) {
          if (!(remaining.get(e) > 0) || parent.has(e.to)) continue;
          parent.set(e.to, e); queue.push(e.to);
        }
      }
      if (!parent.has(sink)) break;
      const chain = []; let amount = Infinity;
      for (let v = sink; v !== source;) { const e = parent.get(v); chain.push(e); amount = Math.min(amount, remaining.get(e)); v = e.from; }
      chain.reverse(); chain.forEach((e) => remaining.set(e, remaining.get(e) - amount));
      const arrival = chain.find((e) => e.meta?.type === 'arrive').meta;
      paths.push({ people: amount, origin: chain[0].meta.origin, shelter: arrival.shelter, arrival: arrival.time,
        steps: chain.filter((e) => ['wait', 'travel'].includes(e.meta?.type)).map((e) => ({ ...e.meta })) });
    }
    return paths.sort((a, b) => a.arrival - b.arrival || a.origin.localeCompare(b.origin));
  }

  function solveDeadline(scenario, horizon, details = true) {
    if (!Number.isInteger(horizon) || horizon < 0 || horizon > LIMITS.horizon) throw new Error('Deadline must be an integer from 0 to 60 minutes.');
    const { network, source, sink, total } = makeTimeNetwork(scenario, horizon);
    const flow = network.maxFlow(source, sink);
    if (!details) return flow.value;
    const arrivals = Array(horizon + 1).fill(0), shelters = Object.create(null), roads = Object.create(null);
    for (const s of scenario.nodes.filter((n) => n.type === 'shelter')) shelters[s.id] = { used: 0, capacity: s.capacity, arrivals: Array(horizon + 1).fill(0) };
    for (const r of scenario.roads) roads[r.id] = { people: 0, peak: 0, departures: [] };
    for (const e of network.edges) {
      const used = e.capacity - e.residual, m = e.meta;
      if (!used) continue;
      if (m.type === 'arrive') { arrivals[m.time] += used; shelters[m.shelter].used += used; shelters[m.shelter].arrivals[m.time] += used; }
      if (m.type === 'travel') {
        roads[m.road].people += used; roads[m.road].peak = Math.max(roads[m.road].peak, used);
        roads[m.road].departures.push({ from: m.from, to: m.to, minute: m.start, people: used });
      }
    }
    let sum = 0; const cumulative = arrivals.map((v) => sum += v);
    return { total, evacuated: flow.value, remaining: total - flow.value, horizon, arrivals, cumulative, shelters, roads,
      paths: decompose(network, source, sink),
      stats: { vertices: network.graph.length, edges: network.edges.length, augmentations: flow.augmentations } };
  }

  // Remove rate limits but retain initial populations, direction and total shelter space.
  // Positive-capacity open roads can carry arbitrarily many people given enough time.
  function eventualCapacity(scenario) {
    const count = scenario.nodes.length, source = count, sink = count + 1, network = new FlowNetwork(count + 2);
    const index = new Map(scenario.nodes.map((n, i) => [n.id, i])), total = scenario.nodes.reduce((s, n) => s + n.population, 0);
    for (const n of scenario.nodes) {
      if (n.type === 'origin') network.addEdge(source, index.get(n.id), n.population);
      if (n.type === 'shelter') network.addEdge(index.get(n.id), sink, n.capacity);
    }
    for (const r of scenario.roads) {
      if (r.blocked) continue;
      network.addEdge(index.get(r.from), index.get(r.to), total);
      if (r.bidirectional) network.addEdge(index.get(r.to), index.get(r.from), total);
    }
    return network.maxFlow(source, sink).value;
  }

  function analyze(input, horizon) {
    const scenario = validate(input), result = solveDeadline(scenario, horizon), origins = Object.create(null);
    let isolatedPopulation = 0;
    for (const n of scenario.nodes.filter((n) => n.type === 'origin')) {
      const routes = dijkstra(scenario, n.id), reachable = routes.shelters.some((s) => s.time !== null);
      origins[n.id] = { bfs: bfs(scenario, n.id), routes, reachable };
      if (!reachable) isolatedPopulation += n.population;
    }
    const eventual = eventualCapacity(scenario); let completion;
    if (result.total === 0) completion = { status: 'complete', minutes: 0 };
    else if (eventual < result.total) completion = { status: 'impossible', minutes: null };
    else {
      const cache = new Map([[horizon, result.evacuated]]);
      const value = (h) => { if (!cache.has(h)) cache.set(h, solveDeadline(scenario, h, false)); return cache.get(h); };
      let lo = result.evacuated === result.total ? 0 : horizon + 1;
      let hi = result.evacuated === result.total ? horizon : LIMITS.horizon;
      if (lo > hi || value(hi) < result.total) completion = { status: 'beyond_limit', minutes: null, limit: LIMITS.horizon };
      else {
        while (lo < hi) { const mid = (lo + hi) >> 1; if (value(mid) === result.total) hi = mid; else lo = mid + 1; }
        completion = { status: 'complete', minutes: lo };
      }
    }
    return { ...result, origins, isolatedPopulation, eventual, completion };
  }

  return { LIMITS, validate, bfs, dijkstra, FlowNetwork, solveDeadline, eventualCapacity, analyze };
});
