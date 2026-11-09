"""Cross-check: run the same scenarios through deadlock_core.py (Python) and core.js (Node) and compare."""
import json, subprocess, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import scenarios as S
from deadlock_core import *

def py():
    A = S.BASE_STATE; out = {}
    r = safety_algorithm(A["allocation"], A["maximum"], A["available"]); out["safe"] = [r.safe, r.sequence, [s["work_after"] for s in r.steps]]
    for name, pid, rq in [("wait", 0, [0,2,0]), ("unsafe", 4, [1,1,1]), ("grant", 1, [1,0,1]), ("beyond", 1, [2,0,0]), ("neg", 0, [-1,0,0]), ("zero", 0, [0,0,0])]:
        out[name] = request_resources(A["allocation"], A["maximum"], A["available"], pid, rq).status
    for av in ([2,2,2],[3,2,2]):
        out["p0_" + "".join(map(str, av))] = request_resources(A["allocation"], A["maximum"], av, 0, [0,2,0]).status
    for k, d in [("D1", S.DETECT_SINGLE), ("D2", S.DETECT_MULTI_DEADLOCK), ("D3", S.DETECT_MULTI_CYCLE_NO_DEADLOCK)]:
        det = detection_algorithm(d["allocation"], d["request"], d["available"])
        out[k] = [det.deadlocked, det.order, find_cycle(wait_for_graph(d["allocation"], d["request"]))]
    log, a, q, v = auto_recover(S.DETECT_MULTI_DEADLOCK["allocation"], S.DETECT_MULTI_DEADLOCK["request"], S.DETECT_MULTI_DEADLOCK["available"])
    out["recover"] = [[int(e["terminated"][1:]) for e in log], v]
    p = S.PREVENTION
    for pol, key in [(POLICY_NONE, "none"), (POLICY_ORDER, "order"), (POLICY_ALL, "all")]:
        r = simulate(p["programs"], p["burst"], pol, p["resource_names"]); out["sim_" + key] = [r.deadlocked, r.ticks, r.held_idle, r.max_concurrent]
    Z = S.ZERO_AVAILABLE_STATE; out["zero_avail"] = safety_algorithm(Z["allocation"], Z["maximum"], Z["available"]).sequence
    return out

JS = r"""
const DL = require('./web/js/core.js'), SC = require('./web/js/scenarios.js'), TC = require('./web/js/testcases.js');
const A = SC.banker.A, out = {};
const r = DL.safetyAlgorithm(A.allocation, A.maximum, A.available); out.safe = [r.safe, r.sequence, r.steps.map(s => s.workAfter)];
for (const [n, p, q] of [["wait",0,[0,2,0]],["unsafe",4,[1,1,1]],["grant",1,[1,0,1]],["beyond",1,[2,0,0]],["neg",0,[-1,0,0]],["zero",0,[0,0,0]]])
  out[n] = DL.requestResources(A.allocation, A.maximum, A.available, p, q).status;
for (const av of [[2,2,2],[3,2,2]]) out["p0_" + av.join("")] = DL.requestResources(A.allocation, A.maximum, av, 0, [0,2,0]).status;
for (const k of ["D1","D2","D3"]) { const d = SC.detection[k], det = DL.detectionAlgorithm(d.allocation, d.request, d.available);
  out[k] = [det.deadlocked, det.order, DL.findCycle(DL.waitForGraph(d.allocation, d.request))]; }
const d2 = SC.detection.D2, rc = DL.autoRecover(d2.allocation, d2.request, d2.available); out.recover = [rc.log.map(l => l.terminated), rc.avail];
const pv = SC.prevention; for (const k of ["none","order","all"]) { const s = DL.simulate(pv.programs, pv.burst, k, 3); out["sim_" + k] = [s.deadlocked, s.ticks, s.heldIdle, s.maxConcurrent]; }
const Z = SC.banker.F0; out.zero_avail = DL.safetyAlgorithm(Z.allocation, Z.maximum, Z.available).sequence;
out.__tc = TC.runAll().map(t => t.id + ":" + (t.pass ? "PASS" : "FAIL"));
console.log(JSON.stringify(out));
"""
root = os.path.join(os.path.dirname(__file__), "..", "..")
js = json.loads(subprocess.check_output(["node", "-e", JS], cwd=root))
tc = js.pop("__tc")
p = json.loads(json.dumps(py()))
STATUS_MAP = {"DENIED (UNSAFE)": "DENIED (UNSAFE)", "NO-OP (ZERO REQUEST)": "NO-OP"}
bad = 0
for k in p:
    pv = STATUS_MAP.get(p[k], p[k]) if isinstance(p[k], str) else p[k]
    ok = pv == js.get(k)
    bad += not ok
    print(f"{'OK  ' if ok else 'DIFF'} {k:12} py={pv}  js={js.get(k)}")
print("JS test cases:", " ".join(tc))
print("ALL MATCH" if not bad else f"{bad} MISMATCHES"); sys.exit(1 if bad else 0)
