// SafeRoute — graph algorithms for earthquake evacuation planning.
#include "algorithms.hpp"

#include <algorithm>
#include <functional>
#include <map>
#include <queue>
#include <stdexcept>
#include <utility>

namespace saferoute {

void checkDeadline(int horizon) {
    if (horizon < 0 || horizon > Limits::horizon)
        throw std::runtime_error("Deadline must be an integer from 0 to 60 minutes.");
}

std::vector<std::vector<Arc>> buildAdjacency(const Scenario& s) {
    std::vector<std::vector<Arc>> graph(s.nodes.size());
    for (int r = 0; r < static_cast<int>(s.roads.size()); r++) {
        const Road& road = s.roads[r];
        if (road.blocked) continue;
        graph[road.from].push_back({road.to, r, road.time});
        if (road.bidirectional) graph[road.to].push_back({road.from, r, road.time});
    }
    return graph;
}

static void checkStart(const Scenario& s, int start) {
    if (start < 0 || start >= static_cast<int>(s.nodes.size()))
        throw std::runtime_error("Select an existing start location.");
}

// =====================================================================
// 1. Breadth-first search — O(V + E)
//    Explores locations in layers of "number of roads away". Used to show
//    which locations an origin can reach at all through open roads.
// =====================================================================
BfsResult bfs(const Scenario& s, int start) {
    checkStart(s, start);
    const auto graph = buildAdjacency(s);
    const int n = static_cast<int>(s.nodes.size());

    BfsResult result;
    result.parent.assign(n, -1);
    std::vector<bool> seen(n, false);

    std::queue<int> q;
    q.push(start);
    seen[start] = true;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        result.order.push_back(u);
        for (const Arc& arc : graph[u]) {
            if (seen[arc.to]) continue;
            seen[arc.to] = true;
            result.parent[arc.to] = u;
            q.push(arc.to);
        }
    }
    return result;
}

// =====================================================================
// 2. Dijkstra's algorithm with a binary heap — O((V + E) log V)
//    Road travel times are positive, so the location with the smallest
//    tentative distance popped from the heap is final.
// =====================================================================
ShortestPaths dijkstra(const Scenario& s, int start) {
    checkStart(s, start);
    const auto graph = buildAdjacency(s);
    const int n = static_cast<int>(s.nodes.size());

    ShortestPaths result;
    result.distance.assign(n, UNREACHABLE);
    std::vector<int> prevNode(n, -1), prevRoad(n, -1);

    // Min-heap of (distance, location).
    using Item = std::pair<int, int>;
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> heap;
    result.distance[start] = 0;
    heap.push({0, start});

    while (!heap.empty()) {
        auto [d, u] = heap.top();
        heap.pop();
        if (d != result.distance[u]) continue;   // stale entry: u was already finalised
        result.order.push_back(u);
        for (const Arc& arc : graph[u]) {
            int next = d + arc.time;
            if (next < result.distance[arc.to]) {   // relax the edge
                result.distance[arc.to] = next;
                prevNode[arc.to] = u;
                prevRoad[arc.to] = arc.road;
                heap.push({next, arc.to});
            }
        }
    }

    // Rebuild the route to every shelter by walking the predecessor links backwards.
    for (int v = 0; v < n; v++) {
        if (s.nodes[v].type != LocationType::Shelter || s.nodes[v].capacity <= 0) continue;
        ShelterRoute route{v, result.distance[v], {}, {}};
        if (route.time != UNREACHABLE) {
            for (int u = v; u != start; u = prevNode[u]) {
                route.nodes.push_back(u);
                route.roads.push_back(prevRoad[u]);
            }
            route.nodes.push_back(start);
            std::reverse(route.nodes.begin(), route.nodes.end());
            std::reverse(route.roads.begin(), route.roads.end());
        }
        result.shelters.push_back(route);
    }
    std::stable_sort(result.shelters.begin(), result.shelters.end(),
                     [](const ShelterRoute& a, const ShelterRoute& b) { return a.time < b.time; });
    return result;
}

// =====================================================================
// 3. Maximum flow — Edmonds–Karp, O(V · E²)
//    Ford–Fulkerson where every augmenting path is a shortest path (fewest
//    edges), found by BFS in the residual graph.
// =====================================================================
FlowNetwork::FlowNetwork(int vertices) : adj_(vertices) {}

