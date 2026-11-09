/* testcases.js: runs TC1..TC6 against core.js; the dashboard's Test Cases page renders these rows. */
(function (root) {
  "use strict";
  const DL = root.DL || require("./core.js");
  const SC = root.SC || require("./scenarios.js");
  const { S, P, fmt } = DL;
  const seq = (s) => "⟨" + s.map(P).join(", ") + "⟩";

  function runAll() {
    const A = SC.banker.A, Z = SC.banker.F0, X = SC.banker.FX;
    const rows = [];

    // TC1
    const r1 = DL.safetyAlgorithm(A.allocation, A.maximum, A.available);
    rows.push({ id: "TC1", cond: "Safe state", expected: "Safe sequence found", pass: r1.safe,
      input: `Scenario A, Available ${fmt(A.available)}`,
      actual: `${r1.status}; sequence ${seq(r1.sequence)}; Work ${[A.available, ...r1.steps.map((s) => s.workAfter)].map((w) => w.join(" ")).join(" → ")}`,
      analysis: "Only P1's Need [1,1,1] fits the initial Available. Each finishing process returns its allocation and grows Work, until P0 (Need [3,2,2]) fits last. All five can finish, so the state is safe.",
      trace: r1.steps.map((s) => `${P(s.process)}: Need ${fmt(s.need)} ≤ Work ${fmt(s.workBefore)} → + ${fmt(s.released)} = ${fmt(s.workAfter)}`) });

    // TC2
    const before2 = JSON.stringify([A.allocation, A.available]);
    const r2 = DL.requestResources(A.allocation, A.maximum, A.available, 0, [0, 2, 0]);
    const same2 = before2 === JSON.stringify([A.allocation, A.available]);
    rows.push({ id: "TC2", cond: "Request exceeds Available", expected: "Request not granted immediately",
      pass: r2.status === S.WAIT && same2, input: "P0 requests [0,2,0] (Need [3,2,2], Available [2,1,2])",
      actual: `${r2.status}; state unchanged = ${same2}`,
      analysis: "The request is within Need, so it is legal, but R1 has only 1 free. P0 must wait for a release. The request is neither invalid nor permanently denied.",
      trace: r2.checks.map((c) => `${c.ok ? "✔" : "✘"} ${c.label}: ${c.detail}`) });

    // TC3
    const r3 = DL.requestResources(A.allocation, A.maximum, A.available, 4, [1, 1, 1]);
    const same3 = before2 === JSON.stringify([A.allocation, A.available]);
    rows.push({ id: "TC3", cond: "Request makes state unsafe", expected: "Request denied; state unchanged",
      pass: r3.status === S.DENIED && same3, input: "P4 requests [1,1,1] (Need [1,2,2], Available [2,1,2])",
      actual: `${r3.status}; trial Available ${fmt(r3.trialAvail || [])}; finished ${r3.safety ? r3.safety.sequence.length : 0}/5; restored = ${same3}`,
      analysis: "The request passes the Need and Available checks. In the trial state, Available = [1,0,1]: every process needs R1, and P2 needs 4 × R0, so no process can start. The request is unsafe, so it is denied and rolled back. Unsafe is not deadlocked: nobody is blocked yet.",
      trace: r3.checks.map((c) => `${c.ok ? "✔" : "✘"} ${c.label}: ${c.detail}`) });

    // TC4
    const d1 = SC.detection.D1, d2 = SC.detection.D2, d3 = SC.detection.D3;
    const c1 = DL.findCycle(DL.waitForGraph(d1.allocation, d1.request));
    const det2 = DL.detectionAlgorithm(d2.allocation, d2.request, d2.available);
    const rec = DL.autoRecover(d2.allocation, d2.request, d2.available);
    const after = DL.detectionAlgorithm(rec.alloc, rec.req, rec.avail);
    const c3 = DL.findCycle(DL.waitForGraph(d3.allocation, d3.request));
    const det3 = DL.detectionAlgorithm(d3.allocation, d3.request, d3.available);
    rows.push({ id: "TC4", cond: "Deadlocked scenario", expected: "Deadlock identified by the selected detection method",
      pass: !!c1 && det2.status === S.DEADLOCK && after.status === S.NODEADLOCK && det3.status === S.NODEADLOCK,
      input: "D1 single-instance; D2 and D3 multiple-instance",
      actual: `D1: cycle ${c1 ? seq(c1) : "none"} → DEADLOCK. D2: ${det2.status} ${seq(det2.deadlocked)}; terminate ${rec.log.map((l) => P(l.terminated)).join(", ")} → releases ${rec.log.map((l) => fmt(l.released)).join(", ")} → ${after.status}. D3: cycle ${c3 ? seq(c3) : "none"} but ${det3.status}`,
      analysis: "Single-instance: a wait-for cycle proves deadlock. Multiple instances: the detection algorithm is required, and D3 shows that a cycle alone is not proof. Terminating the cheapest victim releases its resources and lets the others finish.",
      trace: det2.steps.map((s) => `${P(s.process)}: ${s.note} → Work ${fmt(s.workAfter)}`).concat([`Deadlocked: ${seq(det2.deadlocked)}`]) });

    // TC5
    const pv = SC.prevention, names = pv.names.length;
    const sims = [DL.POLICY.NONE, DL.POLICY.ORDER, DL.POLICY.ALL].map((p) => DL.simulate(pv.programs, pv.burst, p, names));
    const label = { none: "No prevention", order: "Resource ordering", all: "All-at-once" };
    rows.push({ id: "TC5", cond: "Prevention policy applied", expected: "Selected deadlock condition eliminated",
      pass: sims[0].deadlocked && !sims[1].deadlocked && !sims[2].deadlocked,
      input: "P0: R0→R1, P1: R1→R2, P2: R2→R0 (single-instance)",
      actual: sims.map((s) => `${label[s.policy]}: ${s.deadlocked ? "DEADLOCK at tick " + s.ticks : "done in " + s.ticks + " ticks"}`).join(" | "),
      analysis: "Ordering removes circular wait (P2 must take R0 before R2). All-at-once removes hold-and-wait, because a waiting process holds nothing. Trade-offs: under ordering, blocked jobs sit on resources they hold; all-at-once needs every need known up front and reduces concurrency.",
      trace: sims.map((s) => `${label[s.policy]}: ${s.trace.length} ticks, held-while-blocked = ${s.heldIdle}`) });

    // TC6
    const out = []; let ok = true;
    const z = DL.safetyAlgorithm(Z.allocation, Z.maximum, Z.available);
    out.push(`Available [0,0,0] → ${z.status} ${seq(z.sequence)} (valid boundary)`); ok = ok && z.safe;
    const b = DL.requestResources(Z.allocation, Z.maximum, Z.available, 1, [1, 0, 0]);
    out.push(`P1 (Need 0) requests [1,0,0] → ${b.status}`); ok = ok && b.status === S.INVALID;
    const c = DL.requestResources(Z.allocation, Z.maximum, Z.available, 0, [1, 0, 0]);
    out.push(`P0 requests [1,0,0] with Available 0 → ${c.status}`); ok = ok && c.status === S.WAIT;
    const d = DL.parsePid("P9", 5);
    out.push(`Process P9 → ${d.error ? S.INVALID : "accepted"}`); ok = ok && !!d.error;
    const e = DL.requestResources(A.allocation, A.maximum, A.available, 0, [-1, 0, 0]);
    out.push(`Request [-1,0,0] → ${e.status}`); ok = ok && e.status === S.INVALID;
    const f = DL.validateState(X.allocation, X.maximum, X.available);
    out.push(`Allocation[P1][R0]=3 > Max 2 → ${f.length ? S.INVALID : "accepted"}`); ok = ok && f.length > 0;
    rows.push({ id: "TC6", cond: "Boundary and invalid inputs", expected: "Correct handling or validation message", pass: ok,
      input: "zero Available, zero Need, P9, negative request, Allocation > Max",
      actual: out.join("; "),
      analysis: "Available = 0 is a valid boundary: P1 has Need 0 and can still finish, so the state is SAFE. A request above Available gets WAIT, not INVALID. A request beyond Need, a non-existent process id, a negative request, and Allocation > Max are all rejected with a message.",
      trace: out });
    return rows;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { runAll };
  else root.TC = { runAll };
})(typeof window !== "undefined" ? window : globalThis);
