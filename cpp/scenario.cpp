// SafeRoute — scenario validation and conversion to/from JSON.
#include "scenario.hpp"

#include <cmath>
#include <set>
#include <stdexcept>

namespace saferoute {

using json::Value;

int Scenario::totalPopulation() const {
    int sum = 0;
    for (const Location& n : nodes) sum += n.population;
    return sum;
}

int Scenario::indexOf(const std::string& id) const {
    for (size_t i = 0; i < nodes.size(); i++)
        if (nodes[i].id == id) return static_cast<int>(i);
    return -1;
}

const char* typeName(LocationType type) {
    switch (type) {
        case LocationType::Origin: return "origin";
        case LocationType::Shelter: return "shelter";
        default: return "junction";
    }
}

namespace {

[[noreturn]] void fail(const std::string& message) { throw std::runtime_error(message); }

// A missing key and an explicit null are treated alike (JavaScript's `??`).
const Value* field(const Value& object, const char* key) {
    const Value* v = object.find(key);
    return v && !v->isNull() ? v : nullptr;
}

// Whole number in [lo, hi]; a missing value counts as 0 when zeroIfMissing is set.
int integerField(const Value& object, const char* key, int lo, int hi, const std::string& label, bool zeroIfMissing) {
    const Value* v = field(object, key);
    if (!v && zeroIfMissing) return 0;
    if (!v || !v->isNumber() || std::floor(v->asNumber()) != v->asNumber() ||
        v->asNumber() < lo || v->asNumber() > hi)
        fail(label + " must be an integer from " + std::to_string(lo) + " to " + std::to_string(hi) + ".");
    return static_cast<int>(v->asNumber());
}

bool validId(const Value* v) {
    if (!v || !v->isString()) return false;
    const std::string& s = v->asString();
    if (s.empty() || s.size() > 24) return false;
    for (char c : s)
        if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-'))
            return false;
    return true;
}

// JavaScript truthiness, used for the "name || fallback" defaults.
bool truthy(const Value* v) {
    if (!v) return false;
    switch (v->type()) {
        case Value::Type::Null: return false;
        case Value::Type::Bool: return v->asBool();
        case Value::Type::Number: return v->asNumber() != 0 && !std::isnan(v->asNumber());
        case Value::Type::String: return !v->asString().empty();
        default: return true;
    }
}

std::string text(const Value& v) {
    if (v.isString()) return v.asString();
    if (v.isBool()) return v.asBool() ? "true" : "false";
    if (v.isObject()) return "[object Object]";
    return v.dump();
}

// Keep at most `limit` characters (counted as UTF-16 units, like JavaScript's slice).
std::string shorten(const std::string& s, size_t limit) {
    size_t units = 0, i = 0;
    while (i < s.size()) {
        unsigned char c = static_cast<unsigned char>(s[i]);
        size_t bytes = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
        size_t width = bytes == 4 ? 2 : 1;
        if (units + width > limit) break;
        units += width;
        i += bytes;
    }
    return s.substr(0, i);
}

bool optionalBool(const Value& object, const char* key, bool fallback, const char* message) {
    const Value* v = object.find(key);
    if (!v) return fallback;
    if (!v->isBool()) fail(message);
    return v->asBool();
}

}  // namespace

Scenario validate(const Value& input) {
    const Value* nodesIn = input.isObject() ? input.find("nodes") : nullptr;
    const Value* roadsIn = input.isObject() ? input.find("roads") : nullptr;
    if (!nodesIn || !nodesIn->isArray() || !roadsIn || !roadsIn->isArray())
        fail("A scenario must contain nodes and roads arrays.");
    if (nodesIn->items().empty() || nodesIn->items().size() > Limits::nodes)
        fail("Use between 1 and " + std::to_string(Limits::nodes) + " locations.");
    if (roadsIn->items().size() > Limits::roads)
        fail("Use at most " + std::to_string(Limits::roads) + " roads.");

    Scenario s;
    const Value* name = input.find("name");
    const Value* description = input.find("description");
    s.name = shorten(truthy(name) ? text(*name) : "Custom scenario", 80);
    s.description = shorten(truthy(description) ? text(*description) : "", 600);

    std::set<std::string> ids;
    for (const Value& n : nodesIn->items()) {
        const Value* id = n.isObject() ? n.find("id") : nullptr;
        if (!validId(id) || ids.count(id->asString()))
            fail("Location IDs must be unique, using 1–24 letters, numbers, underscores or hyphens.");
        ids.insert(id->asString());

        Location loc;
        loc.id = id->asString();
        const Value* type = n.find("type");
        std::string t = type && type->isString() ? type->asString() : "";
        if (t == "origin") loc.type = LocationType::Origin;
        else if (t == "junction") loc.type = LocationType::Junction;
        else if (t == "shelter") loc.type = LocationType::Shelter;
        else fail("Unknown location type for " + loc.id + ".");

        loc.population = integerField(n, "population", 0, Limits::population, "Population", true);
        loc.capacity = integerField(n, "capacity", 0, Limits::population, "Shelter capacity", true);
        if (loc.type != LocationType::Origin && loc.population)
            fail("Only origin locations can contain an initial population.");
        if (loc.type != LocationType::Shelter && loc.capacity)
            fail("Only shelters can have a shelter capacity.");

        const Value* x = field(n, "x");
        const Value* y = field(n, "y");
        loc.x = x ? (x->isNumber() ? x->asNumber() : NAN) : 450;
        loc.y = y ? (y->isNumber() ? y->asNumber() : NAN) : 250;
        if (!std::isfinite(loc.x) || loc.x < 45 || loc.x > 855 || !std::isfinite(loc.y) || loc.y < 50 || loc.y > 450)
            fail("Location coordinates must be inside the map (x: 45–855, y: 50–450).");

        const Value* locName = n.find("name");
        loc.name = shorten(truthy(locName) ? text(*locName) : loc.id, 60);
        s.nodes.push_back(loc);
    }
    if (s.totalPopulation() > Limits::population)
        fail("Use at most " + std::to_string(Limits::population) + " people in a scenario.");

    std::set<std::string> roadIds;
    for (const Value& r : roadsIn->items()) {
        const Value* id = r.isObject() ? r.find("id") : nullptr;
        if (!validId(id) || roadIds.count(id->asString()))
            fail("Road IDs must be unique, using 1–24 letters, numbers, underscores or hyphens.");
        roadIds.insert(id->asString());

        Road road;
        road.id = id->asString();
        const Value* from = r.find("from");
        const Value* to = r.find("to");
        road.from = from && from->isString() ? s.indexOf(from->asString()) : -1;
        road.to = to && to->isString() ? s.indexOf(to->asString()) : -1;
        if (road.from < 0 || road.to < 0 || road.from == road.to)
            fail("Road " + road.id + " needs two different existing locations.");
        road.blocked = optionalBool(r, "blocked", false, "Road blocked must be true or false.");
        road.bidirectional = optionalBool(r, "bidirectional", true, "Road bidirectional must be true or false.");
        road.time = integerField(r, "time", 1, 60, "Road travel time", false);
        road.capacity = integerField(r, "capacity", 1, Limits::population, "Road capacity", false);
        s.roads.push_back(road);
    }
    return s;
}

Value toJson(const Scenario& s) {
    Value out = Value::object();
    out["name"] = s.name;
    out["description"] = s.description;
    Value nodes = Value::array();
    for (const Location& n : s.nodes) {
        Value v = Value::object();
        v["id"] = n.id;
        v["name"] = n.name;
        v["type"] = typeName(n.type);
        v["population"] = n.population;
        v["capacity"] = n.capacity;
        v["x"] = n.x;
        v["y"] = n.y;
        nodes.push(v);
    }
    Value roads = Value::array();
    for (const Road& r : s.roads) {
        Value v = Value::object();
        v["id"] = r.id;
        v["from"] = s.nodes[r.from].id;
        v["to"] = s.nodes[r.to].id;
        v["time"] = r.time;
        v["capacity"] = r.capacity;
        v["blocked"] = r.blocked;
        v["bidirectional"] = r.bidirectional;
        roads.push(v);
    }
    out["nodes"] = nodes;
    out["roads"] = roads;
    return out;
}

}  // namespace saferoute
