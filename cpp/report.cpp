// SafeRoute — result-to-JSON conversion (support code, no algorithms here).
#include "report.hpp"

namespace saferoute {

using json::Value;

namespace {

Value ids(const Scenario& s, const std::vector<int>& nodes) {
    Value out = Value::array();
    for (int v : nodes) out.push(s.nodes[v].id);
    return out;
}

Value minutesOrNull(int minutes) { return minutes == UNREACHABLE ? Value() : Value(minutes); }

Value stepJson(const Scenario& s, const EdgeInfo& e) {
    Value v = Value::object();
    if (e.kind == EdgeKind::Wait) {
        v["type"] = "wait";
        v["at"] = s.nodes[e.location].id;
    } else {
        v["type"] = "travel";
        v["road"] = s.roads[e.road].id;
        v["from"] = s.nodes[e.from].id;
        v["to"] = s.nodes[e.to].id;
    }
    v["start"] = e.start;
    v["end"] = e.end;
    return v;
}

Value intArray(const std::vector<int>& values) {
    Value out = Value::array();
    for (int x : values) out.push(x);
    return out;
}

}  // namespace

Value toJson(const Scenario& s, const BfsResult& r) {
    Value out = Value::object();
    out["order"] = ids(s, r.order);
    Value parent = Value::object();
    for (int v : r.order)
        if (r.parent[v] >= 0) parent[s.nodes[v].id] = s.nodes[r.parent[v]].id;
    out["parent"] = parent;
    return out;
}

Value toJson(const Scenario& s, const ShortestPaths& r) {
    Value out = Value::object();
    Value distances = Value::object();
    for (size_t v = 0; v < s.nodes.size(); v++) distances[s.nodes[v].id] = minutesOrNull(r.distance[v]);
    out["distances"] = distances;
    out["order"] = ids(s, r.order);
    Value shelters = Value::array();
    for (const ShelterRoute& route : r.shelters) {
        Value v = Value::object();
        v["id"] = s.nodes[route.shelter].id;
        v["time"] = minutesOrNull(route.time);
        v["nodes"] = ids(s, route.nodes);
        Value roads = Value::array();
        for (int road : route.roads) roads.push(s.roads[road].id);
        v["roads"] = roads;
        shelters.push(v);
    }
    out["shelters"] = shelters;
    return out;
}

Value toJson(const Scenario& s, const DeadlinePlan& plan) {
    Value out = Value::object();
    out["total"] = plan.total;
    out["evacuated"] = plan.evacuated;
    out["remaining"] = plan.remaining;
    out["horizon"] = plan.horizon;
    out["arrivals"] = intArray(plan.arrivals);
    out["cumulative"] = intArray(plan.cumulative);

    Value shelters = Value::object();
    for (size_t v = 0; v < s.nodes.size(); v++) {
        if (s.nodes[v].type != LocationType::Shelter) continue;
        Value use = Value::object();
        use["used"] = plan.shelters[v].used;
        use["capacity"] = plan.shelters[v].capacity;
        use["arrivals"] = intArray(plan.shelters[v].arrivals);
        shelters[s.nodes[v].id] = use;
    }
    out["shelters"] = shelters;

    Value roads = Value::object();
    for (size_t r = 0; r < s.roads.size(); r++) {
        const RoadUse& use = plan.roads[r];
        Value v = Value::object();
        v["people"] = use.people;
        v["peak"] = use.peak;
        Value departures = Value::array();
        for (const Departure& d : use.departures) {
            Value dep = Value::object();
            dep["from"] = s.nodes[d.from].id;
            dep["to"] = s.nodes[d.to].id;
            dep["minute"] = d.minute;
            dep["people"] = d.people;
            departures.push(dep);
        }
        v["departures"] = departures;
        roads[s.roads[r].id] = v;
    }
    out["roads"] = roads;

    Value paths = Value::array();
    for (const GroupPath& p : plan.paths) {
        Value v = Value::object();
        v["people"] = p.people;
        v["origin"] = s.nodes[p.origin].id;
        v["shelter"] = s.nodes[p.shelter].id;
        v["arrival"] = p.arrival;
        Value steps = Value::array();
        for (const EdgeInfo& e : p.steps) steps.push(stepJson(s, e));
        v["steps"] = steps;
        paths.push(v);
    }
    out["paths"] = paths;

    Value stats = Value::object();
    stats["vertices"] = plan.vertices;
    stats["edges"] = plan.edges;
    stats["augmentations"] = plan.augmentations;
    out["stats"] = stats;
    return out;
}

Value toJson(const Scenario& s, const Analysis& a) {
    Value out = toJson(s, a.plan);
    Value origins = Value::object();
    for (const OriginAnalysis& o : a.origins) {
        Value v = Value::object();
        v["bfs"] = toJson(s, o.reach);
        v["routes"] = toJson(s, o.routes);
        v["reachable"] = o.reachable;
        origins[s.nodes[o.origin].id] = v;
    }
    out["origins"] = origins;
    out["isolatedPopulation"] = a.isolatedPopulation;
    out["eventual"] = a.eventual;

    Value completion = Value::object();
    switch (a.completion.status) {
        case CompletionStatus::Complete:
            completion["status"] = "complete";
            completion["minutes"] = a.completion.minutes;
            break;
        case CompletionStatus::Impossible:
            completion["status"] = "impossible";
            completion["minutes"] = Value();
            break;
        case CompletionStatus::BeyondLimit:
            completion["status"] = "beyond_limit";
            completion["minutes"] = Value();
            completion["limit"] = Limits::horizon;
            break;
    }
    out["completion"] = completion;
    return out;
}

}  // namespace saferoute
