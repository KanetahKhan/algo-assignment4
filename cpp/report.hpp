// SafeRoute — convert algorithm results into JSON for the browser and --output files.
#pragma once

#include "algorithms.hpp"
#include "json.hpp"

namespace saferoute {

json::Value toJson(const Scenario& s, const BfsResult& r);
json::Value toJson(const Scenario& s, const ShortestPaths& r);
json::Value toJson(const Scenario& s, const DeadlinePlan& plan);
json::Value toJson(const Scenario& s, const Analysis& a);

}  // namespace saferoute
