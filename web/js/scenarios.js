/* scenarios.js: the group's own test data (same values as scenarios.py). */
(function (root) {
  "use strict";
  const SC = {
    banker: {
      A: { label: "Scenario A: safe state (5 × 3)",
        allocation: [[1,1,0],[2,0,1],[1,2,1],[0,1,1],[2,0,2]],
        maximum:    [[4,3,2],[3,1,2],[5,2,3],[1,2,3],[3,2,4]],
        available:  [2,1,2] },
      F0: { label: "Scenario F: zero Available (boundary)",
        allocation: [[1,0,1],[1,1,0],[0,1,1]],
        maximum:    [[2,1,1],[1,1,0],[1,1,2]],
        available:  [0,0,0] },
      FX: { label: "Scenario F: Allocation > Max (invalid)",
        allocation: [[0,1,0],[3,0,0],[3,0,2]],
        maximum:    [[7,5,3],[2,2,2],[9,0,2]],
        available:  [3,3,2] },
    },
    requests: [
      { label: "B · P0 (0,2,0): exceeds Available", pid: "P0", req: "0,2,0" },
      { label: "C · P4 (1,1,1): unsafe", pid: "P4", req: "1,1,1" },
      { label: "P1 (1,0,1): granted", pid: "P1", req: "1,0,1" },
      { label: "F · P9: bad id", pid: "P9", req: "1,0,0" },
      { label: "F · negative", pid: "P0", req: "-1,0,0" },
      { label: "F · beyond Need", pid: "P1", req: "2,0,0" },
    ],
    detection: {
      D1: { label: "D1 · single-instance circular wait", model: "single",
        allocation: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
        request:    [[0,1,0,0],[0,0,1,0],[1,0,0,0],[0,0,0,0]],
        available:  [0,0,0,0] },
      D2: { label: "D2 · multi-instance confirmed deadlock", model: "multi",
        allocation: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[1,1,0,0],[0,0,0,1]],
        request:    [[0,1,0,0],[0,0,1,0],[1,0,0,0],[0,0,1,0],[0,0,0,0]],
        available:  [0,0,0,0] },
      D3: { label: "D3 · multi-instance: cycle but NO deadlock", model: "multi",
        allocation: [[1,0],[0,1],[1,0],[0,1]],
        request:    [[0,1],[1,0],[0,0],[0,0]],
        available:  [0,0] },
    },
    prevention: {
      names: ["Printer", "Scanner", "Disk"],
      programs: { 0: [0,1], 1: [1,2], 2: [2,0] },
      burst: { 0: 2, 1: 2, 2: 2 },
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = SC;
  else root.SC = SC;
})(typeof window !== "undefined" ? window : globalThis);
