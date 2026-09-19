// SafeRoute — automated tests for the C++ algorithms. No test framework needed.
//
// Build and run from the project folder (the sample scenarios are read from ./scenarios):
//   g++ -std=c++17 -O2 -Icpp -o engine_test tests/engine_test.cpp cpp/algorithms.cpp cpp/scenario.cpp cpp/report.cpp cpp/json.cpp
//   ./engine_test
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "algorithms.hpp"

using namespace saferoute;

static int failures = 0;

#define CHECK(condition)                                                                 \
    do {                                                                                 \
        if (!(condition)) {                                                              \
            failures++;                                                                  \
            std::cerr << "    line " << __LINE__ << ": CHECK failed: " #condition "\n"; \
        }                                                                                \
    } while (0)

#define CHECK_THROWS(expression, fragment)                                                     \
    do {                                                                                       \
        std::string message_;                                                                  \
        try { expression; } catch (const std::exception& e) { message_ = e.what(); }           \
        if (message_.find(fragment) == std::string::npos) {                                    \
            failures++;                                                                        \
            std::cerr << "    line " << __LINE__ << ": expected an error containing \"" << fragment \
                      << "\", got \"" << message_ << "\"\n";                                   \
        }                                                                                      \
    } while (0)

// ------------------------------------------------------------------ helpers

static const char* SMALL_EXAMPLE = R"({
  "name": "Small example", "nodes": [
    {"id": "A", "name": "Residential block", "x": 190, "y": 250, "type": "origin", "population": 10, "capacity": 0},
    {"id": "S", "name": "Safe assembly area", "x": 700, "y": 250, "type": "shelter", "population": 0, "capacity": 10}],
  "roads": [{"id": "R1", "from": "A", "to": "S", "time": 2, "capacity": 3, "blocked": false, "bidirectional": false}]
})";

// One origin A (10 people) -> one-way road R1 (2 min, 3 people/min) -> shelter S (10 spaces).
static Scenario small() { return validate(json::Value::parse(SMALL_EXAMPLE)); }

static Scenario loadFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path + " (run the tests from the project folder)");
    std::ostringstream text;
    text << in.rdbuf();
    return validate(json::Value::parse(text.str()));
}

static Location junction(const std::string& id) {
    Location j;
    j.id = j.name = id;
    j.type = LocationType::Junction;
    return j;
}

static Road road(const std::string& id, int from, int to, int time, int capacity, bool bidirectional) {
    Road r;
    r.id = id;
    r.from = from;
    r.to = to;
    r.time = time;
    r.capacity = capacity;
    r.bidirectional = bidirectional;
    return r;
}

// ------------------------------------------------------------------ tests

static void knownMaxFlow() {
    // Classic textbook network (CLRS, Figure 26.1) with maximum flow 23.
    FlowNetwork f(6);
    int edges[][3] = {{0, 1, 16}, {0, 2, 13}, {1, 2, 10}, {2, 1, 4}, {1, 3, 12},
                      {3, 2, 9},  {2, 4, 14}, {4, 3, 7},  {3, 5, 20}, {4, 5, 4}};
    for (auto& e : edges) f.addEdge(e[0], e[1], e[2]);
    CHECK(f.maxFlow(0, 5).value == 23);
}

static void residualEdgesReroute() {
    // A path through 1->3 first would block the second unit unless the reverse edge can undo it.
    FlowNetwork f(6);
    int edges[][3] = {{0, 1, 1}, {0, 2, 1}, {1, 3, 1}, {1, 4, 1}, {2, 3, 1}, {3, 5, 1}, {4, 5, 1}};
    for (auto& e : edges) f.addEdge(e[0], e[1], e[2]);
    CHECK(f.maxFlow(0, 5).value == 2);
}

static void roadRateAndTravelTime() {
    Scenario s = small();
    CHECK(solveDeadline(s, 1).evacuated == 0);
    CHECK(solveDeadline(s, 3).evacuated == 6);
    CHECK((solveDeadline(s, 5).arrivals == std::vector<int>{0, 0, 3, 3, 3, 1}));
    Analysis a = analyze(s, 3);
    CHECK(a.completion.status == CompletionStatus::Complete && a.completion.minutes == 5);
}

static void shelterSpaceIsTotal() {
    Scenario s = small();
    s.nodes[1].capacity = 5;
    Analysis a = analyze(s, 10);
    CHECK(a.plan.evacuated == 5);
    CHECK(a.eventual == 5);
    CHECK(a.completion.status == CompletionStatus::Impossible);
}

