// SafeRoute — command-line evacuation solver.
//
//   saferoute [--scenario scenarios/campus.json] [--deadline 12] [--output result.json]
//
// Build:  g++ -std=c++17 -O2 -o saferoute cpp/main.cpp cpp/algorithms.cpp cpp/scenario.cpp cpp/report.cpp cpp/json.cpp
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "algorithms.hpp"
#include "report.hpp"

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

using namespace saferoute;

static std::string readFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("Cannot open " + path + ".");
    std::ostringstream text;
    text << in.rdbuf();
    return text.str();
}

static int parseDeadline(const std::string& text) {
    char* end = nullptr;
    double value = std::strtod(text.c_str(), &end);
    if (text.empty() || *end != '\0' || std::floor(value) != value || value < 0 || value > Limits::horizon)
        throw std::runtime_error("Deadline must be an integer from 0 to 60 minutes.");
    return static_cast<int>(value);
}

static std::string routeText(const Scenario& s, const ShelterRoute& route) {
    std::string text;
    for (size_t i = 0; i < route.nodes.size(); i++) text += (i ? " -> " : "") + s.nodes[route.nodes[i]].id;
    return text;
}

static void printReport(const Scenario& s, const Analysis& a, int deadline) {
    const DeadlinePlan& plan = a.plan;
    std::cout << s.name << "\n"
              << "Deadline: " << deadline << " minutes\n"
              << "People: " << plan.total << "\n"
              << "Arrived by deadline: " << plan.evacuated << "\n"
              << "Still needing evacuation: " << plan.remaining << "\n"
              << "Isolated from shelters: " << a.isolatedPopulation << "\n"
              << "Earliest full evacuation: ";
    switch (a.completion.status) {
        case CompletionStatus::Complete: std::cout << a.completion.minutes << " minutes\n"; break;
        case CompletionStatus::Impossible: std::cout << "not feasible on this network\n"; break;
        case CompletionStatus::BeyondLimit: std::cout << "> " << Limits::horizon << " minutes\n"; break;
    }

    std::cout << "\nShelter allocation (max flow)\n";
    std::cout << "  " << std::left << std::setw(24) << "Shelter" << std::right << std::setw(9) << "Arrivals" << std::setw(8) << "Spaces" << "\n";
    for (size_t v = 0; v < s.nodes.size(); v++) {
        if (s.nodes[v].type != LocationType::Shelter) continue;
        std::cout << "  " << std::left << std::setw(24) << s.nodes[v].name << std::right
                  << std::setw(9) << plan.shelters[v].used << std::setw(8) << s.nodes[v].capacity << "\n";
    }

    std::cout << "\nFastest route from each origin (Dijkstra, no congestion)\n";
    for (const OriginAnalysis& o : a.origins) {
        std::cout << "  " << s.nodes[o.origin].id << " (" << s.nodes[o.origin].name << "): ";
        const ShelterRoute& best = o.routes.shelters.empty() ? ShelterRoute{-1, UNREACHABLE, {}, {}} : o.routes.shelters[0];
        if (best.time == UNREACHABLE) std::cout << "no shelter reachable";
        else std::cout << routeText(s, best) << "  [" << best.time << " min]";
        std::cout << "  | BFS reaches " << o.reach.order.size() << " of " << s.nodes.size() << " locations\n";
    }

    std::cout << "\nTime-expanded network: " << plan.vertices << " vertices, " << plan.edges
              << " edges, " << plan.augmentations << " augmenting paths (Edmonds-Karp)\n"
              << "Groups in the schedule: " << plan.paths.size() << "\n";
}

int main(int argc, char** argv) {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);   // show names containing non-ASCII characters correctly
#endif
    try {
        std::string scenarioPath = "scenarios/campus.json", outputPath, deadlineText = "12";
        for (int i = 1; i < argc; i += 2) {
            std::string flag = argv[i];
            if (flag == "--help" || flag == "-h") {
                std::cout << "SafeRoute command-line solver (C++)\n\n"
                             "saferoute [--scenario scenarios/campus.json] [--deadline 12] [--output result.json]\n\n"
                             "Defaults to the campus scenario and a 12-minute deadline.\n";
                return 0;
            }
            if (i + 1 >= argc || std::string(argv[i + 1]).rfind("--", 0) == 0)
                throw std::runtime_error("Invalid arguments. Run saferoute --help.");
            if (flag == "--scenario") scenarioPath = argv[i + 1];
            else if (flag == "--deadline") deadlineText = argv[i + 1];
            else if (flag == "--output") outputPath = argv[i + 1];
            else throw std::runtime_error("Invalid arguments. Run saferoute --help.");
        }

        const int deadline = parseDeadline(deadlineText);
        const Scenario scenario = validate(json::Value::parse(readFile(scenarioPath)));
        const Analysis analysis = analyze(scenario, deadline);
        printReport(scenario, analysis, deadline);

        if (!outputPath.empty()) {
            json::Value out = json::Value::object();
            out["scenario"] = toJson(scenario);
            out["result"] = toJson(scenario, analysis);
            std::ofstream file(outputPath, std::ios::binary);
            if (!file) throw std::runtime_error("Cannot write " + outputPath + ".");
            file << out.dump(2) << "\n";
            std::cout << "Wrote " << outputPath << "\n";
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "Error: " << error.what() << "\n";
        return 1;
    }
}
