(function (root) {
  'use strict';
  const origin = (id, name, x, y, population) => ({ id, name, x, y, type: 'origin', population, capacity: 0 });
  const junction = (id, name, x, y) => ({ id, name, x, y, type: 'junction', population: 0, capacity: 0 });
  const shelter = (id, name, x, y, capacity) => ({ id, name, x, y, type: 'shelter', population: 0, capacity });
  const road = (id, from, to, time, capacity, blocked = false, bidirectional = true) => ({ id, from, to, time, capacity, blocked, bidirectional });
  const campus = {
    name: 'Campus district',
    description: 'A synthetic campus with three residential areas and two shelters. Block the central bridge to see routes and arrival counts change.',
    nodes: [origin('A', 'North residence', 110, 110, 70), origin('B', 'West residence', 100, 365, 60),
      origin('C', 'Student housing', 345, 410, 50), junction('J1', 'Library crossing', 325, 150),
      junction('J2', 'Market junction', 390, 305), junction('J3', 'Bridge east', 590, 240),
      shelter('S1', 'Open field', 775, 105, 110), shelter('S2', 'Community hall', 790, 380, 100)],
    roads: [road('R1', 'A', 'J1', 2, 10), road('R2', 'B', 'J2', 2, 8), road('R3', 'C', 'J2', 1, 7),
      road('R4', 'J1', 'J2', 2, 6), road('R5', 'J1', 'J3', 2, 12), road('R6', 'J2', 'J3', 2, 10),
      road('R7', 'J3', 'S1', 2, 12), road('R8', 'J3', 'S2', 2, 10), road('R9', 'J1', 'S1', 5, 4),
      road('R10', 'J2', 'S2', 5, 4)]
  };
  const blocked = JSON.parse(JSON.stringify(campus));
  blocked.name = 'Aftershock: bridge closed';
  blocked.description = 'The central bridge and the north bypass are damaged. Reopen roads or increase the deadline to compare evacuation outcomes.';
  blocked.roads.find((r) => r.id === 'R6').blocked = true;
  blocked.roads.find((r) => r.id === 'R9').blocked = true;
  const limited = JSON.parse(JSON.stringify(campus));
  limited.name = 'Shelters at capacity';
  limited.description = 'Only 120 shelter spaces are available for 180 people. More time alone cannot evacuate everyone; edit shelter capacity to resolve the shortage.';
  limited.nodes.find((n) => n.id === 'S1').capacity = 70;
  limited.nodes.find((n) => n.id === 'S2').capacity = 50;
  const teaching = {
    name: 'Small example · 10 people',
    description: 'One road, 3 people per minute, 2 minutes of travel. Six people arrive by minute 3; everyone can arrive by minute 5.',
    nodes: [origin('A', 'Residential block', 190, 250, 10), shelter('S', 'Safe assembly area', 700, 250, 10)],
    roads: [road('R1', 'A', 'S', 2, 3, false, false)]
  };
  const scenarios = [campus, blocked, limited, teaching];
  if (typeof module === 'object' && module.exports) module.exports = scenarios;
  else root.EVACUATION_SCENARIOS = scenarios;
})(typeof globalThis !== 'undefined' ? globalThis : this);
