# SafeRoute — Earthquake Evacuation Simulator

A complete, offline implementation of the earthquake-evacuation proposal for CSE 4403 (Algorithms). The graph algorithms are implemented directly in JavaScript, with no algorithm libraries, external APIs, map services, npm dependencies, or backend server.

## Run it on Windows

1. Extract the entire ZIP first.
2. Double-click **index.html**, or run **START_WINDOWS.bat**.
3. If Windows asks which app to use, select Chrome, Edge, Firefox, or Opera.
4. The campus scenario opens and calculates automatically.

You can instead open **dist/SafeRoute_Evacuation_Simulator.html**, a self-contained copy of the whole app. That single file can be copied to another computer without the rest of the project. JavaScript must be enabled. Download the HTML and open it in a browser if a file preview does not execute scripts.

**No installation is needed to use the app.** Node.js is optional and is only used for the command-line solver, automated tests, or rebuilding the single-file version. Internet is not needed at runtime. Work is held in browser memory: click **Save network** before closing or refreshing if you want to keep edits. Import that JSON to continue later.

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
- Dependency-free CLI and automated algorithm tests.

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
| `index.html` | Main app layout; open this to run |
| `src/styles.css` | Responsive visual design |
| `src/app.js` | UI state, SVG map, controls, playback, import/export |
| `src/engine.js` | Validation, BFS, binary-heap Dijkstra, flow, schedule extraction |
| `src/scenarios.js` | Four synthetic examples |
| `scenarios/*.json` | Editable example data files |
| `cli.js` | Node.js command-line interface |
| `tests/engine.test.js` | Algorithm and schedule-invariant tests |
| `tests/ui.test.cjs` | Optional jsdom interface-logic tests |
| `tests/reference_check.py` | Optional independent SciPy cross-check |
| `tools/build.js` | Single-file HTML builder; no dependencies |
| `dist/SafeRoute_Evacuation_Simulator.html` | Standalone offline app |
| `docs/IMPLEMENTATION.md` | Formulation, complexity, assumptions, source map |
| `docs/DEMO_SCRIPT.md` | Three-minute presentation outline |
| `docs/VERIFICATION.md` | Actual validation results and limitations |

## Optional: tests and command line

With Node.js 18 or newer installed, open a terminal inside the extracted folder:

```text
node --test tests/engine.test.js
node cli.js --scenario scenarios/teaching-example.json --deadline 3
node cli.js --scenario scenarios/campus.json --deadline 12 --output result.json
node tools/build.js
```

`npm test` and `npm run build` are equivalent shortcuts; **npm install is not needed** for the app, CLI, builder, or core tests. After editing source files, rebuild to update the standalone copy. Optional reference/DOM test dependencies and instructions are explained in `docs/VERIFICATION.md`.

## Meaning of the results

This is an educational model using synthetic data. It is not an operational emergency-routing system. A road capacity of 3 means up to 3 people may **enter** that road in each minute, per direction. It does not mean only 3 people may occupy the entire road at once. Travel times are fixed integer minutes. Shelter capacity is total space, never a per-minute limit.

The max-flow schedule maximizes arrivals **by the selected deadline**. Its intermediate arrivals need not be as early as possible, and it does not minimize total travel time, balance congestion, or ensure equal treatment of origins among tied maximum-flow plans. Dijkstra reports individual travel time without queueing. The earliest-full-evacuation result is exact within the implemented discrete-time model and 60-minute search limit.

Limits: 20 locations, 60 roads, 3,000 people, and a 60-minute horizon. Custom edits start a new simulation at minute zero; changing a road during playback does not preserve people already in transit.

## Assignment submission

The source ZIP supplies the implementation. The assignment also asks for a group report and a recorded demonstration uploaded to YouTube, with its link in the report. The included implementation notes and demo outline help prepare those items; this package does not contain a submitted report or an uploaded video.
