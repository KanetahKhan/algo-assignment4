# Implementation notes

## 1. Problem and scope

Given a damaged road network, initial populations, road travel times and entry capacities, and total shelter spaces, compute the maximum number of people who can arrive at shelters by deadline H. Also find the smallest feasible H that accommodates everyone, if it lies within the 60-minute limit.

The implementation follows the uploaded earthquake-evacuation proposal's BFS, Dijkstra and max-flow components. It adds an explicit time-expanded model because ordinary static max-flow cannot, by itself, determine how many people arrive before a deadline when roads have different travel times.

All algorithms are implemented from scratch in C++17 in the `cpp/` folder, using only the standard library (`std::vector`, `std::queue`, `std::priority_queue`). The one C++ implementation is compiled two ways:

- **With g++** into `saferoute.exe`, the command-line solver, and `engine_test.exe`, the test suite.
- **With Emscripten** into WebAssembly (`src/saferoute_wasm.js`), which the browser runs. The interface's calculations are therefore the same C++ code, and no backend or internet connection is needed.

### Source map

| File | Contents |
|---|---|
| `cpp/scenario.hpp/.cpp` | `Location`, `Road`, `Scenario` structs; `validate()` checks every input field |
| `cpp/algorithms.hpp/.cpp` | `bfs()`, `dijkstra()`, `FlowNetwork` (Edmonds–Karp), `buildTimeExpandedNetwork()`, `decompose()`, `solveDeadline()`, `eventualCapacity()`, `analyze()` (binary search) |
| `cpp/main.cpp` | Command-line interface |
| `cpp/report.hpp/.cpp` | Converts result structs to JSON (support code) |
| `cpp/json.hpp/.cpp` | Minimal JSON reader/writer (support code) |
| `cpp/wasm_bridge.cpp` | The single function the browser calls: `saferoute_call(command, scenario, options)` |
| `src/engine.js` | Browser side of the bridge: converts JavaScript objects to JSON and back; no algorithms |
| `tests/engine_test.cpp` | C++ algorithm tests |

## 2. Data model

A scenario has `name`, `description`, `nodes`, and `roads`.

Each location has a unique ID, a display name, a type (`origin`, `junction`, or `shelter`), initial population, shelter capacity, and drawing coordinates. Only origins have initial population. Only shelters have shelter capacity. Positions affect the drawing only.

Each road has a unique ID, endpoints, positive integer `time`, positive integer `capacity`, `blocked`, and `bidirectional`. Closed roads are removed from every algorithm. A two-way road is modeled as two independent directed roads, each with the stated capacity. Parallel roads are supported with distinct IDs and independent residual edges.

For example:

```json
{
  "name": "Ten people",
  "nodes": [
    {"id":"A","name":"Homes","type":"origin","population":10,"capacity":0,"x":190,"y":250},
    {"id":"S","name":"Shelter","type":"shelter","population":0,"capacity":10,"x":700,"y":250}
  ],
  "roads": [
    {"id":"R1","from":"A","to":"S","time":2,"capacity":3,"blocked":false,"bidirectional":false}
  ]
}
```

## 3. BFS: what remains reachable?

`buildAdjacency()` builds adjacency lists (`std::vector<std::vector<Arc>>`) from open roads. `bfs()` starts at a selected origin, pushes it onto a `std::queue`, and visits every previously unseen neighbor, recording each location's BFS-tree parent.

Output: traversal order and predecessor map. A population is geographically isolated if it cannot reach any shelter with positive total capacity. Reachability does not guarantee sufficient shelter space or arrival before the deadline.

Time: O(V + E). Graph and auxiliary space: O(V + E).

## 4. Dijkstra: fastest individual travel

`dijkstra()` uses travel minutes as weights and a binary min-heap: `std::priority_queue<std::pair<int,int>, std::vector<...>, std::greater<...>>` holding (distance, location). Relaxation updates a distance when `distance[u] + road.time` is smaller. Each improvement inserts a heap entry; obsolete entries are skipped when popped. Predecessor roads reconstruct each reachable shelter route.

All weights are positive, so Dijkstra applies. Parallel edges are permitted. A safe bound for this lazy-heap implementation is O((V + E) log(V + E)) time and O(V + E) space. For a simple graph the usual O((V + E) log V) form also applies.

These are uncongested travel-time paths. The flow planner may choose other routes or wait because of capacities. Dijkstra is an explanatory view, not a preprocessing step that restricts max-flow to shortest paths.

## 5. Time-expanded flow: arrivals by a deadline

For each physical location v, create nodes (v,0), (v,1), ..., (v,H).

| Edge | Capacity | Meaning |
|---|---:|---|
| Source -> (origin,0) | Initial population | A person enters the model only once |
| (v,t) -> (v,t+1) | Total population P | Waiting at a location |
| (u,t) -> (v,t+d) | Road entry capacity c | Depart at t and arrive after d minutes |
| (shelter,t) -> shelter gate | P | Enter shelter at that minute |
| Shelter gate -> sink | Total shelter spaces | One shared occupancy limit across all minutes |

