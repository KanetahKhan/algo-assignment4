// SafeRoute — WebAssembly entry point used by the browser interface.
//
// The browser sends a command name, the scenario as JSON and options as JSON.
// It gets back {"ok": true, "value": ...} or {"ok": false, "error": "..."}.
// Build with tools/build_wasm.bat (Emscripten); output is src/saferoute_wasm.js.
#include <cmath>
#include <stdexcept>
#include <string>

#include <emscripten/emscripten.h>

#include "algorithms.hpp"
#include "report.hpp"

using namespace saferoute;
using json::Value;

namespace {

int deadlineOption(const Value& options) {
    const Value* h = options.isObject() ? options.find("horizon") : nullptr;
    if (!h || !h->isNumber() || std::floor(h->asNumber()) != h->asNumber() ||
        h->asNumber() < 0 || h->asNumber() > Limits::horizon)
        throw std::runtime_error("Deadline must be an integer from 0 to 60 minutes.");
    return static_cast<int>(h->asNumber());
}

int startOption(const Scenario& s, const Value& options) {
    const Value* start = options.isObject() ? options.find("start") : nullptr;
    int index = start && start->isString() ? s.indexOf(start->asString()) : -1;
    if (index < 0) throw std::runtime_error("Select an existing start location.");
    return index;
}

Value run(const std::string& command, const Value& input, const Value& options) {
    const Scenario s = validate(input);
    if (command == "validate") return toJson(s);
    if (command == "bfs") return toJson(s, bfs(s, startOption(s, options)));
    if (command == "dijkstra") return toJson(s, dijkstra(s, startOption(s, options)));
    if (command == "analyze") return toJson(s, analyze(s, deadlineOption(options)));
    if (command == "solveDeadline") {
        const int h = deadlineOption(options);
        const Value* details = options.find("details");
        if (details && details->isBool() && !details->asBool()) return Value(maxEvacuatedBy(s, h));
        return toJson(s, solveDeadline(s, h));
    }
    throw std::runtime_error("Unknown command " + command + ".");
}

}  // namespace

extern "C" EMSCRIPTEN_KEEPALIVE const char* saferoute_call(const char* command, const char* scenarioJson,
                                                            const char* optionsJson) {
    static std::string reply;   // kept alive until the next call; JavaScript copies it immediately
    Value out = Value::object();
    try {
        Value value = run(command, Value::parse(scenarioJson), Value::parse(optionsJson));
        out["ok"] = true;
        out["value"] = value;
    } catch (const std::exception& error) {
        out["ok"] = false;
        out["error"] = error.what();
    }
    reply = out.dump();
    return reply.c_str();
}
