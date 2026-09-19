# Verification results

Validation performed on 19 September 2026.

## Automated algorithm tests: 14 passed

Run `node --test tests/engine.test.js` with Node.js 18 or newer. No installation or external dependencies are required for this suite.

The tests cover a known max-flow result of 23; reverse-edge rerouting; per-minute entry capacities and nonzero travel time; total shelter space across all minutes; blocked roads; one-way direction; weighted shortest paths; parallel roads; multiple origins sharing shelter space; zero population; distinguishing the 60-minute search limit from infeasibility; disconnected spare shelter capacity; schedule conservation and per-departure limits; and invalid input.

For every built-in scenario, the schedule tests check all group origins, destinations, ordered travel/waiting times, route directions, road capacities and shelter capacities. Group sizes and arrivals sum to the returned maximum flow. Deadline results are also checked for monotonicity.

## Independent reference check: 2,196 flow comparisons passed

`tests/reference_check.py` builds time-expanded networks with a different vertex indexing scheme and compares the JavaScript Edmonds–Karp solver with SciPy's Dinic implementation.

- 4 supplied examples + 32 randomly generated networks, seed 4403.
- Every deadline from 0 through 60, inclusive: 36 × 61 = 2,196 comparisons.
- Earliest-full-evacuation results compared against exhaustive deadline enumeration.
- Every origin-to-location shortest-path distance compared against an independent Floyd–Warshall calculation.

All comparisons passed. This validates the implemented discrete-time formulation against a separate flow algorithm; it does not validate the assumptions against real evacuation behavior.

To rerun this optional reference suite, install SciPy into your Python environment and run `python tests/reference_check.py`. Node.js must also be on PATH. These dependencies are only for the optional reference check, not for using the app.

## Interface logic: 8 DOM tests passed

`tests/ui.test.cjs` executes the standalone app with jsdom. It checks initialization; damage/recalculation/reset; scenario changes and timeline scrubbing; JSON and CSV export content; adding/deleting locations; road-editor validation; invalid-input recovery; JSON import and reselection of imported scenarios; deadline changes; and playback start/pause controls. No runtime errors occurred in these checks.

To reproduce these optional tests, install jsdom in a separate test environment, then set `SAFEROUTE_JSDOM_MODULE` to its absolute module path and run `node --test tests/ui.test.cjs`. Alternatively, install jsdom locally with `npm install --no-save --package-lock=false jsdom` and run the test. This optional dependency is not shipped or needed by the app. A recent Node.js version supported by the installed jsdom release is required.

DOM tests used the main-thread solver fallback, with simulated download and dialog APIs. They do not verify physical layout, native browser download behavior, native Web Worker behavior, or animation appearance.

## Visual browser check: not completed

The available cloud browser rejected navigation to the standalone local HTML file because its security policy allows only HTTP and HTTPS. The blocked operation was not bypassed. The final appearance, native browser interactions, mobile rendering and real file-download behavior were therefore not visually verified here.

Suggested user check: open `index.html` in a desktop browser, confirm the campus shows 176 arrivals by 12 minutes, select a road, change its closed status, calculate, then play and export the schedule. The same source is included in the standalone HTML.

## Known sample outputs

| Scenario | Deadline | Initial people | Arrive by deadline | Earliest full evacuation |
|---|---:|---:|---:|---|
| Campus district | 12 min | 180 | 176 | 13 min |
| Aftershock: bridge closed | 12 min | 180 | 110 | 17 min |
| Shelters at capacity | 12 min | 180 | 120 | Not feasible: only 120 total spaces |
| Small example: 10 people | 3 min | 10 | 6 | 5 min |

These are actual computed outputs from the included datasets. A different edit can produce a different result. Network edits and deadline changes deliberately clear the old plan until recalculation.