int FlowNetwork::addEdge(int from, int to, int capacity) {
    int id = static_cast<int>(edges_.size());
    edges_.push_back({from, to, capacity, capacity});   // forward edge: id
    edges_.push_back({to, from, 0, 0});                 // reverse edge: id ^ 1
    adj_[from].push_back(id);
    adj_[to].push_back(id ^ 1);
    return id;
}

FlowNetwork::MaxFlowResult FlowNetwork::maxFlow(int source, int sink) {
    if (source == sink) throw std::runtime_error("Flow source and sink must differ.");
    const int n = vertexCount();
    MaxFlowResult result{0, 0};
    std::vector<int> parentEdge(n);   // edge used to reach each vertex in this BFS

    while (true) {
        // BFS in the residual graph for the shortest augmenting path.
        std::fill(parentEdge.begin(), parentEdge.end(), -1);
        std::vector<bool> visited(n, false);
        visited[source] = true;
        std::queue<int> q;
        q.push(source);
        while (!q.empty() && !visited[sink]) {
            int u = q.front();
            q.pop();
            for (int id : adj_[u]) {
                const Edge& e = edges_[id];
                if (e.residual <= 0 || visited[e.to]) continue;
                visited[e.to] = true;
                parentEdge[e.to] = id;
                q.push(e.to);
                if (e.to == sink) break;
            }
        }
        if (!visited[sink]) break;   // no augmenting path: the flow is maximum

        // Bottleneck = smallest residual capacity along the path.
        int amount = INT_MAX;
        for (int v = sink; v != source; v = edges_[parentEdge[v]].from)
            amount = std::min(amount, edges_[parentEdge[v]].residual);

        // Push the flow; the paired reverse edge lets a later path undo it.
        for (int v = sink; v != source; v = edges_[parentEdge[v]].from) {
            edges_[parentEdge[v]].residual -= amount;
            edges_[parentEdge[v] ^ 1].residual += amount;
        }
        result.value += amount;
        result.augmentations++;
    }
    return result;
}

// ---------------------------------------------------------------------
// Time-expanded network for a deadline H.
//
//   vertex (v, t)  = location v at minute t, for t = 0..H
//   source -> (origin, 0)            capacity = people living there
//   (v, t) -> (v, t+1)               waiting, unlimited
//   (a, t) -> (b, t + travel time)   road entry, capacity per minute
//   (shelter, t) -> gate(shelter)    arriving at minute t
//   gate(shelter) -> sink            capacity = TOTAL shelter spaces
//
// One gate per shelter makes its capacity a total over all minutes,
// not a per-minute limit. A maximum flow = most people safe by minute H.
// ---------------------------------------------------------------------
TimeExpandedNetwork buildTimeExpandedNetwork(const Scenario& s, int horizon) {
    const int count = static_cast<int>(s.nodes.size());
    std::vector<int> shelters;
    for (int v = 0; v < count; v++)
        if (s.nodes[v].type == LocationType::Shelter) shelters.push_back(v);

    const int gateOffset = count * (horizon + 1);
    TimeExpandedNetwork net;
    net.source = gateOffset + static_cast<int>(shelters.size());
    net.sink = net.source + 1;
    net.network = FlowNetwork(net.sink + 1);
    const int total = s.totalPopulation();

    auto at = [count](int v, int t) { return t * count + v; };
    auto add = [&net](int from, int to, int capacity, EdgeInfo info) {
        net.network.addEdge(from, to, capacity);
        net.info.push_back(info);
    };

    for (int v = 0; v < count; v++) {
        const Location& loc = s.nodes[v];
        if (loc.type == LocationType::Origin && loc.population)
            add(net.source, at(v, 0), loc.population, {EdgeKind::Source, v});
        for (int t = 0; t < horizon; t++) {
            EdgeInfo wait{EdgeKind::Wait, v};
            wait.start = t;
            wait.end = t + 1;
            add(at(v, t), at(v, t + 1), total, wait);
        }
    }

    for (int r = 0; r < static_cast<int>(s.roads.size()); r++) {
        const Road& road = s.roads[r];
        if (road.blocked) continue;
        for (int t = 0; t + road.time <= horizon; t++) {
            EdgeInfo travel{EdgeKind::Travel};
            travel.road = r;
            travel.start = t;
            travel.end = t + road.time;
            travel.from = road.from;
            travel.to = road.to;
            add(at(road.from, t), at(road.to, t + road.time), road.capacity, travel);
            if (road.bidirectional) {
                travel.from = road.to;
                travel.to = road.from;
                add(at(road.to, t), at(road.from, t + road.time), road.capacity, travel);
            }
        }
    }

    for (int i = 0; i < static_cast<int>(shelters.size()); i++) {
        const int v = shelters[i], gate = gateOffset + i;
        for (int t = 0; t <= horizon; t++) {
            EdgeInfo arrive{EdgeKind::Arrive, v};
            arrive.start = t;
            add(at(v, t), gate, total, arrive);
        }
        add(gate, net.sink, s.nodes[v].capacity, {EdgeKind::ShelterGate, v});
    }
    return net;
}

