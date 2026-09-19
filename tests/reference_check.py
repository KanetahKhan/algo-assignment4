"""Optional independent check: Python 3 + SciPy + Node.js.

Builds a differently indexed time-expanded graph and checks the JavaScript
Edmonds-Karp answers against SciPy's Dinic maximum-flow implementation.
Not needed to run the app or its dependency-free Node test suite.
"""
import json
import random
import subprocess
from pathlib import Path
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import maximum_flow

ROOT = Path(__file__).resolve().parents[1]
rng = random.Random(4403)
scenarios = [json.loads(p.read_text()) for p in sorted((ROOT / "scenarios").glob("*.json"))]

for case in range(32):
    count = rng.randrange(4, 8)
    nodes = []
    for i in range(count):
        kind = "origin" if i < 2 else "shelter" if i >= count - 2 else "junction"
        nodes.append(dict(id=f"N{i}", name=f"Node {i}", type=kind,
                          population=rng.randrange(1, 12) if kind == "origin" else 0,
                          capacity=rng.randrange(0, 17) if kind == "shelter" else 0,
                          x=80 + i * 100, y=200))
    roads = []
    for i in range(count):
        for j in range(i + 1, count):
            if rng.random() < 0.52:
                a, b = (i, j) if rng.random() < 0.7 else (j, i)
                roads.append(dict(id=f"R{len(roads)}", **{"from": f"N{a}", "to": f"N{b}"},
                                  time=rng.randrange(1, 5), capacity=rng.randrange(1, 6),
                                  blocked=rng.random() < 0.15, bidirectional=rng.random() < 0.5))
    scenarios.append(dict(name=f"Seeded case {case}", nodes=nodes, roads=roads))

script = """
const E=require('./src/engine.js');let input='';
process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 const cases=JSON.parse(input);console.log(JSON.stringify(cases.map(raw=>{
   const s=E.validate(raw);return {values:Array.from({length:61},(_,h)=>E.solveDeadline(s,h,false)),analysis:E.analyze(s,12)};
 })));
});
"""
actual = json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, input=json.dumps(scenarios),
                                   capture_output=True, text=True, check=True).stdout)

def reference(scenario, horizon):
    locations = scenario["nodes"]
    index = {node["id"]: i for i, node in enumerate(locations)}
    shelters = [node for node in locations if node["type"] == "shelter"]
    people = sum(node["population"] for node in locations)
    gate_start = len(locations) * (horizon + 1)
    source, sink = gate_start + len(shelters), gate_start + len(shelters) + 1
    rows, columns, capacities = [], [], []
    def at(node_id, t):
        return index[node_id] * (horizon + 1) + t
    def edge(u, v, c):
        rows.append(u); columns.append(v); capacities.append(c)
    for node in locations:
        if node["type"] == "origin":
            edge(source, at(node["id"], 0), node["population"])
        for t in range(horizon):
            edge(at(node["id"], t), at(node["id"], t + 1), people)
    for road in scenario["roads"]:
        if road["blocked"]:
            continue
        directions = [(road["from"], road["to"])]
        if road["bidirectional"]:
            directions.append((road["to"], road["from"]))
        for start, end in directions:
            for arrival in range(road["time"], horizon + 1):
                edge(at(start, arrival - road["time"]), at(end, arrival), road["capacity"])
    for i, node in enumerate(shelters):
        gate = gate_start + i
        edge(gate, sink, node["capacity"])
        for t in range(horizon + 1):
            edge(at(node["id"], t), gate, people)
    matrix = csr_matrix((np.asarray(capacities, dtype=np.int64), (rows, columns)), shape=(sink + 1, sink + 1))
    return int(maximum_flow(matrix, source, sink, method="dinic").flow_value)

comparisons = 0
for scenario, observed in zip(scenarios, actual):
    expected = [reference(scenario, h) for h in range(61)]
    assert observed["values"] == expected, scenario["name"]
    comparisons += len(expected)
    population = sum(n["population"] for n in scenario["nodes"])
    earliest = next((h for h, flow in enumerate(expected) if flow == population), None)
    completion = observed["analysis"]["completion"]
    if earliest is not None:
        assert completion == {"status": "complete", "minutes": earliest}, scenario["name"]
    else:
        assert completion["status"] in ["impossible", "beyond_limit"]
    # Independent Floyd-Warshall comparison of all origin-to-location distances.
    nodes = scenario["nodes"]
    idx = {n["id"]: i for i, n in enumerate(nodes)}
    distances = [[float("inf")] * len(nodes) for _ in nodes]
    for i in range(len(nodes)):
        distances[i][i] = 0
    for road in scenario["roads"]:
        if road["blocked"]:
            continue
        a, b = idx[road["from"]], idx[road["to"]]
        distances[a][b] = min(distances[a][b], road["time"])
        if road["bidirectional"]:
            distances[b][a] = min(distances[b][a], road["time"])
    for k in range(len(nodes)):
        for i in range(len(nodes)):
            for j in range(len(nodes)):
                distances[i][j] = min(distances[i][j], distances[i][k] + distances[k][j])
    for origin, info in observed["analysis"]["origins"].items():
        for destination, value in info["routes"]["distances"].items():
            d = distances[idx[origin]][idx[destination]]
            assert value == (None if d == float("inf") else d), scenario["name"]
print(f"PASS: {comparisons} max-flow comparisons across {len(scenarios)} scenarios; minimum-time and shortest-path comparisons also passed.")
