# SafeRoute — Earthquake Evacuation Simulator

A complete, offline implementation of the earthquake-evacuation proposal for CSE 4403 (Algorithms). The graph algorithms (BFS, Dijkstra, Edmonds–Karp max-flow and binary search) are written from scratch in **C++17**, using only the standard library. There are no algorithm libraries, external APIs, map services or backend server.

The same C++ source is built two ways:

- **Command-line solver:** compiled with g++, so the algorithms can be compiled and tested directly.
- **Browser app:** compiled to WebAssembly, so every calculation in the interactive map runs the same C++ code.

## Run it on Windows

1. Extract the entire ZIP first.
2. Double-click **index.html**, or run **START_WINDOWS.bat**.
3. If Windows asks which app to use, select Chrome, Edge, Firefox, or Opera.
4. The campus scenario opens and calculates automatically.

You can instead open **dist/SafeRoute_Evacuation_Simulator.html**, a self-contained copy of the whole app. That single file can be copied to another computer without the rest of the project. JavaScript must be enabled. Download the HTML and open it in a browser if a file preview does not execute scripts.

**No installation is needed to use the app.** The compiled C++ engine is already included in `src/saferoute_wasm.js`. A C++ compiler is needed only for the command-line solver and tests. Internet is not needed at runtime. Work is held in browser memory: click **Save network** before closing or refreshing if you want to keep edits. Import that JSON to continue later.

## What is implemented

- Interactive SVG network with residential areas, junctions, shelters, and selectable roads.
- Damaged-road toggles, road travel-time and capacity editing, and one-way/two-way roads.
- BFS reachability and Dijkstra shortest travel-time paths from any residential area.
- Edmonds–Karp max-flow on a **time-expanded graph** to maximize people arriving by a deadline.
- Binary search for the earliest full evacuation, up to 60 minutes.
- Finite initial populations and **total** shelter-space constraints.
- Playback of scheduled movement, waiting groups, arrival chart, and shelter allocation.
- Four built-in scenarios, custom network editing, JSON import/export, and CSV schedule export.
- Comparison against the original selected or imported scenario at the same deadline.
- Algorithm trace and model assumptions inside the app.
- C++ command-line solver and C++ automated algorithm tests.

## C++ code walkthrough

Open **walkthrough.html**, or use **C++ code walkthrough** in the simulator header, to present the source code. It shows the real `cpp/algorithms.cpp` with matching line numbers, in five tabs: BFS, Dijkstra, Edmonds–Karp, the time-expanded network and the binary search.

- **Hover** a line to see what it does and how the graph, queue, heap or arrays look at its next run.
- **Click** a line to jump there, and click again for its next run.
- **← / →** step through the run, and **Space** plays or pauses.
- **Deep links:** `walkthrough.html#dijkstra-60` opens a tab at a given step.
- **C++ check:** a badge compares each replay's final answer with the C++ engine.
- **Standalone copy:** `dist/SafeRoute_Code_Walkthrough.html` works on its own.
- **Stays in sync:** `node tools/build.js` re-embeds the C++ source after edits.

## Suggested first demo

1. **Campus district**, deadline **12**: expect **176 / 180** arrivals; earliest full evacuation **13 minutes**.
2. Close a road by selecting it and checking **Road closed / damaged**.
3. Click **Calculate evacuation**; edits invalidate old results until recalculated.
4. Press **Play** or scrub the timeline. Dots represent groups, not individual people.
5. Open **Algorithm trace** to explain BFS, Dijkstra, and the expanded flow network.
6. Try **Shelters at capacity**: only 120 spaces exist for 180 people, so time alone cannot fix the shortage.
7. Try **Small example · 10 people**: 6 arrive by minute 3; everyone can arrive by minute 5.

For a recording outline, read **docs/DEMO_SCRIPT.md**. For the mathematical model and source walkthrough, read **docs/IMPLEMENTATION.md**.

## Files

