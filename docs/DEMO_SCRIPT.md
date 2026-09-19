# Three-minute demonstration outline

Before recording: open the app, maximize the browser, use the Campus district scenario, set the deadline to 12 minutes, and calculate. Keep browser zoom around 90–100% so the map and results fit. All data is synthetic. Practice once to find each control.

## 0:00–0:25 — Problem

“Our project is SafeRoute, an earthquake-evacuation simulator. After an earthquake, some roads may be blocked. Even when a route is open, its capacity and travel time matter, and shelters have limited space. Our goal is to maximize how many people reach a shelter before a chosen deadline.”

Show the residential areas, shelters, road labels and deadline slider.

## 0:25–1:00 — Working plan

“This campus example has 180 people. With a 12-minute deadline, the program finds a feasible plan for 176 arrivals. The earliest time at which everyone can arrive is 13 minutes.”

Press Play. Explain that dots represent scheduled groups and the timeline counts actual arrivals. Show shelter allocations in Plan summary. The plan respects per-minute road-entry capacities and total shelter space.

## 1:00–1:35 — Damage changes the answer

Select road R6 in the map or editor. Check “Road closed / damaged.” Point out that the old result is cleared. Calculate again and show the comparison against the original scenario at the same deadline. Read the displayed result rather than memorizing a number for an unpracticed edit.

“The blocked road is removed from all algorithms. Reachability and shortest paths update, and the flow planner recomputes a valid schedule.”

## 1:35–2:15 — Algorithms

Open Algorithm trace.

“BFS checks reachable locations. Dijkstra uses road travel time to find a fastest individual route. That alone cannot evacuate everyone because a short road might have low capacity. We therefore build a graph with one copy of every location per minute and run Edmonds–Karp max-flow. Road edges advance time, waiting edges represent queues, and shared shelter gates enforce total space. Binary search repeats this calculation to find the earliest full evacuation.”

## 2:15–2:40 — A limitation that the model handles

Switch to Shelters at capacity. It has only 120 spaces for 180 people. Show “Not feasible.” Increase the deadline if desired and calculate again.

“More time cannot solve missing shelter space. The program distinguishes that from a deadline that is merely too short.”

## 2:40–3:00 — A small verifiable example and wrap-up

Switch to Small example · 10 people. The deadline changes to 3 minutes.

“This road admits three people each minute and takes two minutes to traverse. Six people arrive by minute three, and the earliest full evacuation is minute five. We can also edit networks, import and export JSON, and export the complete schedule as CSV. Everything runs offline.”

The report must include your own uploaded demonstration-video link. This outline does not create or upload a video.