static void blockedRoadIsIgnored() {
    Scenario s = small();
    s.roads[0].blocked = true;
    Analysis a = analyze(s, 10);
    CHECK((a.origins[0].reach.order == std::vector<int>{0}));
    CHECK(a.origins[0].routes.shelters[0].time == UNREACHABLE);
    CHECK(a.plan.evacuated == 0);
    CHECK(a.isolatedPopulation == 10);
}

static void oneWayRoads() {
    Scenario s = small();
    std::swap(s.roads[0].from, s.roads[0].to);
    CHECK(analyze(s, 10).plan.evacuated == 0);
    s.roads[0].bidirectional = true;
    CHECK(analyze(s, 10).plan.evacuated == 10);
}

static void dijkstraUsesTravelTime() {
    Scenario s = small();
    s.nodes.push_back(junction("J"));
    s.roads[0].time = 9;                                  // direct road: 1 hop, 9 minutes
    s.roads.push_back(road("r2", 0, 2, 2, 2, false));     // A -> J: 2 minutes
    s.roads.push_back(road("r3", 2, 1, 3, 2, false));     // J -> S: 3 minutes
    ShortestPaths p = dijkstra(s, 0);
    CHECK(p.shelters[0].time == 5);
    CHECK((p.shelters[0].nodes == std::vector<int>{0, 2, 1}));
}

static void parallelRoadsKeepCapacities() {
    Scenario s = small();
    Road copy = s.roads[0];
    copy.id = "R2";
    s.roads.push_back(copy);
    CHECK(solveDeadline(s, 2).evacuated == 6);
}

static void originsShareShelters() {
    Scenario s = small();
    Location b = s.nodes[0];
    b.id = "B";
    s.nodes.push_back(b);
    Road copy = s.roads[0];
    copy.id = "R2";
    copy.from = 2;
    s.roads.push_back(copy);
    Analysis a = analyze(s, 10);
    CHECK(a.plan.total == 20);
    CHECK(a.plan.evacuated == 10);
    int grouped = 0;
    for (const GroupPath& p : a.plan.paths) grouped += p.people;
    CHECK(grouped == 10);
}

static void noPopulationCompletesImmediately() {
    Scenario s = small();
    s.nodes[0].population = 0;
    Analysis a = analyze(s, 0);
    CHECK(a.completion.status == CompletionStatus::Complete && a.completion.minutes == 0);
}

static void beyondSearchLimitIsNotImpossible() {
    Scenario s = small();
    s.nodes.push_back(junction("J"));
    s.roads[0].to = 2;
    s.roads[0].time = 40;
    Road second = s.roads[0];
    second.id = "R2";
    second.from = 2;
    second.to = 1;
    s.roads.push_back(second);   // A -> J -> S takes 80 minutes
    Analysis a = analyze(s, 10);
    CHECK(a.eventual == 10);
    CHECK(a.completion.status == CompletionStatus::BeyondLimit);
}

static void unreachableSpareSpaceDoesNotHelp() {
    Scenario s = small();
    s.nodes[1].capacity = 5;
    Location spare = s.nodes[1];
    spare.id = "S2";
    spare.capacity = 100;   // no road reaches it
    s.nodes.push_back(spare);
    Analysis a = analyze(s, 10);
    CHECK(a.eventual == 5);
    CHECK(a.completion.status == CompletionStatus::Impossible);
}

static void schedulesAreConsistent() {
    for (const char* file : {"scenarios/campus.json", "scenarios/damaged-roads.json",
                             "scenarios/limited-shelters.json", "scenarios/teaching-example.json"}) {
        Scenario s = loadFile(file);
        DeadlinePlan plan = solveDeadline(s, 12);
        int grouped = 0, arrived = 0;
        for (int a : plan.arrivals) arrived += a;
        std::map<int, int> leaving;                  // people leaving each origin
        std::map<std::string, int> roadLoad;         // people entering road/direction/minute
        for (const GroupPath& p : plan.paths) {
            grouped += p.people;
            leaving[p.origin] += p.people;
            int at = p.origin, time = 0;
            for (const EdgeInfo& step : p.steps) {
                CHECK(step.start == time);
                if (step.kind == EdgeKind::Wait) {
                    CHECK(step.location == at);
                } else {
                    const Road& r = s.roads[step.road];
                    CHECK(step.from == at);
                    CHECK(!r.blocked);
                    CHECK(step.end - step.start == r.time);
                    CHECK((r.from == step.from && r.to == step.to) || (r.bidirectional && r.to == step.from && r.from == step.to));
                    std::string key = r.id + ":" + std::to_string(step.from) + ":" + std::to_string(step.start);
                    roadLoad[key] += p.people;
                    CHECK(roadLoad[key] <= r.capacity);
                    at = step.to;
                }
                time = step.end;
            }
            CHECK(at == p.shelter);
            CHECK(time == p.arrival);
            CHECK(time <= plan.horizon);
        }
        CHECK(grouped == plan.evacuated);
        CHECK(arrived == plan.evacuated);
        for (int v = 0; v < static_cast<int>(s.nodes.size()); v++) {
            CHECK(leaving[v] <= s.nodes[v].population);
            if (s.nodes[v].type == LocationType::Shelter) CHECK(plan.shelters[v].used <= s.nodes[v].capacity);
        }
        for (int h = 1; h <= 12; h++) CHECK(maxEvacuatedBy(s, h) >= maxEvacuatedBy(s, h - 1));
    }
}

