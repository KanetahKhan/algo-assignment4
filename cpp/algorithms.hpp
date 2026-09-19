// SafeRoute — graph algorithms for earthquake evacuation planning.
//
//   1. BFS            which locations can be reached at all from an origin
//   2. Dijkstra       fastest route (by travel time) from an origin to each shelter
//   3. Edmonds–Karp   maximum number of people who can reach shelters by a deadline,
//                     solved on a time-expanded flow network
//   4. Binary search  earliest deadline at which everyone can be evacuated
//
// Every function takes an already validated Scenario (see scenario.hpp).
#pragma once

#include <climits>
#include <string>
#include <vector>

#include "scenario.hpp"

namespace saferoute {

constexpr int UNREACHABLE = INT_MAX;

// One usable direction of a road, as seen from its starting location.
struct Arc {
    int to;     // location index
    int road;   // index into Scenario::roads
    int time;   // travel minutes
};

// Adjacency list of open roads; a two-way road appears in both lists.
std::vector<std::vector<Arc>> buildAdjacency(const Scenario& s);

// ------------------------------------------------------------------ 1. BFS
struct BfsResult {
    std::vector<int> order;    // locations in the order they were discovered
    std::vector<int> parent;   // parent[v] in the BFS tree, -1 for the start or unreached
};
BfsResult bfs(const Scenario& s, int start);

// ------------------------------------------------------------------ 2. Dijkstra
struct ShelterRoute {
    int shelter;              // location index of the shelter
    int time;                 // shortest travel time, or UNREACHABLE
    std::vector<int> nodes;   // start ... shelter (empty when unreachable)
    std::vector<int> roads;   // road indices along the route
};

struct ShortestPaths {
    std::vector<int> distance;           // minutes to each location, or UNREACHABLE
    std::vector<int> order;              // locations in the order they were finalised
    std::vector<ShelterRoute> shelters;  // shelters with capacity, fastest first
};
ShortestPaths dijkstra(const Scenario& s, int start);

// ------------------------------------------------------------------ 3. Maximum flow
// A directed flow network stored as an edge list. Edge e and edge e^1 are a pair:
// even ids are the real (forward) edges, odd ids are their residual reverse edges.
class FlowNetwork {
public:
    struct Edge {
        int from, to;
        int capacity;   // original capacity (0 for reverse edges)
        int residual;   // capacity still available in the residual graph
    };
    struct MaxFlowResult {
        int value;          // total flow sent from source to sink
        int augmentations;  // number of augmenting paths used
    };

    explicit FlowNetwork(int vertices);

    int addEdge(int from, int to, int capacity);    // returns the forward edge id
    MaxFlowResult maxFlow(int source, int sink);    // Edmonds–Karp

    int vertexCount() const { return static_cast<int>(adj_.size()); }
    int edgeCount() const { return static_cast<int>(edges_.size() / 2); }   // forward edges only
    const Edge& edge(int id) const { return edges_[id]; }
    const std::vector<int>& outgoing(int vertex) const { return adj_[vertex]; }
    int flowOn(int id) const { return edges_[id].capacity - edges_[id].residual; }

private:
    std::vector<Edge> edges_;
    std::vector<std::vector<int>> adj_;   // edge ids leaving each vertex, in insertion order
};

// What a forward edge of the time-expanded network represents.
enum class EdgeKind { Source, Wait, Travel, Arrive, ShelterGate };

struct EdgeInfo {
    EdgeKind kind;
    int location = -1;   // Source: origin; Wait: where; Arrive/ShelterGate: shelter
    int road = -1;       // Travel only
    int from = -1, to = -1;   // Travel only (direction actually used)
    int start = 0, end = 0;   // Wait/Travel: minutes; Arrive: arrival minute in `start`
};

// Vertex (v, t) means "at location v at minute t", for t = 0..horizon.
struct TimeExpandedNetwork {
    FlowNetwork network{0};
    std::vector<EdgeInfo> info;   // info[k] describes forward edge id 2k
    int source = 0, sink = 0;
};
TimeExpandedNetwork buildTimeExpandedNetwork(const Scenario& s, int horizon);

// A group of people who all follow the same route and schedule.
struct GroupPath {
    int people;
    int origin, shelter;
    int arrival;                    // minute they reach the shelter
    std::vector<EdgeInfo> steps;    // Wait and Travel edges in time order
};

struct Departure { int from, to, minute, people; };
struct RoadUse { int people = 0, peak = 0; std::vector<Departure> departures; };
struct ShelterUse { int used = 0, capacity = 0; std::vector<int> arrivals; };   // arrivals per minute

struct DeadlinePlan {
    int total = 0, evacuated = 0, remaining = 0, horizon = 0;
    std::vector<int> arrivals, cumulative;   // people reaching shelters at / by each minute
    std::vector<ShelterUse> shelters;        // indexed by location (only shelters are used)
    std::vector<RoadUse> roads;              // indexed by road
    std::vector<GroupPath> paths;
    int vertices = 0, edges = 0, augmentations = 0;
};

// Maximum number of people who can arrive by `horizon`, with a full schedule.
DeadlinePlan solveDeadline(const Scenario& s, int horizon);
// Same maximum, without building the schedule (used by the binary search).
int maxEvacuatedBy(const Scenario& s, int horizon);
// People that could EVER reach a shelter, ignoring time and per-minute road limits.
int eventualCapacity(const Scenario& s);

// ------------------------------------------------------------------ 4. Full analysis
enum class CompletionStatus { Complete, Impossible, BeyondLimit };
struct Completion {
    CompletionStatus status;
    int minutes;   // valid only when status == Complete
};

struct OriginAnalysis {
    int origin;
    BfsResult reach;
    ShortestPaths routes;
    bool reachable;   // true when some shelter can be reached
};

struct Analysis {
    DeadlinePlan plan;
    std::vector<OriginAnalysis> origins;
    int isolatedPopulation = 0;
    int eventual = 0;
    Completion completion{CompletionStatus::Complete, 0};
};

Analysis analyze(const Scenario& s, int horizon);

// Throws unless 0 <= horizon <= Limits::horizon.
void checkDeadline(int horizon);

}  // namespace saferoute