| File | Purpose |
|---|---|
| `cpp/algorithms.hpp`, `cpp/algorithms.cpp` | **BFS, Dijkstra, Edmonds–Karp, time-expanded network, flow decomposition, binary search** |
| `cpp/scenario.hpp`, `cpp/scenario.cpp` | Network data model (locations, roads) and input validation |
| `cpp/main.cpp` | C++ command-line solver |
| `cpp/report.*`, `cpp/json.*` | Support code: JSON reading/writing of scenarios and results |
| `cpp/wasm_bridge.cpp` | Entry point the browser calls (WebAssembly build) |
| `tests/engine_test.cpp` | C++ algorithm and schedule-invariant tests |
| `build_cpp.bat`, `Makefile` | Build the solver and tests (Windows / Linux, macOS) |
| `index.html` | Main app layout; open this to run |
| `walkthrough.html` | **C++ code walkthrough**: the real `algorithms.cpp` with line-by-line visual demonstrations |
| `src/styles.css` | Responsive visual design |
| `src/app.js` | UI state, SVG map, controls, playback, import/export |
| `src/saferoute_wasm.js` | The C++ engine compiled to WebAssembly (generated) |
| `src/engine.js` | Small bridge from the interface to the C++ engine; contains no algorithms |
| `src/scenarios.js` | Four synthetic examples |
| `scenarios/*.json` | Editable example data files |
| `tests/engine.test.js` | Checks the WebAssembly build through the browser bridge (Node.js) |
| `tests/ui.test.cjs` | Optional jsdom interface-logic tests |
| `tests/reference_check.py` | Optional independent SciPy cross-check |
| `tools/build_wasm.bat`, `tools/build_wasm.sh` | Recompile the C++ engine to WebAssembly (Emscripten) |
| `tools/build.js` | Single-file HTML builder; no dependencies |
| `dist/SafeRoute_Evacuation_Simulator.html` | Standalone offline app |
| `docs/IMPLEMENTATION.md` | Formulation, complexity, assumptions, source map |
| `docs/DEMO_SCRIPT.md` | Three-minute presentation outline |
| `docs/VERIFICATION.md` | Actual validation results and limitations |

## C++ command-line solver and tests

You need g++ with C++17 support: MinGW-w64, MSYS2 or the compiler bundled with Code::Blocks on Windows, or GCC/Clang on Linux and macOS. Open a terminal inside the extracted folder.

**Windows:** run `build_cpp.bat`. It builds `saferoute.exe` and `engine_test.exe`, then runs the tests.

**Linux / macOS:** run `make test`.

**Manual build (any platform):**

```text
g++ -std=c++17 -O2 -o saferoute cpp/main.cpp cpp/algorithms.cpp cpp/scenario.cpp cpp/report.cpp cpp/json.cpp
g++ -std=c++17 -O2 -Icpp -o engine_test tests/engine_test.cpp cpp/algorithms.cpp cpp/scenario.cpp cpp/report.cpp cpp/json.cpp
```

**Examples:**

```text
saferoute --scenario scenarios/campus.json --deadline 12
saferoute --scenario scenarios/teaching-example.json --deadline 3
saferoute --scenario scenarios/damaged-roads.json --deadline 12 --output result.json
engine_test
```

Run `engine_test` from the project folder; it reads the sample files in `scenarios/`.

## Rebuilding the browser engine

This is only needed after you edit files in `cpp/`. Install [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) and activate it with `emsdk_env`. Then run `toolsuild_wasm.bat` (Windows) or `sh tools/build_wasm.sh`. This regenerates `src/saferoute_wasm.js` and the standalone `dist/` HTML. `node --test tests/engine.test.js` then checks the new build through the browser bridge. After editing only the interface files (`src/app.js`, `src/styles.css`, `index.html`), `node tools/build.js` is enough.

## Meaning of the results

This is an educational model using synthetic data. It is not an operational emergency-routing system. A road capacity of 3 means up to 3 people may **enter** that road in each minute, per direction. It does not mean only 3 people may occupy the entire road at once. Travel times are fixed integer minutes. Shelter capacity is total space, never a per-minute limit.

The max-flow schedule maximizes arrivals **by the selected deadline**. Its intermediate arrivals need not be as early as possible, and it does not minimize total travel time, balance congestion, or ensure equal treatment of origins among tied maximum-flow plans. Dijkstra reports individual travel time without queueing. The earliest-full-evacuation result is exact within the implemented discrete-time model and 60-minute search limit.

Limits: 20 locations, 60 roads, 3,000 people, and a 60-minute horizon. Custom edits start a new simulation at minute zero; changing a road during playback does not preserve people already in transit.

## Assignment submission

The source ZIP supplies the implementation. The assignment also asks for a group report and a recorded demonstration uploaded to YouTube, with its link in the report. The included implementation notes and demo outline help prepare those items; this package does not contain a submitted report or an uploaded video.