static void validationRejectsBadInput() {
    auto edited = [](const std::function<void(json::Value&)>& change) {
        json::Value v = json::Value::parse(SMALL_EXAMPLE);
        change(v);
        return v;
    };
    CHECK_THROWS(validate(edited([](json::Value& v) { v["roads"].items()[0]["time"] = 1.5; })), "integer");
    CHECK_THROWS(validate(edited([](json::Value& v) { v["nodes"].push(v["nodes"].items()[0]); })), "unique");
    CHECK_THROWS(validate(edited([](json::Value& v) { v["roads"].items()[0]["blocked"] = "false"; })), "true or false");
    CHECK_THROWS(validate(edited([](json::Value& v) { v["nodes"].items()[0]["population"] = 3001; })), "integer");
    CHECK_THROWS(solveDeadline(small(), 61), "Deadline");
}

static void sampleOutputs() {
    struct Expected { const char* file; int deadline, evacuated; CompletionStatus status; int minutes; };
    const Expected cases[] = {
        {"scenarios/campus.json", 12, 176, CompletionStatus::Complete, 13},
        {"scenarios/damaged-roads.json", 12, 110, CompletionStatus::Complete, 17},
        {"scenarios/limited-shelters.json", 12, 120, CompletionStatus::Impossible, 0},
        {"scenarios/teaching-example.json", 3, 6, CompletionStatus::Complete, 5},
    };
    for (const Expected& c : cases) {
        Analysis a = analyze(loadFile(c.file), c.deadline);
        CHECK(a.plan.evacuated == c.evacuated);
        CHECK(a.completion.status == c.status);
        if (c.status == CompletionStatus::Complete) CHECK(a.completion.minutes == c.minutes);
    }
}

int main() {
    const std::pair<const char*, void (*)()> tests[] = {
        {"known max-flow network has flow 23", knownMaxFlow},
        {"residual reverse edges undo an early choice", residualEdgesReroute},
        {"road rate and travel time: arrivals 0,0,3,3,3,1", roadRateAndTravelTime},
        {"shelter space is a total, never refreshed each minute", shelterSpaceIsTotal},
        {"blocking a road removes it from BFS, Dijkstra and flow", blockedRoadIsIgnored},
        {"one-way roads cannot be traversed backwards", oneWayRoads},
        {"Dijkstra weights travel time, not hop count", dijkstraUsesTravelTime},
        {"parallel roads keep separate capacities", parallelRoadsKeepCapacities},
        {"multiple origins share the same finite shelter space", originsShareShelters},
        {"no population completes at minute zero", noPopulationCompletesImmediately},
        {"long travel is beyond the 60-minute limit, not impossible", beyondSearchLimitIsNotImpossible},
        {"unreachable spare shelter space cannot be used", unreachableSpareSpaceDoesNotHelp},
        {"sample schedules conserve people and respect every capacity", schedulesAreConsistent},
        {"validation rejects malformed, fractional and overlarge input", validationRejectsBadInput},
        {"sample scenarios give the documented results", sampleOutputs},
    };
    int passed = 0;
    for (const auto& [name, run] : tests) {
        int before = failures;
        try {
            run();
        } catch (const std::exception& e) {
            failures++;
            std::cerr << "    unexpected exception: " << e.what() << "\n";
        }
        bool ok = failures == before;
        passed += ok;
        std::cout << (ok ? "PASS  " : "FAIL  ") << name << "\n";
    }
    const int total = static_cast<int>(sizeof tests / sizeof tests[0]);
    std::cout << "\n" << passed << " of " << total << " tests passed.\n";
    return passed == total ? 0 : 1;
}
