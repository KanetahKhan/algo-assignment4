// SafeRoute — the road network data model and input validation.
#pragma once

#include <string>
#include <vector>

#include "json.hpp"

namespace saferoute {

// Hard limits keep every calculation small enough to run instantly.
struct Limits {
    static constexpr int nodes = 20;         // locations
    static constexpr int roads = 60;
    static constexpr int horizon = 60;       // minutes
    static constexpr int population = 3000;  // people in one scenario
};

enum class LocationType { Origin, Junction, Shelter };

// A vertex of the road network.
struct Location {
    std::string id, name;
    LocationType type = LocationType::Junction;
    int population = 0;   // people waiting here at minute 0 (origins only)
    int capacity = 0;     // TOTAL shelter spaces (shelters only)
    double x = 450, y = 250;   // map position, used only for drawing
};

// An edge of the road network. `from` and `to` are indices into Scenario::nodes.
struct Road {
    std::string id;
    int from = 0, to = 0;
    int time = 1;          // whole minutes to travel the road
    int capacity = 1;      // people who may ENTER the road per minute, per direction
    bool blocked = false;  // damaged roads are ignored by every algorithm
    bool bidirectional = true;
};

struct Scenario {
    std::string name, description;
    std::vector<Location> nodes;
    std::vector<Road> roads;

    int totalPopulation() const;
    int indexOf(const std::string& id) const;   // -1 when there is no such location
};

// Checks a scenario read from JSON and converts it to the structs above.
// Throws std::runtime_error with a user-facing message when the input is invalid.
Scenario validate(const json::Value& input);

json::Value toJson(const Scenario& scenario);
const char* typeName(LocationType type);

}  // namespace saferoute