// Flow decomposition: split the maximum flow into groups of people that follow
// one source-to-sink path each. Repeatedly find a path of edges still carrying
// flow (by BFS), take its bottleneck as the group size, and subtract it.
static std::vector<GroupPath> decompose(const TimeExpandedNetwork& net) {
    const FlowNetwork& g = net.network;
    std::vector<int> remaining(g.edgeCount());
    for (int k = 0; k < g.edgeCount(); k++) remaining[k] = g.flowOn(2 * k);

    std::vector<GroupPath> paths;
    while (true) {
        std::vector<int> parentEdge(g.vertexCount(), -1);
        std::vector<bool> visited(g.vertexCount(), false);
        visited[net.source] = true;
        std::queue<int> q;
        q.push(net.source);
        while (!q.empty() && !visited[net.sink]) {
            int u = q.front();
            q.pop();
            for (int id : g.outgoing(u)) {
                if (id % 2 == 1 || remaining[id / 2] <= 0) continue;   // forward edges with flow only
                int v = g.edge(id).to;
                if (visited[v]) continue;
                visited[v] = true;
                parentEdge[v] = id;
                q.push(v);
            }
        }
        if (!visited[net.sink]) break;

        std::vector<int> chain;   // edge ids from source to sink
        int amount = INT_MAX;
        for (int v = net.sink; v != net.source; v = g.edge(parentEdge[v]).from) {
            chain.push_back(parentEdge[v]);
            amount = std::min(amount, remaining[parentEdge[v] / 2]);
        }
        std::reverse(chain.begin(), chain.end());

        GroupPath path{amount, -1, -1, 0, {}};
        for (int id : chain) {
            remaining[id / 2] -= amount;
            const EdgeInfo& info = net.info[id / 2];
            if (info.kind == EdgeKind::Source) path.origin = info.location;
            if (info.kind == EdgeKind::Arrive) { path.shelter = info.location; path.arrival = info.start; }
            if (info.kind == EdgeKind::Wait || info.kind == EdgeKind::Travel) path.steps.push_back(info);
        }
        paths.push_back(path);
    }
    return paths;
}

DeadlinePlan solveDeadline(const Scenario& s, int horizon) {
    checkDeadline(horizon);
    TimeExpandedNetwork net = buildTimeExpandedNetwork(s, horizon);
    FlowNetwork::MaxFlowResult flow = net.network.maxFlow(net.source, net.sink);

    DeadlinePlan plan;
    plan.total = s.totalPopulation();
    plan.evacuated = flow.value;
    plan.remaining = plan.total - flow.value;
    plan.horizon = horizon;
    plan.arrivals.assign(horizon + 1, 0);
    plan.shelters.resize(s.nodes.size());
    for (size_t v = 0; v < s.nodes.size(); v++) {
        plan.shelters[v].capacity = s.nodes[v].capacity;
        plan.shelters[v].arrivals.assign(horizon + 1, 0);
    }
    plan.roads.resize(s.roads.size());

    // Read the schedule off the flow on each forward edge.
    for (int k = 0; k < net.network.edgeCount(); k++) {
        const int used = net.network.flowOn(2 * k);
        const EdgeInfo& info = net.info[k];
        if (!used) continue;
        if (info.kind == EdgeKind::Arrive) {
            plan.arrivals[info.start] += used;
            plan.shelters[info.location].used += used;
            plan.shelters[info.location].arrivals[info.start] += used;
        } else if (info.kind == EdgeKind::Travel) {
            RoadUse& road = plan.roads[info.road];
            road.people += used;
            road.peak = std::max(road.peak, used);
            road.departures.push_back({info.from, info.to, info.start, used});
        }
    }
    int sum = 0;
    for (int a : plan.arrivals) plan.cumulative.push_back(sum += a);

    plan.paths = decompose(net);
    std::stable_sort(plan.paths.begin(), plan.paths.end(), [&s](const GroupPath& a, const GroupPath& b) {
        if (a.arrival != b.arrival) return a.arrival < b.arrival;
        return s.nodes[a.origin].id < s.nodes[b.origin].id;
    });
    plan.vertices = net.network.vertexCount();
    plan.edges = net.network.edgeCount();
    plan.augmentations = flow.augmentations;
    return plan;
}