Only travel edges with `t + d <= H` are included. Thus the solution cannot count somebody still traveling at the deadline. A single shelter gate prevents incorrectly refreshing shelter space every minute. Waiting capacity P acts as a sufficient finite bound because there are only P people in the system.

`FlowNetwork::maxFlow()` implements Edmonds–Karp: BFS finds a shortest residual augmenting path in number of edges, its smallest residual capacity is pushed, and reverse capacities are updated. Edges are stored in one array in pairs: edge `e` is a forward edge and `e ^ 1` is its reverse edge, so every forward edge, including parallel roads, has its own reverse edge. Reverse edges allow earlier route decisions to be revised. `buildTimeExpandedNetwork()` creates the graph in the table above and records what each edge means (`EdgeInfo`: wait, travel, arrive, and so on) so the schedule can be read back.

Integer capacities yield an integral flow. Flow conservation ensures no duplication or disappearance of people, and each unit of source-to-sink flow is one arrival by H. Conversely, any schedule satisfying these discrete-time assumptions can be represented in this graph, so maximum flow solves the stated deadline objective exactly.

For V locations, E directed road arcs, K shelters and H minutes, V' = V(H+1) + K + 2 and E' = O(H(V+E+K)). Edmonds–Karp costs O(V' E'^2) with O(V'+E') storage. It is chosen for transparency and modest classroom scenarios, not city-scale performance.

## 6. Schedule extraction and playback

After solving, `decompose()` reads positive flow on original edges. It repeatedly extracts a source-to-sink path and removes its bottleneck amount from a separate remaining-flow array. Original travel and waiting edges strictly advance time, so the original time-expanded graph is acyclic; the resulting flow can be decomposed into complete journeys.

Each group records its count, origin, shelter, arrival minute, and ordered waiting/travel steps. The sum of group counts equals the maximum flow. CSV export includes every step and its start/end minutes. Playback interpolates positions along each road but adds arrivals only at the scheduled integer arrival time. People who are not assigned a complete journey by the deadline are included in “still needing evacuation” and are not animated as partial journeys.

## 7. Earliest full evacuation and infeasibility

First, `eventualCapacity()` solves a separate static flow network with road rate limits replaced by P, but keeps blocked roads, direction, initial populations and total shelter space. It asks how many people could eventually be sheltered if given enough time. With positive road capacities and unlimited waiting, every path carrying people can eventually clear. If this maximum is below P, no full evacuation is possible on the current network even with unlimited time. This also detects shelter-allocation bottlenecks when spare spaces exist in the wrong connected component.

Otherwise, binary search finds the smallest H for which time-expanded max-flow equals P. The predicate is monotone: increasing the deadline preserves every previously feasible schedule. If H=60 is still insufficient, display “> 60 min,” not “impossible.” Zero initial population completes at time 0. The search takes O(log H) flow solves in addition to the selected deadline calculation.

## 8. UI architecture and data flow

1. `scenarios.js` provides the initial synthetic network.
2. `app.js` owns current scenario, selected road/location, origin, deadline and playback state.
3. Every structural edit invalidates the old plan, stops playback and cancels an in-flight calculation.
4. `engine.js` waits for the WebAssembly module to load, then passes each request to the C++ function `saferoute_call` as JSON and parses the JSON reply. A calculation takes milliseconds, so it runs on the main thread.
5. A version token prevents a stale calculation from replacing results for a newer scenario.
6. SVG is drawn from the scenario, and result panels use the returned schedule and statistics.
7. Import validates all fields before replacing the current scenario. User-controlled text is escaped for HTML; CSV cells neutralize spreadsheet-formula prefixes.
8. JSON export saves the current network. Reloading does not preserve edits automatically; import a saved network to restore it.

No real geographic coordinates, external map tiles, traffic feeds, machine learning, accounts, database, or API keys are used.

## 9. What this implementation does not claim

- It does not predict earthquakes or certify that a real route is safe.
- Road travel times are fixed and integer. People are homogeneous and can split into integer groups.
- Road capacity is entry flow per minute, not simultaneous occupancy.
- Two-way directions have independent capacity; shared-lane contraflow requires a different model.
- Waiting at junctions is unlimited; intersection capacity and physical queue spillback are not modeled.
- Shelter safety/availability is represented by total spaces only.
- It maximizes arrivals by H, not fairness, least total travel time, earliest intermediate arrivals, or a separate congestion objective.
- It recalculates from minute zero after an edit. It does not track an aftershock interrupting people already in transit.
- The visual road layout is schematic. It is not an actual IUT or Bangladesh emergency map.

These boundaries keep the implementation correct and explainable instead of attributing capabilities to ordinary max-flow that it does not have.