int maxEvacuatedBy(const Scenario& s, int horizon) {
    checkDeadline(horizon);
    TimeExpandedNetwork net = buildTimeExpandedNetwork(s, horizon);
    return net.network.maxFlow(net.source, net.sink).value;
}

// Ignoring time entirely: origins -> roads (unlimited) -> shelters (total spaces).
// If this flow is below the population, no deadline can ever evacuate everyone.
int eventualCapacity(const Scenario& s) {
    const int count = static_cast<int>(s.nodes.size());
    const int source = count, sink = count + 1, total = s.totalPopulation();
    FlowNetwork network(count + 2);
    for (int v = 0; v < count; v++) {
        if (s.nodes[v].type == LocationType::Origin) network.addEdge(source, v, s.nodes[v].population);
        if (s.nodes[v].type == LocationType::Shelter) network.addEdge(v, sink, s.nodes[v].capacity);
    }
    for (const Road& road : s.roads) {
        if (road.blocked) continue;
        network.addEdge(road.from, road.to, total);
        if (road.bidirectional) network.addEdge(road.to, road.from, total);
    }
    return network.maxFlow(source, sink).value;
}

// =====================================================================
// 4. Earliest full evacuation — binary search over the deadline.
//    maxEvacuatedBy(H) never decreases as H grows (anyone safe by H is
//    still safe by H+1), so the smallest H with everyone safe can be found
//    with O(log 60) max-flow computations instead of trying all 61.
// =====================================================================
Analysis analyze(const Scenario& s, int horizon) {
    Analysis a;
    a.plan = solveDeadline(s, horizon);

    for (int v = 0; v < static_cast<int>(s.nodes.size()); v++) {
        if (s.nodes[v].type != LocationType::Origin) continue;
        OriginAnalysis o{v, bfs(s, v), dijkstra(s, v), false};
        for (const ShelterRoute& route : o.routes.shelters)
            if (route.time != UNREACHABLE) o.reachable = true;
        if (!o.reachable) a.isolatedPopulation += s.nodes[v].population;
        a.origins.push_back(o);
    }

    a.eventual = eventualCapacity(s);
    const int total = a.plan.total;
    if (total == 0) {
        a.completion = {CompletionStatus::Complete, 0};
    } else if (a.eventual < total) {
        a.completion = {CompletionStatus::Impossible, 0};
    } else {
        std::map<int, int> cache{{horizon, a.plan.evacuated}};
        auto value = [&](int h) {
            if (!cache.count(h)) cache[h] = maxEvacuatedBy(s, h);
            return cache[h];
        };
        const bool doneByDeadline = a.plan.evacuated == total;
        int lo = doneByDeadline ? 0 : horizon + 1;
        int hi = doneByDeadline ? horizon : Limits::horizon;
        if (lo > hi || value(hi) < total) {
            a.completion = {CompletionStatus::BeyondLimit, 0};
        } else {
            while (lo < hi) {
                int mid = (lo + hi) / 2;
                if (value(mid) == total) hi = mid;
                else lo = mid + 1;
            }
            a.completion = {CompletionStatus::Complete, lo};
        }
    }
    return a;
}

}  // namespace saferoute
